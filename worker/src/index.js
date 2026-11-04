/*
 * TrainStream anonymous submissions: a small Cloudflare Worker (free plan).
 *
 * The submit page POSTs a stream entry here as JSON. The Worker
 *   1. only accepts requests from the site's own origin (CORS),
 *   2. checks a Cloudflare Turnstile token (stops bots),
 *   3. rate-limits each IP address,
 *   4. refuses new ones while MAX_PENDING_ANON anonymous suggestions wait for review,
 *   5. validates the entry with the same assets/js/stream-rules.js the Action uses,
 *      only allows pictures from well-known image hosts, and checks a word list,
 *   6. opens a "submission" issue with a neutral title, an "automated" notice and
 *      the data folded away, using a GitHub token kept as a Worker secret.
 *
 * GET /status tells the submit page whether anonymous sending is open, so it can
 * show a "queue is full" notice before anyone starts filling in the form.
 *
 * The issue carries ANON_MARK. scripts/process-submission.mjs treats every issue
 * with that marker as untrusted, whoever's token opened it, so anonymous
 * suggestions always wait for a maintainer to add the "approved" label.
 *
 * Nothing about the visitor is stored or forwarded: the IP address is only
 * used for the rate limit and the Turnstile check, and the issue only says
 * "sent anonymously".
 */
import rules from '../../assets/js/stream-rules.js';

// Keep in sync with scripts/process-submission.mjs.
const ANON_MARK = '<!-- trainstream-anonymous -->';
const MAX_BODY_BYTES = 64 * 1024;
const TURNSTILE_ACTION = 'submit-stream';
const ANON_TITLE = 'Anonymous suggestion';

function corsHeaders(env, origin) {
    const allowed = allowedOrigins(env);
    const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
    if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

function allowedOrigins(env) {
    return String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function reply(env, origin, status, data) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env, origin) },
    });
}

async function verifyTurnstile(env, token, ip) {
    if (!token || typeof token !== 'string' || token.length > 2048) return false;
    const expectedHostnames = String(env.TURNSTILE_HOSTNAMES || '')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
    if (!expectedHostnames.length || !env.TURNSTILE_SECRET) return false;
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip || '' }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && result.action === TURNSTILE_ACTION && expectedHostnames.includes(result.hostname);
}

// The on/off switch is `anonymous_submissions` in the repo's _config.yml. It is read
// live (cached for a minute), so a maintainer can turn this off with one commit.
// If it can't be read, the Worker stays closed.
async function switchedOn(env) {
    try {
        const url = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH || 'master'}/_config.yml`;
        const response = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
        if (!response.ok) return false;
        return /^anonymous_submissions:[ \t]*true[ \t]*(#.*)?$/m.test(await response.text());
    } catch {
        return false;
    }
}

async function knownTags(env) {
    // The tag list lives in the repo; read it at runtime so new tags work without a redeploy.
    try {
        const url = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH || 'master'}/_data/tags.json`;
        const response = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
        if (!response.ok) return null;
        return (await response.json()).map((t) => t.slug);
    } catch {
        return null; // The Action checks tags again, so skipping here is safe.
    }
}

function issueBody(entry) {
    // Escape ` and < inside the JSON (still valid JSON) so nothing a visitor types can
    // close the code block, close the <details>, or add or fake an HTML comment marker.
    const json = JSON.stringify(entry, null, 2).replace(/`/g, '\\u0060').replace(/</g, '\\u003c');
    return [
        ANON_MARK,
        '> [!NOTE]',
        '> **Automated anonymous suggestion.** This issue was opened automatically by the anonymous form at https://trainstream.github.io/submit/ .',
        '> Everything below was written by a visitor without a GitHub account and has **not been reviewed yet**. Picture links point to outside sites.',
        '> Nothing is published unless a maintainer approves it.',
        '',
        '### Stream data',
        '',
        '<details><summary>Show the suggested data (unreviewed)</summary>',
        '',
        '```json',
        json,
        '```',
        '',
        '</details>',
    ].join('\n');
}

function ghHeaders(env) {
    return {
        Authorization: `Bearer ${String(env.GITHUB_TOKEN || "").trim()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'trainstream-anonymous-submit',
    };
}

function maxPending(env) {
    const n = parseInt(env.MAX_PENDING_ANON, 10);
    return Number.isFinite(n) && n > 0 ? n : 10;
}

// How many anonymous suggestions are open (waiting for review). null if GitHub can't be asked.
async function pendingCount(env) {
    try {
        const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues?labels=submission&state=open&per_page=100`, {
            headers: ghHeaders(env),
        });
        if (!response.ok) {
            console.error('GitHub count', response.status);
            return null;
        }
        const issues = await response.json();
        return issues.filter((i) => !i.pull_request && String(i.body || '').includes(ANON_MARK)).length;
    } catch (error) {
        console.error(error);
        return null;
    }
}

// Word list kept as the BLOCKED_WORDS secret (comma or newline separated) so it is
// not public and trolls can't read it to work around it.
function blockedWords(env) {
    return String(env.BLOCKED_WORDS || '')
        .split(/[,\n]/)
        .map((w) => normalize(w).replace(/[^\p{L}\p{N}]+/gu, ''))
        .filter(Boolean);
}

function normalize(text) {
    const leet = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
    return String(text)
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '')
        .replace(/[013457@$!]/g, (c) => leet[c]);
}

function stringsIn(value, out = []) {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach((v) => stringsIn(v, out));
    return out;
}

// Short Latin words must match a whole word (so "class" never hits a 3-letter word);
// longer words and non-Latin words (Japanese has no spaces) also match inside text.
function hasBlockedWord(env, entry) {
    const words = blockedWords(env);
    if (!words.length) return false;
    const text = normalize(stringsIn(entry).join(' '));
    const tokens = new Set(text.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const collapsed = text.replace(/[^\p{L}\p{N}]+/gu, '');
    return words.some((w) => tokens.has(w) || ((w.length >= 5 || /[^\x00-\x7f]/.test(w)) && collapsed.includes(w)));
}

async function status(env) {
    if (!(await switchedOn(env))) return { open: false, off: true };
    const pending = await pendingCount(env);
    const max = maxPending(env);
    if (pending === null) return { open: true, pending: null, max };
    return { open: pending < max, full: pending >= max, pending, max };
}

// Cached for 30 seconds per Cloudflare location, so page views don't use up the GitHub API.
async function handleStatus(request, env, origin, ctx) {
    const cache = caches.default;
    const key = new Request('https://status.cache/trainstream-anon-status');
    let data;
    const hit = await cache.match(key);
    if (hit) data = await hit.json();
    else {
        data = await status(env);
        const stored = new Response(JSON.stringify(data), { headers: { 'Cache-Control': 'max-age=30', 'Content-Type': 'application/json' } });
        ctx.waitUntil(cache.put(key, stored));
    }
    return reply(env, origin, 200, data);
}

function fullMessage(max) {
    return `The anonymous queue is full: ${max} anonymous suggestions are already waiting for review. Please try again later, or use "Send suggestion via GitHub" instead.`;
}

async function openIssue(env, title, body) {
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, labels: ['submission'] }),
    });
    if (!response.ok) {
        console.error('GitHub', response.status, await response.text());
        return null;
    }
    return response.json();
}

async function handleSubmit(request, env, origin) {
    if (!allowedOrigins(env).includes(origin)) return reply(env, origin, 403, { error: 'This address only takes submissions from the TrainStream site.' });
    if (!(request.headers.get('Content-Type') || '').includes('application/json')) return reply(env, origin, 415, { error: 'Send JSON.' });

    if (!(await switchedOn(env))) {
        return reply(env, origin, 403, { error: 'Anonymous suggestions are switched off right now. Please use "Send suggestion via GitHub" instead.', off: true });
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (env.SUBMIT_LIMITER) {
        const { success } = await env.SUBMIT_LIMITER.limit({ key: ip || 'unknown' });
        if (!success) return reply(env, origin, 429, { error: 'Too many suggestions in a short time. Please wait a minute and try again.' });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(env, origin, 413, { error: 'This suggestion is too big.' });
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return reply(env, origin, 400, { error: 'Not valid JSON.' });
    }
    if (!payload || typeof payload !== 'object' || !payload.entry || typeof payload.entry !== 'object' || Array.isArray(payload.entry)) {
        return reply(env, origin, 400, { error: 'Missing the stream entry.' });
    }

    if (!(await verifyTurnstile(env, payload.turnstileToken, ip))) {
        return reply(env, origin, 403, { error: 'The "I am human" check failed or expired. Please do it again.' });
    }

    const editOf = typeof payload.entry.editOf === 'string' ? payload.entry.editOf.trim().slice(0, 200) : '';
    const entry = rules.cleanEntry(payload.entry);
    const errors = rules.validateEntry(entry, { knownTags: await knownTags(env), allowRelative: !!editOf, imageHosts: rules.ANON_IMAGE_HOSTS });
    if (errors.length) return reply(env, origin, 422, { error: 'The suggestion has problems.', errors });
    if (hasBlockedWord(env, { ...entry, editOf })) {
        return reply(env, origin, 422, { error: 'The suggestion contains words that are not allowed here. If you think this is a mistake, please use "Send suggestion via GitHub" instead.' });
    }

    // Checked last, right before opening the issue, so the count is as fresh as possible.
    const pending = await pendingCount(env);
    if (pending === null) return reply(env, origin, 503, { error: 'Could not check the review queue. Please try again in a few minutes.' });
    if (pending >= maxPending(env)) return reply(env, origin, 429, { error: fullMessage(maxPending(env)), full: true });

    const out = editOf ? { ...entry, editOf } : entry;
    // Neutral title: the visitor's text never shows in the issue list or in notifications.
    const title = (editOf ? '[Stream edit] ' : '[Stream] ') + ANON_TITLE;
    const issue = await openIssue(env, title, issueBody(out));
    if (!issue) return reply(env, origin, 502, { error: 'Could not reach GitHub. Please try again later, or use "Copy JSON".' });
    return reply(env, origin, 201, { ok: true, number: issue.number, url: issue.html_url });
}

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') || '';
        const { pathname } = new URL(request.url);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
        if (pathname === '/submit' && request.method === 'POST') {
            try {
                return await handleSubmit(request, env, origin);
            } catch (error) {
                console.error(error);
                return reply(env, origin, 500, { error: 'Something went wrong. Please try again later.' });
            }
        }
        if (pathname === '/status' && request.method === 'GET') {
            try {
                return await handleStatus(request, env, origin, ctx);
            } catch (error) {
                console.error(error);
                return reply(env, origin, 500, { error: 'Status unavailable.' });
            }
        }
        if (pathname === '/' && request.method === 'GET') {
            return new Response('TrainStream anonymous submissions. POST /submit from https://trainstream.github.io/submit/ (GET /status shows whether it is open)\n', {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }
        return reply(env, origin, 404, { error: 'Not found.' });
    },
};
