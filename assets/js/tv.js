/* TrainStream — TV wall: a grid of muted YouTube embeds, stored in this browser and shareable by URL. */
(function () {
    'use strict';

    var TS = window.TS;
    var store = window.TSStore;
    var el = TS.el;
    var MAX = 9;

    var streams = (TS.readJson('ts-streams') || []).map(function (raw, i) {
        return TS.normalize(raw, i, {});
    });

    /* every embeddable YouTube link, keyed like "video:ID" / "channel:UC…" */
    var options = [];
    var labelFor = {};
    streams.forEach(function (s) {
        s.youtubeLinks.forEach(function (link) {
            var key = link.youtube.kind + ':' + link.youtube.id;
            if (labelFor[key]) return;
            var label = s.name + (s.youtubeLinks.length > 1 ? ' — ' + link.text : '');
            labelFor[key] = label;
            options.push({ k: key, label: label, alive: s.alive });
        });
    });

    options.sort(function (a, b) {
        return Number(b.alive) - Number(a.alive);
    });

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

    function save() {
        store('ts.tv', JSON.stringify(wall));
        var query = wall.map(function (t) { return encodeURIComponent(t.k); }).join(',');
        history.replaceState(null, '', location.pathname + (query ? '?w=' + query : ''));
    }

    function render() {
        wallNode.textContent = '';
        wallNode.style.setProperty('--cols', String(cols));
        wallNode.hidden = wall.length === 0;
        document.getElementById('tv-none').hidden = wall.length > 0;
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
        document.querySelectorAll('[data-cols]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(Number(b.dataset.cols) === cols));
        });
        renderPicker();
    }

    function renderPicker() {
        var picker = document.getElementById('tv-picker');
        picker.textContent = '';
        options.forEach(function (opt) {
            var on = wall.some(function (t) { return t.k === opt.k; });
            picker.appendChild(
                el('li', null, [
                    el('span', { className: 'status-pill' + (opt.alive ? '' : ' is-dead'), text: opt.alive ? 'Live' : 'Dead' }),
                    el('span', { className: 'name', text: opt.label }),
                    el('button', {
                        type: 'button',
                        className: 'btn btn--small' + (on ? '' : ' btn--pink'),
                        text: on ? '✕ Remove' : '📺＋ Add',
                        disabled: !on && wall.length >= MAX,
                        onclick: function () {
                            if (on) remove(opt.k);
                            else add(opt);
                        },
                    }),
                ])
            );
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
        if (!yt) {
            msg.textContent = '⚠️ That is not a YouTube video or /channel/UC… link. (´・ω・`)';
            return;
        }
        if (wall.length >= MAX) {
            msg.textContent = '⚠️ The wall is full (' + MAX + ' screens). Remove one first.';
            return;
        }
        var key = yt.kind + ':' + yt.id;
        if (!wall.some(function (t) { return t.k === key; })) add({ k: key, label: labelFor[key] || 'YouTube ' + yt.id });
        input.value = '';
        msg.textContent = '✅ Added!';
    });

    document.querySelectorAll('[data-cols]').forEach(function (b) {
        b.addEventListener('click', function () {
            cols = Number(b.dataset.cols);
            store('ts.tvcols', String(cols));
            render();
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

    save();
    render();
})();
