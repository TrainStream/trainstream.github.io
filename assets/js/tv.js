/* TrainStream — TV wall: a grid of muted YouTube embeds, stored in this browser and shareable by URL. */
(function () {
    'use strict';

    var TS = window.TS;
    var store = window.TSStore;
    var el = TS.el;
    var MAX = 9;

    var config = TS.readJson('ts-config') || {};
    var LIVE_URL = 'https://raw.githubusercontent.com/' + (config.repo || 'TrainStream/trainstream.github.io') + '/live-data/live.json';

    var streams = (TS.readJson('ts-streams') || []).map(function (raw, i) {
        return TS.normalize(raw, i, {});
    });

    /* one source per YouTube link: a video, or a channel (@name/streams, /channel/UC…) whose live videos come from live.json */
    var sources = [];
    streams.forEach(function (s) {
        s.links.forEach(function (link) {
            var chan = TSChannel.channelKey(link.href);
            var video = link.youtube && link.youtube.kind === 'video' ? link.youtube : null;
            if (!video && !chan) return;
            var many = s.links.filter(function (l) { return l.youtube || TSChannel.channelKey(l.href); }).length > 1;
            sources.push({
                stream: s,
                label: s.name + (many ? ' — ' + link.text : ''),
                video: video,
                chan: video ? null : chan,
                channelId: link.youtube && link.youtube.kind === 'channel' ? link.youtube.id : null,
                href: link.href,
            });
        });
    });

    var live = null; /* live.json once loaded, false if it could not be loaded */

    function liveInfo(chan) {
        return (live && live.channels && live.channels[chan]) || null;
    }

    /* picker rows: every live video of a channel gets its own row, so you can choose which one */
    var options = [];
    var labelFor = {};
    function buildOptions() {
        options = [];
        labelFor = {};
        sources.forEach(function (src, order) {
            var rows = [];
            if (src.video) {
                rows.push({ k: 'video:' + src.video.id, label: src.label, pill: src.stream.alive ? 'live' : 'dead' });
            } else {
                var info = liveInfo(src.chan);
                var vids = (info && info.live) || [];
                vids.forEach(function (v) {
                    rows.push({ k: 'video:' + v.id, label: src.label + (vids.length > 1 && v.title ? ' — ' + v.title : ''), title: v.title, pill: 'live' });
                });
                if (!vids.length) {
                    var id = (info && info.id) || src.channelId;
                    var pill = live === null ? 'checking' : info && !info.error ? 'off' : src.stream.alive ? 'live' : 'dead';
                    rows.push({ k: id ? 'channel:' + id : null, label: src.label, pill: pill, href: src.href });
                }
            }
            rows.forEach(function (row) {
                if (row.k && labelFor[row.k]) return;
                if (row.k) labelFor[row.k] = row.label;
                row.order = order;
                options.push(row);
            });
        });
        var rank = { live: 0, checking: 1, off: 2, dead: 3 };
        options.sort(function (a, b) {
            return rank[a.pill] - rank[b.pill] || a.order - b.order;
        });
    }
    buildOptions();

    function parseKey(key) {
        var m = /^(video|channel):([\w-]+)$/.exec(key || '');
        return m ? { kind: m[1], id: m[2] } : null;
    }

    var wall = [];
    var fromUrl = new URLSearchParams(location.search).get('w');
    if (fromUrl) {
        fromUrl.split(',').forEach(function (key) {
            if (parseKey(key) && wall.length < MAX && !wall.some(function (t) { return t.k === key; })) {
                wall.push({ k: key, label: labelFor[key] || key });
            }
        });
    } else {
        try {
            wall = JSON.parse(store('ts.tv') || '[]').filter(function (t) {
                return t && parseKey(t.k);
            });
        } catch (e) {
            wall = [];
        }
    }

    var cols = parseInt(store('ts.tvcols') || '2', 10);
    var wallNode = document.getElementById('tv-wall');
    var stage = document.getElementById('tv-stage');

    function save() {
        store('ts.tv', JSON.stringify(wall));
        var query = wall.map(function (t) { return encodeURIComponent(t.k); }).join(',');
        history.replaceState(null, '', location.pathname + (query ? '?w=' + query : ''));
    }

    function renderCols() {
        wallNode.style.setProperty('--cols', String(cols));
        document.querySelectorAll('[data-cols]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(Number(b.dataset.cols) === cols));
        });
    }

    /* rebuilds every screen (reloads the videos): only when the screens themselves change */
    function render() {
        wallNode.textContent = '';
        stage.hidden = wall.length === 0;
        document.getElementById('tv-none').hidden = wall.length > 0;
        if (!wall.length && stage.classList.contains('is-expanded')) {
            if (fullMode && fullscreenElement()) exitFullscreen();
            else setExpanded(false);
        }
        wall.forEach(function (item, i) {
            var yt = parseKey(item.k);
            wallNode.appendChild(
                el('div', { className: 'tv-cell' }, [
                    el('div', { className: 'tv-cell-head' }, [
                        el('span', { title: item.label, text: (i + 1) + '番線 ' + item.label }),
                        el('button', { type: 'button', 'aria-label': 'Remove ' + item.label, text: '✕', onclick: function () { remove(item.k); } }),
                    ]),
                    el('div', { className: 'embed' }, [
                        el('iframe', { src: TS.embedUrl(yt), title: item.label, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', loading: 'lazy' }),
                    ]),
                ])
            );
        });
        renderCols();
        renderPicker();
    }

    function renderPicker() {
        var picker = document.getElementById('tv-picker');
        picker.textContent = '';
        var pills = { live: 'Live', checking: 'Checking…', off: 'Not live now', dead: 'Dead' };
        options.forEach(function (opt) {
            picker.appendChild(
                el('li', null, [
                    el('span', { className: 'status-pill' + (opt.pill === 'live' ? '' : ' is-dead'), text: pills[opt.pill] }),
                    el('span', { className: 'name', title: opt.title || null, text: opt.label }),
                    opt.k ? addButton(opt) : el('a', { className: 'btn btn--small', href: opt.href, target: '_blank', rel: 'noopener', text: 'Open ↗' }),
                ])
            );
        });
    }

    function addButton(opt) {
        var on = wall.some(function (t) { return t.k === opt.k; });
        return el('button', {
            type: 'button',
            className: 'btn btn--small' + (on ? '' : ' btn--pink'),
            text: on ? '✕ Remove' : '📺＋ Add',
            title: !on && /^channel:/.test(opt.k) ? 'Plays the channel\'s live stream when it goes live' : null,
            disabled: !on && wall.length >= MAX,
            onclick: function () {
                if (on) remove(opt.k);
                else add(opt);
            },
        });
    }

    function renderLiveStatus() {
        var node = document.getElementById('tv-live-status');
        if (live === null) node.textContent = 'Checking which channels are live…';
        else if (!live) node.textContent = '⚠️ Could not load the live check. Channel screens play their main live stream, if any.';
        else {
            var mins = Math.max(0, Math.round((Date.now() - Date.parse(live.updated)) / 60000));
            node.textContent = 'Live streams on channel pages last checked ' + (mins < 1 ? 'just now' : mins + ' min ago') + '. Channels with several live streams list each one.';
        }
    }

    function loadLive() {
        fetch(LIVE_URL, { cache: 'no-cache' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                live = data && data.channels ? data : false;
            })
            .catch(function () {
                if (!live) live = false;
            })
            .then(function () {
                buildOptions();
                /* only rebuild the screens (and reload their videos) if a screen got a better name */
                var renamed = false;
                wall.forEach(function (t) {
                    if (t.label === t.k && labelFor[t.k]) {
                        t.label = labelFor[t.k];
                        renamed = true;
                    }
                });
                if (renamed) render();
                else renderPicker();
                renderLiveStatus();
            });
    }

    function add(opt) {
        if (wall.length >= MAX) return;
        wall.push({ k: opt.k, label: opt.label });
        save();
        render();
    }

    function remove(key) {
        wall = wall.filter(function (t) { return t.k !== key; });
        save();
        render();
    }

    document.getElementById('tv-add-form').addEventListener('submit', function (event) {
        event.preventDefault();
        var input = document.getElementById('tv-add-url');
        var msg = document.getElementById('tv-add-msg');
        var yt = TS.youtube(input.value);
        var chan = TSChannel.channelKey(input.value);
        if (!yt && !chan) {
            msg.textContent = '⚠️ That is not a YouTube video or channel link. (´・ω・`)';
            return;
        }
        if (wall.length >= MAX) {
            msg.textContent = '⚠️ The wall is full (' + MAX + ' screens). Remove one first.';
            return;
        }
        if (yt && yt.kind === 'video') {
            addPasted('video:' + yt.id);
            return;
        }
        var info = liveInfo(chan);
        var vids = (info && info.live) || [];
        var channelId = (info && info.id) || (yt && yt.id);
        if (vids.length === 1) {
            addPasted('video:' + vids[0].id, vids[0].title);
        } else if (vids.length > 1) {
            msg.textContent = 'This channel has ' + vids.length + ' live streams. Pick one: ';
            vids.forEach(function (v) {
                var key = 'video:' + v.id;
                msg.appendChild(el('button', { type: 'button', className: 'btn btn--small', style: 'margin: 2px 4px 2px 0', text: v.title || v.id, onclick: function () { addPasted(key, v.title); } }));
            });
        } else if (channelId) {
            addPasted('channel:' + channelId);
            if (info && !info.error) msg.textContent = '✅ Added. The channel is not live right now; the screen plays its live stream once it starts.';
        } else {
            msg.textContent = live === null
                ? '⏳ Still checking which channels are live. Try again in a moment.'
                : '⚠️ Only channels on the camera list are checked for live streams. Open the channel, copy the link of the live video, and paste it here.';
        }
    });

    function addPasted(key, title) {
        var input = document.getElementById('tv-add-url');
        var msg = document.getElementById('tv-add-msg');
        if (wall.length >= MAX) {
            msg.textContent = '⚠️ The wall is full (' + MAX + ' screens). Remove one first.';
            return;
        }
        if (!wall.some(function (t) { return t.k === key; })) add({ k: key, label: labelFor[key] || title || 'YouTube ' + key.split(':')[1] });
        input.value = '';
        msg.textContent = '✅ Added!';
    }

    document.querySelectorAll('[data-cols]').forEach(function (b) {
        b.addEventListener('click', function () {
            cols = Number(b.dataset.cols);
            store('ts.tvcols', String(cols));
            renderCols();
        });
    });
    document.getElementById('tv-share').addEventListener('click', function () {
        save();
        TS.copyText(location.href);
    });
    document.getElementById('tv-empty').addEventListener('click', function () {
        wall = [];
        save();
        render();
    });

    /* ⤢ fills the browser window, ⛶ makes the page full screen with the wall expanded
       (the whole page, so the pixel trains still drive over it) */
    var fullMode = false;
    function fullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }
    function exitFullscreen() {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
    function setExpanded(on) {
        stage.classList.toggle('is-expanded', on);
        document.documentElement.classList.toggle('tv-expanded', on);
        var full = fullMode && !!fullscreenElement();
        document.querySelectorAll('[data-tv-expand]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(on));
        });
        document.querySelectorAll('[data-tv-full]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(full));
        });
    }
    function toggleExpanded() {
        if (!wall.length) return;
        if (fullMode && fullscreenElement()) exitFullscreen(); /* leaving full screen also shrinks the wall, below */
        else setExpanded(!stage.classList.contains('is-expanded'));
    }
    function toggleFullscreen() {
        if (fullMode && fullscreenElement()) {
            exitFullscreen();
            return;
        }
        if (!wall.length) return;
        var page = document.documentElement;
        fullMode = true;
        setExpanded(true);
        var request = (page.requestFullscreen || page.webkitRequestFullscreen).call(page);
        if (request && request.catch) {
            request.catch(function () {
                fullMode = false;
                setExpanded(false);
            });
        }
    }
    function onFullscreenChange() {
        if (fullMode && !fullscreenElement()) {
            fullMode = false;
            setExpanded(false);
        } else setExpanded(stage.classList.contains('is-expanded'));
    }
    document.querySelectorAll('[data-tv-expand]').forEach(function (b) {
        b.addEventListener('click', toggleExpanded);
    });
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
        document.querySelectorAll('[data-tv-full]').forEach(function (b) {
            b.hidden = false;
            b.addEventListener('click', toggleFullscreen);
        });
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    }
    /* Esc leaves the expanded wall (full screen handles Esc itself) */
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && stage.classList.contains('is-expanded') && !fullscreenElement()) setExpanded(false);
    });

    save();
    render();
    renderLiveStatus();
    loadLive();
    setInterval(loadLive, 5 * 60 * 1000);
})();
