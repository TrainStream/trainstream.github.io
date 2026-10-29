// Handles stream submissions made as GitHub issues (from /submit/ or the issue form).
//
// - Every submission is validated and gets one bot comment with the result.
// - Submissions from trusted people (repo collaborators with write access, or
//   anyone listed in .github/publishers.yml) are published right away.
// - Everyone else's submission waits until a trusted person adds the
//   "approved" label (or publishes it from the /submit/ review queue).
// - Publishing mirrors the third-party pictures into /pictures/submissions/,
//   adds the entry to _data/streams.json in the same format the original
//   trainstream-editor writes, commits, and closes the issue.
//
// Issue text is untrusted: it is only ever parsed as JSON and validated, never
// run through a shell.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../assets/js/stream-rules.js');

const ROOT = new URL('../', import.meta.url);
const STREAMS_PATH = new URL('_data/streams.json', ROOT);
const TAGS_PATH = new URL('_data/tags.json', ROOT);
const PUBLISHERS_PATH = new URL('.github/publishers.yml', ROOT);
const MARK = '<!-- trainstream-bot -->';
const LABELS = {
    submission: { color: '00913a', description: 'A suggested stream for the camera list' },
    approved: { color: 'ff5fa2', description: 'Maintainer approved: publish this submission' },
    'needs-fix': { color: 'e60012', description: 'The submission has problems to fix' },
    published: { color: '1e5aa8', description: 'This submission is live on the site' },
};
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
const branch = event.repository.default_branch;

async function api(method, path, body) {
    const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'trainstream-bot',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const error = new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
        error.status = response.status;
        throw error;
    }
    return response.status === 204 ? null : response.json();
}

function git(...args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function readPublishers() {
    if (!existsSync(PUBLISHERS_PATH)) return [];
    return readFileSync(PUBLISHERS_PATH, 'utf8')
        .split('\n')
        .map((line) => /^\s*-\s*@?([A-Za-z0-9-]+)\s*(#.*)?$/.exec(line))
        .filter(Boolean)
        .map((m) => m[1].toLowerCase());
}

const publishers = readPublishers();

async function isTrusted(login) {
    if (!login) return false;
    if (publishers.includes(login.toLowerCase())) return true;
    try {
        const result = await api('GET', `/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`);
        return ['admin', 'maintain', 'write'].includes(result.permission) || ['admin', 'maintain', 'write'].includes(result.role_name);
    } catch {
        return false;
    }
}

async function ensureLabels() {
    for (const [name, meta] of Object.entries(LABELS)) {
        try {
            await api('POST', `/repos/${repo}/labels`, { name, ...meta });
        } catch (error) {
            if (error.status !== 422) console.warn(`label ${name}: ${error.message}`);
        }
    }
}

async function addLabels(names) {
    await api('POST', `/repos/${repo}/issues/${issue.number}/labels`, { labels: names });
}

async function removeLabel(name) {
    try {
        await api('DELETE', `/repos/${repo}/issues/${issue.number}/labels/${encodeURIComponent(name)}`);
    } catch (error) {
        if (error.status !== 404) throw error;
    }
}

async function botComment(text) {
    const body = `${MARK}\n${text}`;
    const comments = await api('GET', `/repos/${repo}/issues/${issue.number}/comments?per_page=100`);
    const mine = comments.find((c) => c.user && c.user.type === 'Bot' && c.body.includes(MARK));
    if (mine) await api('PATCH', `/repos/${repo}/issues/comments/${mine.id}`, { body });
    else await api('POST', `/repos/${repo}/issues/${issue.number}/comments`, { body });
}

function looksLikeImage(buffer, ext) {
    const hex = buffer.subarray(0, 12).toString('hex');
    if (ext === 'jpg') return hex.startsWith('ffd8ff');
    if (ext === 'png') return hex.startsWith('89504e47');
    if (ext === 'gif') return hex.startsWith('47494638');
    if (ext === 'webp') return hex.startsWith('52494646') && buffer.subarray(8, 12).toString() === 'WEBP';
    return false;
}

async function mirrorImage(url, baseName) {
    const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'Mozilla/5.0 (trainstream-bot; +https://trainstream.github.io/)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) throw new Error(`not an image (${type || 'unknown type'})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error('bigger than 5 MB');
    if (!looksLikeImage(buffer, ext)) throw new Error('file content is not an image');
    return { path: `pictures/submissions/${baseName}.${ext}`, buffer };
}

async function publish(entry, editOf) {
    const slug = rules.slugify(entry.name).replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'stream';
    const stamp = Date.now();
    const mirrorNotes = [];
    const mirrored = [];
    for (const [i, image] of entry.images.entries()) {
        if (!/^https?:\/\//i.test(image.src)) continue;
        try {
            const file = await mirrorImage(image.src, `${slug}-${stamp}-${i + 1}`);
            mirrored.push(file);
            image.src = `/${file.path}`;
        } catch (error) {
            mirrorNotes.push(`Picture ${i + 1} stays a third-party link (could not copy it: ${error.message}).`);
        }
    }

    git('config', 'user.name', 'github-actions[bot]');
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');

    let replaced = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
        git('fetch', 'origin', branch);
        git('reset', '--hard', `origin/${branch}`);
        const file = JSON.parse(readFileSync(STREAMS_PATH, 'utf8'));
        const result = rules.upsert(file, entry, editOf);
        if (editOf && !result.replaced) throw new Error(`No stream with id "${editOf}" to edit.`);
        replaced = result.replaced;
        writeFileSync(STREAMS_PATH, rules.serializeFile(result.file));
        git('add', '_data/streams.json');
        for (const file of mirrored) {
            mkdirSync(new URL('pictures/submissions/', ROOT), { recursive: true });
            writeFileSync(new URL(file.path, ROOT), file.buffer);
            git('add', file.path);
        }
        git('commit', '-m', `${replaced ? 'Update' : 'Add'} stream: ${entry.name} (#${issue.number})`);
        try {
            git('push', 'origin', `HEAD:${branch}`);
            break;
        } catch (error) {
            if (attempt === 3) throw error;
        }
    }
    const sha = git('rev-parse', 'HEAD');

    // Pushes made with GITHUB_TOKEN don't start a Pages build on their own.
    try {
        await api('POST', `/repos/${repo}/pages/builds`);
    } catch (error) {
        mirrorNotes.push(`(Could not request a Pages build: ${error.status}. The site updates on the next push.)`);
    }
    return { sha, replaced, mirrorNotes };
}

function summary(entry) {
    const lines = [
        `**${entry.name}** — ${entry.isAlive ? '運転中 live' : '運休 dead'}`,
        `Tags: ${entry.tags}`,
        `Pictures: ${entry.images.length}, links: ${entry.extras.filter((e) => e.link).length}`,
    ];
    if (entry.region) lines.push(`Region: ${entry.region}`);
    return lines.map((l) => `> ${l}`).join('\n');
}

async function main() {
    if (issue.pull_request || issue.state !== 'open') return;
    const labels = issue.labels.map((l) => l.name);
    if (labels.includes('published')) return;
    if (event.action === 'labeled' && event.label.name !== 'approved') return;
    if (!labels.includes('submission') && !/###\s*Stream data/i.test(issue.body || '')) return;

    await ensureLabels();
    if (!labels.includes('submission')) await addLabels(['submission']);

    let approver = null;
    if (event.action === 'labeled') {
        if (await isTrusted(event.sender.login)) {
            approver = event.sender.login;
        } else {
            await removeLabel('approved');
            await botComment(`⚠️ @${event.sender.login} only maintainers and listed publishers can approve submissions.`);
            return;
        }
    }

    const parsed = rules.extractSubmission(issue.body);
    if (parsed.error) {
        await addLabels(['needs-fix']);
        await botComment(`❌ ${parsed.error}\n\nEdit the issue (… menu → Edit) to fix it; I will check again automatically.`);
        return;
    }

    const author = issue.user.login;
    const authorTrusted = await isTrusted(author);
    const trusted = authorTrusted || !!approver;
    const editOf = String(parsed.data.editOf || '').trim();
    const knownTags = JSON.parse(readFileSync(TAGS_PATH, 'utf8')).map((t) => t.slug);
    const entry = rules.cleanEntry({ ...parsed.data, addedAt: parsed.data.addedAt || (editOf ? '' : today()) });

    const errors = rules.validateEntry(entry, { knownTags, allowRelative: trusted });
    if (errors.length) {
        await addLabels(['needs-fix']);
        await removeLabel('approved');
        await botComment(
            `❌ This submission needs a few fixes before it can be published:\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\n` +
                'Edit the issue (… menu → Edit) and change the JSON, or make a new suggestion at https://trainstream.github.io/submit/ . I will check again automatically.'
        );
        return;
    }
    await removeLabel('needs-fix');

    if (!trusted) {
        await botComment(
            `✅ Thanks! The submission looks valid and is waiting for a maintainer to review it.\n\n${summary(entry)}\n\n` +
                '_Maintainers: edit the JSON in this issue if needed, then add the `approved` label to publish it, or use the review queue at https://trainstream.github.io/submit/ ._'
        );
        return;
    }

    const result = await publish(entry, editOf);
    const by = approver ? `approved by @${approver}` : `published by @${author}`;
    await botComment(
        `🎉 ${result.replaced ? 'Updated' : 'Published'}! (${by}) Commit ${result.sha.slice(0, 7)}.\n\n${summary(entry)}\n\n` +
            `It will show up on https://trainstream.github.io/ in a minute or two.` +
            (result.mirrorNotes.length ? `\n\n${result.mirrorNotes.map((n) => `- ${n}`).join('\n')}` : '')
    );
    await addLabels(['published']);
    await removeLabel('approved');
    await api('PATCH', `/repos/${repo}/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
}

main().catch(async (error) => {
    console.error(error);
    try {
        await botComment(`💥 Something went wrong while processing this submission: \`${String(error.message).slice(0, 300)}\`. A maintainer will have a look.`);
    } catch {}
    process.exit(1);
});
