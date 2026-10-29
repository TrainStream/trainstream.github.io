# TrainStream redesign plan

Status: **phases 1–7 implemented** on branch `claude/wonderful-fermat-auisai` (phase 8, the Cloudflare Worker, is not built). See `README.md` for how it works now.
The `_plans/` folder starts with `_`, so Jekyll does not publish it.

### Decisions taken
- **D1:** yes, map view; region and approximate coordinates were filled in for the existing streams.
- **D2:** yes, a GitHub account is needed for now.
- **D3:** both counters; the joke one is the default and `real` is switched on in `_config.yml`.
- **D4:** yes, pictures are mirrored on publish.
- **D5:** yes, the classic choice is remembered.
- **D6:** yes, TV wall.
- **D7:** all views can be chosen and the browser remembers the choice. The default is tickets on desktop and timetable on phones.

### Changes from the plan below
- Submissions stay **issues** (no pull requests). The bot validates them and comments. The **`approved`** label, or "Approve & publish" in the `/submit/` review queue, publishes. Trusted authors (write access or listed in `publishers.yml`) publish instantly. Editing the JSON in the issue is the "edit before approving" step.
- Cards are rendered client-side from the embedded JSON by one renderer (`assets/js/cards.js`), which the submit-tool preview shares. There is a `<noscript>` list of live cameras for no-JS visitors.
- `/classic/streams/` is the classic equivalent of `/`. The old table-of-contents page is at `/classic/`.
- An "✏️ Suggest an edit" button on every stream pre-fills `/submit/?edit=<id>`.

---

## 0. What exists today (facts the plan relies on)

- Plain Jekyll site on GitHub Pages. `_config.yml` only sets `layout: base` as the default layout.
- `_layouts/base.html` holds a minimal HTML shell and loads `/assets/css/main.css`, compiled from `assets/css/main.scss`.
- Pages:
  - `/` (`index.html`) is a table of contents.
  - `/streams/` (`streams/index.html`) lists live cams and `/streams/dead` lists dead cams.
  - The rest are `/streams/insecam`, `/watching/` (+ `mpv`, `mpc`), `/recording/` ("Under Construction") and `test.html`.
  - `indexOLD.html` and `streams/indexOLD.html` are the even older hand-written pages.
- Data:
  - `_data/streams.json` has the shape `{ "$schema": "./stream_definitions.json", "data": [ {name, isAlive, tags, images[], extras[]} ] }`. It holds 54 streams: 41 alive and 13 dead.
  - `_data/tags.json` is `[{name, slug}]`. The first entry is `all`, and `sound` has special red styling.
  - `_data/stream_definitions.json` is the JSON schema.
  - `_data/insecure_cams.json` is `[{name, url}]`.
- `_includes/stream.html` renders a stream card.
  - Images go through `//images.weserv.nl/?h=H&url=https://trainstream.github.io{{src}}`. This only works for images in the repo, so a third-party image URL breaks.
  - Text is **not HTML-escaped**. That is fine for trusted editors but unsafe once the public can submit.
  - **Existing bug:** 63 images were written by the editor with `alt` instead of `title`, so their hover text never shows. The template only reads `img.title`.
- Goofy assets in `/pictures` include `background.png` (tiled grey trains), `mainpage.png` (red "Back to the Main Page" text image), `live.png`, `dead.png`, `videoplayer.png` and `favicon.ico`. Easter eggs: "Rest in Peace Aizu-Wakamatsu" and a hidden "Sponsored by fufufu.moe".

### altbdoor/trainstream-editor (the friend's tool) — compatibility contract
- It is an AngularJS app on altbdoor.github.io. A Cloudflare Worker swaps the GitHub OAuth `code` for a token. The OAuth app (client id `f0027cd1e5607d764686`) and the Worker CORS origin belong to altbdoor, so **we cannot reuse its login for our tool**.
- **Reads:**
  - the latest commit SHA
  - `_data/streams.json` (raw)
  - `_data/tags.json` (it drops slug `all`)
  - the `/pictures` directory listing, used for image path suggestions
- **Writes:**
  - It PUTs the *whole* `_data/streams.json` to the default branch.
  - The format is `JSON.stringify({ $schema: './stream_definitions.json', data }, null, 4)`.
  - The commit message is `Updating streams.json on <ISO date>`.
- Edits use `{...stream, tags}`, so **unknown extra fields on a stream survive** an edit. The images and extras arrays are also copied whole.
- New images are created as `{src, alt, width, height}`, not `title`.
- **Rules we must keep so the old tool never breaks:**
  1. Do not move or rename `_data/streams.json`, `_data/tags.json` or `/pictures`. Keep the `{ "$schema", "data": [...] }` wrapper.
  2. Every new field is **optional**, and the site must render fine without it, because old-tool entries will not have it.
  3. Keep `tags` as a comma-separated string. Keep `images[].src/width/height`, read `title` *or* `alt`, and keep `extras[].link/linkTitle/text`.
  4. Our own tool writes the exact same JSON formatting (4-space indent, `$schema` first), so diffs stay clean whichever tool commits.
  5. Known limitation (already true today): the old tool overwrites the whole file using the list it loaded. If someone publishes with the new tool while an old-tool session is open, the old tool's save can drop that entry. Document it; our tool will always re-fetch before writing.

---

## 1. Site structure after the redesign

| URL | Content |
|---|---|
| `/` | **New main page = the camera list** (live by default). |
| `/?status=dead` (also `#dead`) | Same page with dead cams. |
| `/streams/` | Redirects to `/` (keeps old links/bookmarks working; `meta refresh` + JS, since Pages has no server redirects). |
| `/streams/dead` | Redirects to `/?status=dead`. |
| `/streams/insecam/` | Insecam picks, new style. |
| `/watching/`, `/watching/mpv`, `/watching/mpc` | Video player guides, new style. |
| `/recording/` | New style; a goofy 工事中 "under construction" page with a construction-worker GIF vibe, until there is content. |
| `/submit/` | **New stream submission / publishing tool**. |
| `/about/` | About, credits (incl. the original editor), 更新履歴 update log, link banners. |
| `/classic/` | **Old design, fully preserved**: old index, `/classic/streams/`, `/classic/streams/dead`, `/classic/streams/insecam`, `/classic/watching/…`, `/classic/recording/`. It still reads the same `_data`, so it stays up to date automatically. |

- Existing `indexOLD.html`, `streams/indexOLD.html` and `test.html` stay untouched where they are.
- Implementation detail: Jekyll has no multi-path output, so the classic pages are separate files that reuse the **current** markup verbatim with a new `layout: classic`.
  - The `classic` layout is today's `base.html` plus a small fixed "✨ New view" link.
  - Old `main.scss` is moved to `assets/css/classic.scss`; the old includes become `_includes/classic/*.html`.
  - The new layout is `_layouts/default.html` with a new `assets/css/site.scss`.
- **Style preference:** the top-right menu has "旧デザイン / Classic view".
  - Choosing it stores `localStorage.trainstreamStyle = 'classic'`. A tiny inline script at the top of new pages then sends the visitor to the matching `/classic/…` page.
  - The classic pages get a "New view" link that clears it.
  - All reads/writes are wrapped in try/catch, and with no JS nothing redirects.
  - Old classic links inside classic pages (`/streams`, `/`) are rewritten to `/classic/...` so classic users stay in classic.

---

## 2. The new look: "modern but retro Japanese otaku homepage"

Reference research: late-90s/2000s Japanese 個人サイト (personal sites) and railfan sites on hosts such as asahi-net.or.jp. Their typical traits:
- a start date like "since 2001" and a 最終更新 (last updated) line
- a CGI visitor counter (キリ番 / milestone numbers) and a 更新履歴 update log with `NEW!` markers
- a vertical bold nav where every link has a one-line description
- a リンク集 (link collection) with 88×31 banners and a link policy (リンクフリー, banners OK)
- an external 掲示板 (BBS) and dense, bright, text-heavy pages with small images
- 工事中 (under construction) pages and kaomoji

Railfan sites add a few more:
- 駅名標 (station name sign) graphics and 発車標 (LED departure boards)
- 方向幕 (rollsign) destination signs and 路線記号 (line symbol badges like JY 01)
- 切符 (ticket) shapes and 駅スタンプ (station stamps)

**Design system (modern underneath, retro on top):**
- **Modern core:** responsive CSS grid, works at phone width, keyboard accessible, lazy-loaded images, `prefers-color-scheme` dark mode ("night train" palette), no framework. Vanilla JS with no build step, so GitHub Pages builds it as-is.
- **Fonts:** Google Fonts `DotGothic16` (Japanese pixel font) for headings, LED boards and badges; `M PLUS Rounded 1c` or the system font for body text.
- **Background:** keep the tiled `background.png` trains as the page background (the goofy signature). Content sits on slightly translucent "paper" panels with a 2px dark border and hard offset shadow (no blur), which reads as old-web-meets-modern.
- **Header = a giant 駅名標 station sign:** the centre reads `とれいんすとりーむ / TRAINSTREAM`. The left arrow "← 前の駅 Classic" points at the old design; the right arrow "次の駅 → Dead cams" or "Live cams" flips the mode. It is fully clickable, very train-otaku and very goofy.
- **Under the header:** an LED **departure board ticker** (orange dot font on black, scrolling with CSS animation). It cycles items like `次は 湯野上温泉 / Next: Yunokami-Onsen`, "N cameras in service", `NEW!` additions from the update log, and silly lines ("電車が参ります。白線の内側まで下がってお待ちください" — "a train is arriving, please step behind the white line").
- **Top-right menu (券売機 ticket machine):** a button labelled `メニュー ☰`. It opens a panel of chunky ticket-machine buttons:
  - 📹 カメラ一覧 Cameras
  - 🖥 再生ソフト Video players
  - ⏺ 録画 Recording
  - 🐟 Insecam
  - 📮 投稿 Submit a stream
  - ℹ️ このサイトについて About
  - 🕰 旧デザイン Classic view
  - 🌙 Night mode
- **Footer (very 2003):**
  - a working **visitor counter** shown as odometer digits, plus a キリ番 joke ("you are visitor #XXXX — if it's 777 tell us on the thread!"). The counter is a free counter service, or a fake local one if we don't want an external call — decision D3.
  - "since 20XX" and 最終更新 (auto from `site.time`), plus "推奨環境: any browser, 1024×768 or bigger (lol)"
  - an 88×31 "TRAINSTREAM" link banner others can hotlink, credits, the RIP Aizu-Wakamatsu line, and the hidden fufufu.moe sponsor
- **Goofy extras:**
  - a tiny pixel train (CSS/SVG) that drives across the bottom of the screen every ~60s; click it for a 警笛 horn emoji burst. It respects `prefers-reduced-motion`.
  - a kaomoji in the empty state ("no cameras match (；´Д｀)")
  - `NEW!` blinking badges (old-web style, but a gentle CSS animation)
  - a 「電車おみくじ」 Train Omikuji random-camera button that shows a fortune slip (大吉 Great Luck: "Yunokami-Onsen") and opens a random live cam

---

## 3. The new main page (the camera list) — my recommended UX

The current page is one long centred column, with one filter tag at a time, and live and dead on separate pages. Proposal: **one page, one data source, several ways to look at it.**

### 3.1 Toolbar (sticky at top while scrolling)
1. **Live/Dead switch as a 方向幕 rollsign toggle:**
   - `運転中 IN SERVICE (41)` in green against `運休 SUSPENDED (13)` in red.
   - Flipping it plays a short rollsign scroll animation. There is also an "All" position.
   - The state lives in the URL (`?status=live|dead|all`) so links are shareable, and old `/streams/dead` links land here.
2. **Search box:** matches name (Japanese and English), image titles, link text and description. It is diacritic- and case-insensitive.
3. **Tag filters as line badges (路線記号):**
   - Each tag gets a JR-style coloured rounded square with a 2-letter code: TS Train Station, TL Train Lines, ST Street, TR Traffic, CI City, SH Shrine, BR Bridge, AP Airport, SP SeaPort, SC Scenery, SR Shore, SO Shop, SN Sound, OT Other, IP IP Cameras.
   - **Multi-select**, with an ANY/ALL toggle (today only one tag at a time works).
   - Each badge shows a count. Colours and codes come from an optional `color`/`code` on `tags.json` entries, with a fallback palette so tags added with the old tool still work.
4. **View switcher (4 views of the same cards; only CSS and a class change):**
   - **🎫 Ticket grid (default):**
     - cards shaped like 切符 tickets, with the first image as a 16:9 thumbnail and a "+3 cams" chip when there are more
     - name, tag badges, `NEW!`, and the main link buttons
   - **📋 Timetable list (compact):**
     - one row per stream with a small thumb, name, tags and links
     - the closest thing to the old page, good for scanning
   - **🚉 Departure board (発車標):**
     - a dense black LED table with columns `種別 Type | 行先 Name | 番線 #cams | 状態 Status | 案内 Links`
     - text only and super fast, very otaku
   - **🗾 Map (optional, decision D1):**
     - Leaflet + OpenStreetMap tiles with a pin per stream that has `lat/lng`, clustered
     - clicking a pin opens the detail panel
     - streams without coordinates are listed under "現在地不明 location unknown"
5. **Sort:** default (the JSON order the editors chose), A→Z, newest (`addedAt`), or most cameras.
6. **Extras:** the ★ favourites filter (localStorage), the 🎲 Omikuji random button, and a result count ("12 / 41 cameras").

### 3.2 Stream detail panel (click a card)
- A modal or side drawer with the full image gallery. Images are full-size via weserv, keyboard ←/→, and show their per-camera titles.
- **All links**, keeping `linkTitle` as a visible note (today it is hover-only, which mobile users never see).
- **Copy buttons** for raw stream URLs (rtmp/m3u8/IP-camera URLs), with a hint pointing to the mpv/MPC guides.
- **YouTube preview:** a "▶ Watch here" button embeds `youtube-nocookie.com` for YouTube video links. The embed is click-to-load, so there are no iframes or tracking until clicked.
- The description, region and "submitted by" credit (when present). The ★ favourite button sits here too.
- A permalink `/#stream=<id>` so one camera can be linked in the thread.
- "Report a problem / mark as dead": this opens a prefilled GitHub issue.

### 3.3 Bonus: Multi-view "TV wall" (recommended, small extra work)
- Tick up to 4 (or 9) YouTube streams and press 📺 **TV wall**. You get a 2×2/3×3 grid of muted live embeds; for train watchers this is the killer feature.
- The selection lives in the URL so a wall can be shared.

### 3.4 Rendering approach
- Jekyll/Liquid renders **all** stream cards (live and dead) into the HTML with `data-*` attributes: status, tags, search text, id and addedAt.
- JS only filters, sorts and switches views. So the page works **without JavaScript**: all live cams show, and a `<noscript>` note explains the dead section.
- The data is also embedded once as JSON (`{{ site.data.streams.data | jsonify }}`) for the detail panel, map and TV wall.
- **Every user-supplied text is output with `| escape`**, and links only render when they start with `http://`, `https://` or `/`. Do the same hardening in the classic includes.
- **Image helper include** `_includes/img-src.html`: if `src` starts with `/`, use the existing weserv URL with the `https://trainstream.github.io` prefix; if it starts with `http`, use weserv with that URL directly. Weserv still resizes and proxies third-party images. `title` falls back to `alt`, which fixes the existing hover bug. Use `loading="lazy"`.
- **Stream ids:** derived client-side from the name, slugified. An optional `id` field overrides it, so a rename doesn't break favourites or permalinks.

### 3.5 Optional new fields in `streams.json` (all optional, old tool keeps them)
| field | type | used for |
|---|---|---|
| `id` | string | stable permalink/favourites |
| `description` | string | detail panel text |
| `region` | string (e.g. "Fukushima") | region filter chip, board column |
| `lat`, `lng` | number | map view |
| `addedAt` | `YYYY-MM-DD` | `NEW!` badge (≤30 days), "newest" sort, auto 更新履歴 update log |
| `submittedBy` | string | credit line |

- `stream_definitions.json` gets these properties added, so the schema stays valid.
- `tags.json` entries may gain optional `code` and `color`. The old tool only reads `slug`, so this is safe.
- Backfilling `region`/`lat`/`lng` for the existing 54 entries is optional. I can do prefecture-level best-effort and mark it for human checking (decision D1).

---

## 4. Submission + publishing tool (`/submit/`) — requests 7, 8 and 9

### 4.1 Recommended architecture: "GitHub does the backend" (no server, free)

```
Visitor fills /submit/ form ──► live preview card (same template as the site)
        │
        ├─(no GitHub login)──► "Submit" opens a pre-filled GitHub Issue
        │                       (issue form .github/ISSUE_TEMPLATE/new-stream.yml,
        │                        JSON block embedded in body)
        ▼
GitHub Action  .github/workflows/submission.yml  (on: issues opened/edited)
   1. parse + validate (schema, http/https only, length limits, tags exist,
      image URLs reachable & are images)
   2. if author ∈ .github/publishers.yml  ──► commit straight to master  ("instant publish")
      else ──► open a PR "New stream: <name>" (label `submission`), comment link on issue
   3. optional: download the 3rd-party images into /pictures/submissions/… and
      rewrite src, so images don't rot when the external host dies
Maintainer reviews PR (edit JSON in GitHub UI or in /submit/ admin mode) ──► merge ──► live
```

- **Anyone** can suggest. They must provide third-party image links and write their own descriptions; the form enforces both. Nothing goes live without review. The cost is that submitters need a (free) GitHub account. Decision D2 covers anonymous submissions.
- **Repo maintainers** open `/submit/` in **admin mode**:
  - Paste a fine-grained Personal Access Token once. It needs "Contents: read/write" and "Pull requests: read/write" on this repo only, and is stored in localStorage on their device only.
  - Then they get:
    - **Publish now:** re-fetches `streams.json` plus its sha, appends or edits, and PUTs with the identical JSON format. The old tool stays fully compatible.
    - a **Review queue** listing open `submission` PRs or issues. Load one into the form, tweak it, then **Approve & publish** (merge the PR or commit directly) or **Reject** (close with a reason).
    - **Edit / mark dead / reorder** existing entries. This makes it a full replacement for the old editor, but the old one keeps working.
- **Credit:** the `/submit/` page header and the `/about/` page both say: *"Inspired by and built after the original [trainstream-editor](https://github.com/altbdoor/trainstream-editor) by altbdoor, which still works."* There is also a link to the old tool.

### 4.2 Request 9: publish rights without full repo access — yes, possible
GitHub can't give "write only this one file". Two ways around that:
- **Option A (recommended, zero servers):**
  - Add `.github/publishers.yml`, a list of GitHub usernames. Only repo admins can edit it, so protect it with CODEOWNERS and branch protection.
  - The submission Action checks the issue author. Listed publishers' submissions are validated and **committed automatically by the Action** using the repo's own `GITHUB_TOKEN`.
  - Publishers therefore need **no collaborator access at all**. They just use `/submit/`, and it goes live within about a minute.
  - Revoking someone means deleting a line. The Action can only ever touch `_data/streams.json` (and `/pictures/submissions/`), and only through validation.
  - The same mechanism can support **edits and "mark dead"** requests from publishers.
- **Option B (nicer UX, needs a tiny server):**
  - A Cloudflare Worker (free tier) plus a GitHub App installed on the repo.
  - Users click "Sign in with GitHub" (identity only, no repo permissions). The Worker checks the allowlist and makes the commit with the App's key.
  - It also allows **anonymous** submissions with a Turnstile captcha. It is more setup (Cloudflare account, GitHub App, secrets), so treat it as phase 7 if wanted.

### 4.3 Security must-haves (because the public can now write content)
- Templates escape everything. URL fields accept only `http(s)`; `javascript:` and `data:` are rejected.
- **The Action never interpolates issue text into shell.** Pass it via `env:` and parse in a Node script. Permissions are `contents: write, pull-requests: write, issues: write` only.
- Validation lives in a script `scripts/validate-streams.mjs`. CI runs it on every push or PR touching `_data/streams.json`, so a bad edit by **either** tool is caught with a red check.
- The PAT is never committed and stays only in the maintainer's own browser. The admin page explains how to create a fine-grained token scoped to this repo.

---

## 5. Implementation phases (each phase = its own commit, pushed to the branch)

1. **Classic backup:**
   - Create `_layouts/classic.html` and `assets/css/classic.scss` (copy of `main.scss`), and copy the includes into `_includes/classic/`.
   - Create `/classic/` copies of index, streams, dead, insecam, watching (+ mpv, mpc) and recording, with internal links rewritten to `/classic/…`.
   - Add the escape, external-image and `title|alt` fixes to the classic stream include.
   - Verify with a local `jekyll build` that classic renders identically.
2. **New design system:**
   - `_layouts/default.html` (header station sign, LED ticker, ticket-machine menu, footer, pixel train, style-preference redirect), `assets/css/site.scss` with tokens and dark mode, and `assets/js/site.js` (menu, ticker, night mode, prefs).
   - Set `_config.yml` default layout to `default`.
3. **New camera list at `/`:**
   - `index.html` with the toolbar, the cards include `_includes/card.html`, the image include, and `assets/js/streams.js` (filter, search, sort, views, URL state, favourites, detail panel, YouTube click-to-load, omikuji).
   - Turn `/streams/` and `/streams/dead` into redirects.
   - Move the old ToC content into the footer/menu and `/about/`.
4. **Restyle the other pages** (watching, mpv, mpc, insecam, recording, about with the credits and update log).
5. **Data and schema:**
   - Optional fields in `stream_definitions.json`, optional `code`/`color` in `tags.json`, and the `scripts/validate-streams.mjs` plus `.github/workflows/validate.yml` CI.
   - Optional backfill of region and coordinates.
6. **Submission pipeline:**
   - `.github/ISSUE_TEMPLATE/new-stream.yml`, `.github/workflows/submission.yml`, `scripts/process-submission.mjs` and `.github/publishers.yml`, plus the optional image mirroring.
   - `/submit/` page: form, live preview, "submit via GitHub issue", admin mode (PAT, publish now, review queue, edit existing).
7. *(Optional)* **Map view + TV wall**, if not already folded into phase 3.
8. *(Optional)* **Cloudflare Worker** for anonymous submissions and GitHub sign-in (Option B).

**Testing per phase:**
- Build locally with Jekyll (`bundle exec jekyll build`; I'll add a minimal `Gemfile` with `github-pages` so the local build matches Pages).
- Then serve `_site` and drive it with the pre-installed Playwright: screenshots at desktop and phone widths, a no-JS check, filter, view, toggle and redirect checks, and a check that `/classic/*` still matches today's look.
- **Old-editor compatibility test:** round-trip `streams.json` through `JSON.stringify(obj, null, 4)` and ensure the diff is empty, and run the validator on a file with no new fields.

**Things that need your action in GitHub settings (I can't do them from here):**
- Enable Issues if they are off.
- Create the `submission` label (or let the Action create it).
- Allow Actions to create PRs: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
- Branch protection plus CODEOWNERS for `.github/publishers.yml`.
- **Note:** GitHub Pages currently builds from `master` with the default Jekyll builder, so everything stays plugin-free.

---

## 6. Open decisions for the owner

- **D1 Map view:** build it, and backfill prefecture or coordinates for existing streams? (Recommended: yes, best-effort and marked for checking.)
- **D2 Anonymous submissions:** is "needs a GitHub account" OK for v1? (Recommended: yes; add the Cloudflare Worker later only if people complain.)
- **D3 Visitor counter:** use a real counter from an external free service, or a fake or joke one? (Recommended: real but privacy-friendly, or a joke one if you'd rather avoid third parties.)
- **D4 Mirror submitted images into the repo on approval**, so third-party links can't rot? (Recommended: yes.)
- **D5 Remember the classic-view choice** and auto-redirect returning visitors? (Recommended: yes.)
- **D6 TV wall multi-view** in v1? (Recommended: yes, it's small.)
- **D7 Default view:** ticket grid or the compact timetable list? (Recommended: ticket grid on desktop, list on phones.)
