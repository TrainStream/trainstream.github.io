# TrainStream

A hand-picked guide to live train, station and city cameras in Japan: <https://trainstream.github.io/>

Plain Jekyll on GitHub Pages: no build step, no plugins, no npm.

## Where things are

| Path | What |
|---|---|
| `_data/streams.json` | **The camera list.** Every page reads it. |
| `_data/tags.json` | Tags (`name`, `slug`, plus optional line-badge `code` and `color`). |
| `_data/stream_definitions.json` | JSON schema for `streams.json`. |
| `_data/insecure_cams.json` | The Insecam picks page. |
| `index.html` | The camera list (main page). Cards are rendered by `assets/js/cards.js` + `streams.js`. |
| `tv/`, `submit/`, `about/`, `watching/`, `recording/`, `streams/insecam.html` | Other new-style pages. |
| `streams/index.html`, `streams/dead.html` | Redirects from the old URLs to `/` and `/?status=dead`. |
| `classic/` | **The old design**, kept as-is (layout `_layouts/classic.html`, CSS `assets/css/main.scss`). It reads the same data, so it is always up to date. |
| `_layouts/default.html`, `assets/css/site.scss`, `assets/js/site.js` | The new design: station-sign header, LED ticker, ticket-machine menu, footer, pixel train. |
| `assets/js/trains.js` | The pixel train: real-world liveries and the rare scenarios (level crossing, passing, crash, multi-track drifting, Doctor Yellow, overrun, station cat, rush hour, deer, early departure, snowplough in winter, sleeper train at night). Force one with `/?train=crash&livery=hankyu`. |
| `assets/js/stream-rules.js` | Validation + formatting rules shared by the submit tool and the GitHub Actions. |
| `scripts/` | Node scripts the Actions run (not published). |
| `.github/workflows/live.yml`, `scripts/check-live.mjs`, `assets/js/youtube-channel.js` | **Live check** for the TV wall: every 15 minutes, reads each YouTube channel's `/streams` page and lists its live videos in `live.json` on the `live-data` branch. The TV wall loads it from raw.githubusercontent.com, so channels with several live streams show each one. Run it by hand from the Actions tab ("Live check" → Run workflow). |
| `.github/` | Issue form, workflows, and the trusted publishers list. |
| `worker/` | Optional Cloudflare Worker for **anonymous submissions** (no GitHub account). Not published by Jekyll. Setup: [`worker/README.md`](worker/README.md). |

### Stream fields

Required, the same as always: `name`, `isAlive`, `tags` (comma separated slugs), `images[]` (`src`, `title` or `alt`, `width`, `height`) (`width`/`height` are only the size the classic view draws the picture at: 200px tall, same shape, e.g. 356×200 for 16:9 or 267×200 for 4:3; the submit tool fills them in) and `extras[]` (`link`, `text`, `linkTitle`).

Optional, new: `region`, `lat`/`lng` (map pin), `description`, `thumbFit` (`"fit"` shows the whole first picture in the camera list instead of filling and cropping its box), `addedAt` (`YYYY-MM-DD`, gives a NEW! badge for 30 days and an entry in the update log), `submittedBy` (credit) and `id` (stable permalink if the name changes).

Old entries without the new fields work fine. The original [trainstream-editor](https://github.com/altbdoor/trainstream-editor) by altbdoor keeps unknown fields when it saves, so both tools can be used side by side.

## Adding and editing streams

There are three ways, and all of them write the same JSON format (`JSON.stringify(data, null, 4)`):

1. **Anyone:** <https://trainstream.github.io/submit/>
   - Fill in the form; it shows a live preview.
   - "Send suggestion via GitHub" opens a pre-filled issue. A free GitHub account is needed.
   - Or, once it is set up, "🕶️ Send anonymously" sends it **without any account** through a free Cloudflare Worker ([`worker/README.md`](worker/README.md) has the setup). Anonymous suggestions always wait for review. **Off switch:** `anonymous_submissions: false` in `_config.yml`.
   - A bot checks it and comments. A maintainer then publishes it, either by adding the **`approved`** label to the issue or with the review queue below.
   - On publish, third-party pictures are copied into `pictures/submissions/` so they can't rot.
2. **Maintainers** (people with write access):
   - On `/submit/`, open **Maintainers & publishers** and sign in with a fine-grained personal access token. The page explains how to create one; it needs Contents + Issues read/write on this repo only.
   - Then you can **publish instantly** (and upload pictures straight from your computer: they are shrunk to 1280px, saved as JPEG in `pictures/submissions/`, and committed together with the stream), work the **review queue** (load a suggestion into the form, edit it, approve and publish, or reject it: rejecting deletes the issue for good if you are a repository admin, otherwise it is closed), and **edit / mark dead / delete** any stream.
3. **The original editor** by altbdoor still works exactly as before.

Anyone can also press "✏️ Suggest an edit" on a camera's detail panel. That opens the form pre-filled with the stream; the result is an issue that replaces the stream once it is approved.

### Trusted publishers (publish without repo access)

Every suggestion is an issue opened from the submitter's own GitHub account, and every published commit names them ("suggested by …"). To review someone's history before trusting them, search the issues for `is:issue author:USERNAME label:submission` (add `label:published` to see only what went live).

Add GitHub usernames to [`.github/publishers.yml`](.github/publishers.yml). Their suggestions skip the review: the Action validates them and commits them for them, usually live within a minute or two. They don't need any access to the repository. Delete the line to take the right away.

### Moderators (approve or reject without repo access)

Add GitHub usernames to [`.github/moderators.yml`](.github/moderators.yml). On `/submit/` they sign in with any GitHub token (even one with no permissions; it only proves who they are) and get the review queue with **✅ Approve** (the Action publishes it) and **🗑 Reject & delete** (the issue is deleted). Everyone with write access ("contributors") gets the same buttons. The Cloudflare Worker in [`worker/`](worker/README.md) does the work with its own token, and only on open `submission` issues. Moderators can't publish directly or edit the stream list, and their own suggestions still wait for review.

Deleting needs the Worker's `GITHUB_TOKEN` to belong to a repository **admin**. If GitHub refuses, the issue's text is wiped and it is closed and locked instead. Approving needs that token's owner to have write access (or be in `publishers.yml`), because the Action checks who added the `approved` label.

## One-time GitHub settings

- **Issues** must be enabled (Settings → General → Features).
- The workflows ask for the permissions they need. If they fail with a 403, set Settings → Actions → General → Workflow permissions to **Read and write permissions**.
- If `master` has branch protection, allow GitHub Actions to push to it, or the submission Action can't publish.
- GitHub Pages: deploy from the `master` branch (as before).
- The live check force-pushes the `live-data` branch. Don't protect that branch. GitHub pauses scheduled workflows after 60 days without commits; re-enable "Live check" in the Actions tab if that happens.

## Visitor counter

The footer counter is a joke by default: the number is made up and nothing is sent anywhere. To count real visits:

1. Create a free workspace and a public counter at [counterapi.dev](https://counterapi.dev/).
2. Set `visitor_counter: real`, `counter_workspace` and `counter_name` in `_config.yml`.

If the service is down, the joke counter shows instead.

## Running locally

```bash
gem install jekyll -v '~> 3.10' && gem install kramdown-parser-gfm webrick
jekyll serve
```

```bash
node scripts/validate-streams.mjs   # the same check CI runs on every change to streams.json
```

Rest in Peace Aizu-Wakamatsu.
