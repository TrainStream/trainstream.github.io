# Anonymous submissions (Cloudflare Worker)

This Worker lets people **without a GitHub account** send stream suggestions from <https://trainstream.github.io/submit/>. It runs on the free Workers plan (100,000 requests a day, far more than needed).

How it works:

1. The submit page shows a Cloudflare Turnstile "I am human" check and a **🕶️ Send anonymously** button.
2. The button POSTs the stream entry to this Worker. The Worker only accepts the site's own origin, checks the Turnstile token, allows about 3 suggestions per IP per minute, and validates the entry with `assets/js/stream-rules.js` (the same rules the Action uses).
3. It opens a `submission` issue with a GitHub token that is stored as a Worker secret. The issue contains the marker `<!-- trainstream-anonymous -->`.
4. The usual **Stream submissions** Action checks it and comments. Anonymous suggestions are **never auto-published**, even if the token belongs to a maintainer or a listed publisher. A maintainer publishes them with the `approved` label or the review queue, as with any other suggestion.

## Protection against trolling

- **Neutral titles.** Anonymous issues are always called `[Stream] Anonymous suggestion`, so a visitor's text never shows in the issue list or in notifications. The review queue on `/submit/` (signed in) shows the suggested name.
- **Clear notice, data folded away.** Each issue starts with a note that it was opened automatically and is unreviewed. The data sits in a collapsed block, and the bot folds its summary away too.
- **Queue cap.** While `MAX_PENDING_ANON` (in `wrangler.jsonc`, default **10**) anonymous suggestions are open, the Worker refuses new ones. The submit page asks `GET /status` and shows a "paused, come back later" notice at the top before anyone starts typing. It opens again by itself as soon as you publish or close some.
- **Word list.** The `BLOCKED_WORDS` secret holds words that are refused (comma separated; matching ignores case, accents, l33t spelling and spacing for longer words). It is a secret on purpose, so trolls can't read it. Replace it with `npx wrangler secret put BLOCKED_WORDS`, or in the dashboard (Settings → Variables and Secrets). Secrets can't be read back, so keep your own copy of the list.
- **Known picture hosts only.** Anonymous pictures must come from `ANON_IMAGE_HOSTS` in `assets/js/stream-rules.js` (imgur, catbox, ImgBB, Postimages, Reddit, X/Twitter, YouTube thumbnails, Wikimedia), so clicking a picture link never sends you to a random site that logs who looks.
- **Locked conversation and label.** The Action adds the `anonymous` label (handy for filtering or closing many at once) and locks the issue so only collaborators can comment.

Nothing about the visitor is saved. The IP address is used only for the rate limit and the Turnstile check, and is never written to the issue.

## On/off switch

In [`_config.yml`](../_config.yml):

```yaml
anonymous_submissions: false   # true = anonymous allowed, false = GitHub accounts only
```

Commit that (the GitHub web editor is fine) and within about a minute:

- the Worker refuses new anonymous suggestions (it reads this line live from GitHub, and stays closed if it can't),
- the Action closes any anonymous issue that still arrives, with a polite comment,
- the **🕶️ Send anonymously** button disappears once the Pages build finishes.

Anonymous suggestions already in the queue can still be published by a maintainer with the `approved` label. Set it back to `true` to turn anonymous suggestions on again; nothing needs redeploying.

## One-time setup (about 10 minutes)

You need a free Cloudflare account: <https://dash.cloudflare.com/sign-up>.

### 1. GitHub token

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):

- Resource owner: `TrainStream`. Repository access: **Only select repositories** → `trainstream.github.io`.
- Permissions → Repository → **Issues: Read and write**. Nothing else.
- Pick a long expiry and write the date down, because the anonymous form stops working when the token expires.

Anonymous issues show as opened by the token's owner. To make that clearer, you can create a separate GitHub account (e.g. `trainstream-anon`), give it access to the repo, and make the token from that account. It is optional: the marker keeps them untrusted either way.

### 2. Turnstile widget

Cloudflare dashboard → **Turnstile** → **Add widget**:

- Hostname: `trainstream.github.io`
- Mode: Managed
- Copy the **site key** (public) and the **secret key**.

### 3. Deploy the Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put BLOCKED_WORDS      # optional, see "Protection against trolling"
npx wrangler deploy
```

`wrangler login` opens a browser to sign in to Cloudflare. The `secret put` commands ask you to paste each value. `deploy` prints the Worker's address, like `https://trainstream-submit.YOUR-SUBDOMAIN.workers.dev`.

### 4. Turn it on in the site

In `_config.yml` set:

```yaml
anon_submit_url: "https://trainstream-submit.YOUR-SUBDOMAIN.workers.dev/submit"
turnstile_sitekey: "0x4AAAA..."   # the site key from step 2
```

Commit and push. The **🕶️ Send anonymously** button appears on `/submit/` once the Pages build finishes. Leave either value empty to hide it again.

## Maintenance

- **Renew the token** before it expires: `npx wrangler secret put GITHUB_TOKEN`.
- **Spam?** Set `anonymous_submissions: false` (above). For a softer fix, lower `MAX_PENDING_ANON` or the rate `limit` in `wrangler.jsonc` and run `npx wrangler deploy` again, or add words to `BLOCKED_WORDS`. Logs are in the Cloudflare dashboard → Workers → trainstream-submit → Logs.
- If the site moves to another domain, update `ALLOWED_ORIGINS` and `TURNSTILE_HOSTNAMES` in `wrangler.jsonc`, the Turnstile widget's hostnames, then deploy again.
- The Worker bundles `assets/js/stream-rules.js` when it is deployed. After big changes to those rules, run `npx wrangler deploy` again so both sides agree (the Action re-checks everything anyway).
- Tags are read live from `_data/tags.json` on GitHub, so new tags need no redeploy.
