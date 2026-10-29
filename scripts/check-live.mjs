// Finds which YouTube channels in _data/streams.json are live right now, and with
// which videos, by reading each channel's /streams page. Writes live.json for the
// TV wall (the browser can't read YouTube pages itself). Run by .github/workflows/live.yml.
//   node scripts/check-live.mjs [out-file]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { channelKey, streamsUrl } = require('../assets/js/youtube-channel.js');

const OUT = process.argv[2] || 'live.json';
const PARALLEL = 4;

const file = JSON.parse(readFileSync(new URL('../_data/streams.json', import.meta.url), 'utf8'));
const keys = [...new Set(file.data.flatMap((s) => (s.extras || []).map((x) => channelKey(x && x.link)).filter(Boolean)))];

/* YouTube serves two page layouts: "var ytInitialData = {…};" or a <script id="yt-initial-data" type="application/json"> */
function initialData(html) {
    const m =
        html.match(/<script[^>]*\bid="yt-initial-data"[^>]*>(\{.*?\})<\/script>/s) ||
        html.match(/ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s);
    return m ? JSON.parse(m[1]) : null;
}

/* Live videos carry a LIVE thumbnail badge: lockupViewModel (current layout) or videoRenderer (older one). */
function liveVideos(data) {
    const found = new Map();
    (function walk(node) {
        if (!node || typeof node !== 'object') return;
        const lockup = node.lockupViewModel;
        if (lockup && lockup.contentId) {
            if (JSON.stringify(lockup).includes('"THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"')) {
                found.set(lockup.contentId, lockup.metadata?.lockupMetadataViewModel?.title?.content || '');
            }
            return;
        }
        const video = node.videoRenderer || node.gridVideoRenderer;
        if (video && video.videoId) {
            const text = JSON.stringify(video);
            if (text.includes('"style":"LIVE"') || text.includes('"BADGE_STYLE_TYPE_LIVE_NOW"')) {
                found.set(video.videoId, video.title?.runs?.[0]?.text || video.title?.simpleText || '');
            }
            return;
        }
        for (const key in node) walk(node[key]);
    })(data);
    return [...found].map(([id, title]) => ({ id, title }));
}

async function check(key) {
    const res = await fetch(streamsUrl(key), {
        headers: {
            'Accept-Language': 'ja,en;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
            Cookie: 'CONSENT=YES+1; SOCS=CAI',
        },
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { error: 'HTTP ' + res.status };
    const html = await res.text();
    const data = initialData(html);
    if (!data) {
        /* say what came back instead (a consent or bot-check page, a cut-off download…) */
        const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || 'no title';
        return { error: `no page data (${html.length} bytes, "${title.trim().slice(0, 60)}", ${res.url})`, retry: true };
    }
    const id = data.metadata?.channelMetadataRenderer?.externalId || (html.match(/"externalId":"(UC[\w-]{22})"/) || [])[1] || null;
    return { id, live: liveVideos(data) };
}

// The last published live.json, if any.
let previous = {};
try {
    const res = await fetch(`https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'TrainStream/trainstream.github.io'}/live-data/live.json`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) previous = (await res.json()).channels || {};
} catch (error) {
    /* first run, or not reachable: start fresh */
}

const channels = {};
let next = 0;
async function worker() {
    while (next < keys.length) {
        const key = keys[next++];
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                channels[key] = await check(key);
            } catch (error) {
                channels[key] = { error: String(error.message || error), retry: true };
            }
            if (!channels[key].retry || attempt === 2) break;
            console.log(`${key}: ${channels[key].error}; trying again.`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        delete channels[key].retry;
        if (channels[key].error) {
            /* keep the last known channel ID, so the TV wall can still fall back to the channel embed */
            if (previous[key] && previous[key].id) channels[key].id = previous[key].id;
            console.warn(`::warning::${key}: ${channels[key].error}`);
        }
    }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

const ok = Object.values(channels).filter((c) => !c.error);
const live = ok.filter((c) => c.live.length);
console.log(`${keys.length} channels: ${ok.length} read, ${live.length} live, ${live.reduce((n, c) => n + c.live.length, 0)} live videos.`);
if (keys.length && !ok.length) {
    console.error('::error::Could not read any channel page; keeping the last live.json.');
    process.exit(1);
}

const sorted = Object.fromEntries(Object.keys(channels).sort().map((k) => [k, channels[k]]));
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), channels: sorted }, null, 1) + '\n');
