/* TrainStream — camera list page: filters, views, detail panel, map, omikuji, TV wall tray. */
(function () {
    'use strict';

    var TS = window.TS;
    var store = window.TSStore;
    var el = TS.el;

    var config = TS.readJson('ts-config') || {};
    var rawTags = (TS.readJson('ts-tags') || []).filter(function (t) {
        return t.slug !== 'all';
    });
    var tagIdx = TS.tagIndex(rawTags);
    var usedIds = {};
    var streams = (TS.readJson('ts-streams') || []).map(function (raw, i) {
        return TS.normalize(raw, i, usedIds);
    });
    var byId = {};
    streams.forEach(function (s) {
        byId[s.id] = s;
    });

    var VIEWS = ['tickets', 'list', 'board', 'map'];
    var SORTS = ['default', 'name', 'newest', 'cams'];
    var TV_MAX = 9;

    function readList(key) {
        try {
            var value = JSON.parse(store(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (e) {
            return [];
        }
    }

    var favs = new Set(readList('ts.favs'));
    var tv = readList('ts.tv');

    /* ---------- state from URL + remembered choices ---------- */
    var params = new URLSearchParams(location.search);
    var initialStatus = params.get('status');
    if (!initialStatus && /^#dead$/i.test(location.hash)) initialStatus = 'dead';
    var rememberedView = store('ts.view');
    var rememberedSort = store('ts.sort');
    var state = {
        status: ['live', 'dead', 'all'].indexOf(initialStatus) >= 0 ? initialStatus : 'live',
        q: params.get('q') || '',
        tags: new Set((params.get('tags') || '').split(',').filter(function (t) {
            return tagIdx[t];
        })),
        mode: params.get('mode') === 'all' ? 'all' : 'any',
        sort: SORTS.indexOf(params.get('sort')) >= 0 ? params.get('sort') : SORTS.indexOf(rememberedSort) >= 0 ? rememberedSort : 'default',
        view: VIEWS.indexOf(params.get('view')) >= 0
            ? params.get('view')
            : VIEWS.indexOf(rememberedView) >= 0
              ? rememberedView
              : window.matchMedia('(max-width: 640px)').matches
                ? 'list'
                : 'tickets',
        favOnly: params.get('fav') === '1',
    };

    /* ---------- elements ---------- */
    var list = document.getElementById('stream-list');
    var boardHead = list.querySelector('.board-head');
    var mapTitle = list.querySelector('.map-unknown-title');
    var emptyState = document.getElementById('empty-state');
    var resultCount = document.getElementById('result-count');
    var search = document.getElementById('search');
    var sortSelect = document.getElementById('sort');
    var tagFilters = document.getElementById('tag-filters');
    var favOnlyBtn = document.getElementById('fav-only');
    var mapWrap = document.getElementById('map-wrap');

    search.value = state.q;
    sortSelect.value = state.sort;

    /* ---------- cards ---------- */
    var cards = {};
    function tvKey(yt) {
        return yt.kind + ':' + yt.id;
    }
    function streamInTv(stream) {
        return stream.youtubeLinks.some(function (l) {
            var key = tvKey(l.youtube);
            return tv.some(function (t) {
                return t.k === key;
            });
        });
    }
    function buildCard(stream) {
        var card = TS.renderCard(stream, {
            tagIndex: tagIdx,
            isFav: favs.has(stream.id),
            inTv: streamInTv(stream),
        });
        cards[stream.id] = card;
        return card;
    }
    streams.forEach(function (stream) {
        list.appendChild(buildCard(stream));
    });
    function refreshCard(id) {
        var old = cards[id];
        var fresh = buildCard(byId[id]);
        fresh.hidden = old.hidden;
        old.replaceWith(fresh);
    }

    /* ---------- filtering ---------- */
    function matchesBase(stream, status) {
        if (status !== 'all' && stream.status !== status) return false;
        if (state.favOnly && !favs.has(stream.id)) return false;
        if (state.q) {
            var terms = state.q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
            for (var i = 0; i < terms.length; i++) {
                if (stream.search.indexOf(terms[i]) < 0) return false;
            }
        }
        return true;
    }
    function matchesTags(stream) {
        if (!state.tags.size) return true;
        var selected = Array.from(state.tags);
        return state.mode === 'all'
            ? selected.every(function (t) {
                  return stream.tags.indexOf(t) >= 0;
              })
            : selected.some(function (t) {
                  return stream.tags.indexOf(t) >= 0;
              });
    }
    function sorted(items) {
        var copy = items.slice();
        if (state.sort === 'name') {
            copy.sort(function (a, b) {
                return a.name.localeCompare(b.name, 'ja');
            });
        } else if (state.sort === 'newest') {
            copy.sort(function (a, b) {
                return (b.addedAt || '').localeCompare(a.addedAt || '') || b.index - a.index;
            });
        } else if (state.sort === 'cams') {
            copy.sort(function (a, b) {
                return b.camCount - a.camCount || a.index - b.index;
            });
        }
        return copy;
    }

    function renderTagFilters(baseMatches) {
        var counts = {};
        baseMatches.forEach(function (s) {
            s.tags.forEach(function (t) {
                counts[t] = (counts[t] || 0) + 1;
            });
        });
        tagFilters.textContent = '';
        rawTags.forEach(function (tag) {
            var info = TS.tagInfo(tag.slug, tagIdx);
            var pressed = state.tags.has(tag.slug);
            var button = TS.badge(info, { button: true, pressed: pressed, count: counts[tag.slug] || 0 });
            if (!counts[tag.slug] && !pressed) button.disabled = true;
            tagFilters.appendChild(el('li', null, [button]));
        });
    }

    function syncUrl() {
        var p = new URLSearchParams();
        if (state.status !== 'live') p.set('status', state.status);
        if (state.q) p.set('q', state.q);
        if (state.tags.size) p.set('tags', Array.from(state.tags).join(','));
        if (state.mode !== 'any') p.set('mode', state.mode);
        if (state.favOnly) p.set('fav', '1');
        var query = p.toString();
        var hash = /^#stream=/.test(location.hash) ? location.hash : '';
        history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + hash);
    }

    function syncStationSign() {
        var next = document.getElementById('sign-next');
        if (next) {
            var toDead = state.status !== 'dead';
            next.href = toDead ? '/?status=dead' : '/';
            next.querySelector('.ja').textContent = toDead ? 'うんきゅう' : 'うんてんちゅう';
            next.querySelector('.en').textContent = toDead ? 'Dead cameras' : 'Live cameras';
        }
        var classic = state.status === 'dead' ? '/classic/streams/dead' : '/classic/streams/';
        document.querySelectorAll('[data-set-style="classic"]').forEach(function (a) {
            a.href = classic;
        });
    }

    var visible = [];
    function apply() {
        var base = streams.filter(function (s) {
            return matchesBase(s, state.status);
        });
        visible = sorted(base.filter(matchesTags));

        var visibleIds = {};
        visible.forEach(function (s) {
            visibleIds[s.id] = true;
        });
        list.appendChild(boardHead);
        list.appendChild(mapTitle);
        visible.forEach(function (s) {
            list.appendChild(cards[s.id]);
        });
        streams.forEach(function (s) {
            var card = cards[s.id];
            card.hidden = !visibleIds[s.id];
            if (card.hidden) list.appendChild(card);
        });

        ['live', 'dead', 'all'].forEach(function (status) {
            var n = streams.filter(function (s) {
                return status === 'all' || s.status === status;
            }).length;
            document.querySelectorAll('[data-count="' + status + '"]').forEach(function (span) {
                span.textContent = '(' + n + ')';
            });
        });
        document.querySelectorAll('.rollsign button').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.status === state.status));
        });
        document.querySelectorAll('[data-mode]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
        });
        document.querySelectorAll('[data-view]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
        });
        favOnlyBtn.setAttribute('aria-pressed', String(state.favOnly));

        renderTagFilters(base);

        list.className = 'stream-list view-' + (state.view === 'tickets' ? 'tickets' : state.view);
        var geoMissing = visible.filter(function (s) {
            return !s.geo;
        }).length;
        mapTitle.hidden = state.view !== 'map' || !geoMissing;
        mapWrap.classList.toggle('is-visible', state.view === 'map');
        emptyState.hidden = visible.length > 0;
        resultCount.textContent = visible.length + ' / ' + base.length + ' cameras';

        syncUrl();
        syncStationSign();
        if (state.view === 'map') updateMap();
    }

    /* ---------- toolbar events ---------- */
    document.querySelector('.rollsign').addEventListener('click', function (event) {
        var button = event.target.closest('button[data-status]');
        if (!button) return;
        state.status = button.dataset.status;
        apply();
    });
    var searchTimer;
    search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            state.q = search.value.trim();
            apply();
        }, 120);
    });
    tagFilters.addEventListener('click', function (event) {
        var button = event.target.closest('button[data-tag]');
        if (!button) return;
        var slug = button.dataset.tag;
        if (state.tags.has(slug)) state.tags.delete(slug);
        else state.tags.add(slug);
        apply();
    });
    document.querySelectorAll('[data-mode]').forEach(function (b) {
        b.addEventListener('click', function () {
            state.mode = b.dataset.mode;
            apply();
        });
    });
    document.getElementById('clear-filters').addEventListener('click', function () {
        state.tags.clear();
        state.q = '';
        search.value = '';
        state.favOnly = false;
        apply();
    });
    favOnlyBtn.addEventListener('click', function () {
        state.favOnly = !state.favOnly;
        apply();
    });
    document.querySelectorAll('[data-view]').forEach(function (b) {
        b.addEventListener('click', function () {
            state.view = b.dataset.view;
            store('ts.view', state.view);
            apply();
        });
    });
    sortSelect.addEventListener('change', function () {
        state.sort = sortSelect.value;
        store('ts.sort', state.sort);
        apply();
    });

    /* ---------- favourites & TV wall ---------- */
    function saveFavs() {
        store('ts.favs', JSON.stringify(Array.from(favs)));
    }
    function toggleFav(id) {
        if (favs.has(id)) favs.delete(id);
        else favs.add(id);
        saveFavs();
        refreshCard(id);
        if (state.favOnly) apply();
    }
    function saveTv() {
        store('ts.tv', JSON.stringify(tv));
        var tray = document.getElementById('tv-tray');
        tray.hidden = tv.length === 0;
        document.getElementById('tv-count').textContent = tv.length + ' / ' + TV_MAX;
        document.getElementById('tv-open').href =
            '/tv/?w=' +
            tv
                .map(function (t) {
                    return encodeURIComponent(t.k);
                })
                .join(',');
    }
    function addTv(stream, link) {
        var key = tvKey(link.youtube);
        if (tv.some(function (t) { return t.k === key; })) return true;
        if (tv.length >= TV_MAX) {
            alert('The TV wall is full (' + TV_MAX + ' screens). Remove one first. 満員です！');
            return false;
        }
        tv.push({ k: key, label: stream.name + (stream.youtubeLinks.length > 1 ? ' — ' + link.text : '') });
        saveTv();
        return true;
    }
    function toggleTvForStream(stream) {
        if (streamInTv(stream)) {
            var keys = stream.youtubeLinks.map(function (l) {
                return tvKey(l.youtube);
            });
            tv = tv.filter(function (t) {
                return keys.indexOf(t.k) < 0;
            });
            saveTv();
        } else {
            addTv(stream, stream.youtubeLinks[0]);
        }
        refreshCard(stream.id);
    }
    document.getElementById('tv-clear').addEventListener('click', function () {
        tv = [];
        saveTv();
        streams.forEach(function (s) {
            refreshCard(s.id);
        });
    });
    saveTv();

    list.addEventListener('click', function (event) {
        var target = event.target.closest('[data-action]');
        if (!target) return;
        var card = target.closest('.card');
        if (!card) return;
        var stream = byId[card.dataset.id];
        var action = target.dataset.action;
        if (action === 'details') {
            event.preventDefault();
            openDetail(stream.id);
        } else if (action === 'fav') {
            toggleFav(stream.id);
        } else if (action === 'tv') {
            toggleTvForStream(stream);
        } else if (action === 'tag') {
            state.tags = new Set([target.dataset.tag]);
            apply();
            document.querySelector('.toolbar').scrollIntoView({ block: 'start' });
        }
    });

    /* ---------- detail dialog ---------- */
    var detail = document.getElementById('detail');
    var detailBody = document.getElementById('detail-body');
    var detailHead = document.getElementById('detail-head');
    var gallery = null;

    function closeDialog(dialog) {
        if (dialog.open) dialog.close();
    }
    document.querySelectorAll('dialog').forEach(function (dialog) {
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog || event.target.closest('[data-close]')) closeDialog(dialog);
        });
    });
    detail.addEventListener('close', function () {
        detailBody.textContent = '';
        gallery = null;
        if (/^#stream=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    });
    detail.addEventListener('keydown', function (event) {
        if (!gallery || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
        if (event.key === 'ArrowRight') gallery.go(1);
        if (event.key === 'ArrowLeft') gallery.go(-1);
    });

    function buildGallery(stream) {
        if (!stream.images.length) return null;
        var current = 0;
        var img = el('img', { alt: '' });
        var caption = el('figcaption');
        var thumbs = el('div', { className: 'gallery-thumbs', role: 'group', 'aria-label': 'Cameras' });
        var figure = el('figure', { className: 'gallery-main' }, [img, caption]);
        function show(i) {
            current = (i + stream.images.length) % stream.images.length;
            var image = stream.images[current];
            img.src = TS.imgUrl(image.src, 720);
            img.alt = image.title || stream.name;
            caption.textContent = (image.title || stream.name) + (stream.images.length > 1 ? '  (' + (current + 1) + '/' + stream.images.length + ')' : '');
            Array.prototype.forEach.call(thumbs.children, function (b, j) {
                b.setAttribute('aria-current', String(j === current));
            });
        }
        if (stream.images.length > 1) {
            figure.appendChild(el('button', { type: 'button', className: 'gallery-nav gallery-nav--prev', 'aria-label': 'Previous camera', text: '◀', onclick: function () { show(current - 1); } }));
            figure.appendChild(el('button', { type: 'button', className: 'gallery-nav gallery-nav--next', 'aria-label': 'Next camera', text: '▶', onclick: function () { show(current + 1); } }));
            stream.images.forEach(function (image, i) {
                thumbs.appendChild(
                    el('button', { type: 'button', title: image.title || null, 'aria-label': 'Camera ' + (i + 1) + (image.title ? ': ' + image.title : ''), onclick: function () { show(i); } }, [
                        el('img', { src: TS.imgUrl(image.src, 120), alt: '', loading: 'lazy' }),
                    ])
                );
            });
        }
        var wrap = el('div', null, [figure, stream.images.length > 1 ? thumbs : null]);
        show(0);
        return { node: wrap, go: function (d) { show(current + d); } };
    }

    function reportUrl(stream) {
        if (!config.repo) return null;
        var body = 'Stream: ' + stream.name + '\nPermalink: ' + location.origin + '/#stream=' + encodeURIComponent(stream.id) + '\n\nWhat is wrong? (dead link, moved channel, wrong picture...)\n\n';
        return 'https://github.com/' + config.repo + '/issues/new?labels=report&title=' + encodeURIComponent('Problem with stream: ' + stream.name) + '&body=' + encodeURIComponent(body);
    }

    function openDetail(id) {
        var stream = byId[id];
        if (!stream) return;
        document.getElementById('detail-title').textContent = stream.name;
        detailHead.classList.toggle('is-dead', !stream.alive);
        detailBody.textContent = '';

        gallery = buildGallery(stream);
        if (gallery) detailBody.appendChild(gallery.node);

        var meta = el('div', { className: 'detail-meta' }, [
            el('span', { className: 'status-pill' + (stream.alive ? '' : ' is-dead'), text: stream.alive ? '運転中 Live' : '運休 Dead' }),
            stream.region ? el('span', { text: '📍 ' + stream.region }) : null,
            stream.cameras ? el('span', { text: TS.camLabel(stream.cameras) }) : null,
            stream.images.length > 1 ? el('span', { className: 'detail-pictures', text: stream.images.length + ' pictures' }) : null,
            stream.addedAt ? el('span', { className: 'detail-date', title: 'Date this entry was added to the list', text: 'Added ' + stream.addedAt }) : null,
            stream.submittedBy ? el('span', { text: '🙏 Thanks to ' + stream.submittedBy }) : null,
        ]);
        detailBody.appendChild(meta);
        detailBody.appendChild(
            el(
                'ul',
                { className: 'tag-list' },
                stream.tags.map(function (slug) {
                    return el('li', null, [TS.badge(TS.tagInfo(slug, tagIdx))]);
                })
            )
        );
        if (stream.description) detailBody.appendChild(el('p', { text: stream.description }));

        var player = el('div', { className: 'embed', hidden: true });
        var linkList = el('ul', { className: 'detail-links' });
        stream.links.forEach(function (link) {
            var buttons = [];
            if (link.youtube) {
                buttons.push(
                    el('button', {
                        type: 'button',
                        className: 'btn btn--small btn--green',
                        text: '▶ Watch here',
                        title: link.youtube.kind === 'channel' ? 'Plays the channel\'s current live stream, if it is live' : null,
                        onclick: function () {
                            player.hidden = false;
                            player.textContent = '';
                            player.appendChild(el('iframe', { src: TS.embedUrl(link.youtube), title: stream.name, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen' }));
                            player.scrollIntoView({ block: 'nearest' });
                        },
                    })
                );
                buttons.push(
                    el('button', {
                        type: 'button',
                        className: 'btn btn--small',
                        text: '📺＋ TV wall',
                        onclick: function (event) {
                            if (addTv(stream, link)) {
                                event.currentTarget.textContent = '📺 Added';
                                refreshCard(stream.id);
                            }
                        },
                    })
                );
            }
            buttons.push(el('button', { type: 'button', className: 'btn btn--small', text: '📋 Copy', onclick: function () { TS.copyText(link.raw || link.href); } }));
            linkList.appendChild(
                el('li', null, [
                    el('div', { className: 'link-main' }, [
                        TS.linkKindBadge(link),
                        el('a', { href: link.href, target: link.href.charAt(0) === '/' ? null : '_blank', rel: 'noopener noreferrer', text: link.text }),
                        link.note ? el('small', { text: link.note }) : null,
                    ]),
                ].concat(buttons))
            );
        });
        stream.notes.forEach(function (note) {
            linkList.appendChild(
                el('li', null, [
                    el('div', { className: 'link-main' }, [note.raw ? el('code', { text: note.text }) : el('span', { text: note.text })]),
                    note.raw ? el('button', { type: 'button', className: 'btn btn--small', text: '📋 Copy URL', onclick: function () { TS.copyText(note.raw); } }) : null,
                ])
            );
        });
        detailBody.appendChild(linkList);
        detailBody.appendChild(player);

        var report = reportUrl(stream);
        detailBody.appendChild(
            el('div', { className: 'toolbar-row' }, [
                el('button', {
                    type: 'button',
                    className: 'btn btn--small fav-btn',
                    'aria-pressed': String(favs.has(stream.id)),
                    text: favs.has(stream.id) ? '★ Favourite' : '☆ Favourite',
                    onclick: function (event) {
                        toggleFav(stream.id);
                        var on = favs.has(stream.id);
                        event.currentTarget.setAttribute('aria-pressed', String(on));
                        event.currentTarget.textContent = on ? '★ Favourite' : '☆ Favourite';
                    },
                }),
                el('button', {
                    type: 'button',
                    className: 'btn btn--small',
                    text: '🔗 Copy permalink',
                    onclick: function () {
                        TS.copyText(location.origin + '/#stream=' + encodeURIComponent(stream.id));
                    },
                }),
                el('a', { className: 'btn btn--small', href: '/submit/?edit=' + encodeURIComponent(stream.id), text: '✏️ Suggest an edit' }),
                report ? el('a', { className: 'btn btn--small', href: report, target: '_blank', rel: 'noopener', text: '🛠 Report a problem' }) : null,
            ])
        );

        history.replaceState(null, '', location.pathname + location.search + '#stream=' + encodeURIComponent(stream.id));
        if (!detail.open) detail.showModal();
        detail.querySelector('.dialog-close').focus();
    }

    function openFromHash() {
        var m = location.hash.match(/^#stream=(.+)$/);
        if (m) openDetail(decodeURIComponent(m[1]));
    }
    window.addEventListener('hashchange', openFromHash);

    /* ---------- omikuji ---------- */
    var FORTUNES = [
        ['大吉', 'Great luck! 大当たり', 3],
        ['中吉', 'Middle luck', 4],
        ['小吉', 'Small luck', 4],
        ['吉', 'Luck', 4],
        ['末吉', 'Future luck', 2],
        ['凶', 'Bad luck… but here is a train anyway', 1],
    ];
    var omikuji = document.getElementById('omikuji');
    var luckyId = null;
    function drawOmikuji() {
        var live = streams.filter(function (s) {
            return s.alive;
        });
        if (!live.length) return;
        var total = FORTUNES.reduce(function (sum, f) {
            return sum + f[2];
        }, 0);
        var roll = Math.random() * total;
        var fortune = FORTUNES[0];
        for (var i = 0; i < FORTUNES.length; i++) {
            roll -= FORTUNES[i][2];
            if (roll < 0) {
                fortune = FORTUNES[i];
                break;
            }
        }
        var lucky = live[Math.floor(Math.random() * live.length)];
        luckyId = lucky.id;
        document.getElementById('omikuji-fortune').textContent = fortune[0];
        document.getElementById('omikuji-en').textContent = fortune[1];
        document.getElementById('omikuji-camera').textContent = lucky.name;
        var slip = document.getElementById('omikuji-slip');
        slip.classList.remove('omikuji-shake');
        void slip.offsetWidth;
        slip.classList.add('omikuji-shake');
    }
    document.getElementById('omikuji-open').addEventListener('click', function () {
        drawOmikuji();
        omikuji.showModal();
    });
    document.getElementById('omikuji-again').addEventListener('click', drawOmikuji);
    document.getElementById('omikuji-go').addEventListener('click', function () {
        omikuji.close();
        if (luckyId) openDetail(luckyId);
    });

    /* ---------- map (Leaflet, loaded on first use) ---------- */
    var map = null;
    var markerLayer = null;
    var leafletLoading = null;
    function loadLeaflet() {
        if (window.L) return Promise.resolve();
        if (leafletLoading) return leafletLoading;
        leafletLoading = new Promise(function (resolve, reject) {
            var css = el('link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' });
            var js = el('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' });
            js.onload = resolve;
            js.onerror = reject;
            document.head.appendChild(css);
            document.head.appendChild(js);
        });
        return leafletLoading;
    }
    /* ⤢ fills the browser window, ⛶ goes real full screen (where the browser allows it, so not on iPhone) */
    function fullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }
    function addMapSizeButtons() {
        var canFullscreen = document.fullscreenEnabled || document.webkitFullscreenEnabled;
        var expandBtn = el('button', { type: 'button', className: 'map-size-btn', 'aria-pressed': 'false', title: 'Expand to the window', 'aria-label': 'Expand map to the window', text: '⤢' });
        var fullBtn = canFullscreen ? el('button', { type: 'button', className: 'map-size-btn', 'aria-pressed': 'false', title: 'Full screen', 'aria-label': 'Full screen map', text: '⛶' }) : null;

        function refresh() {
            var full = fullscreenElement() === mapWrap;
            var expanded = mapWrap.classList.contains('is-expanded');
            expandBtn.setAttribute('aria-pressed', String(expanded));
            expandBtn.textContent = expanded ? '⤡' : '⤢';
            expandBtn.title = expanded ? 'Back to normal size' : 'Expand to the window';
            if (fullBtn) {
                fullBtn.setAttribute('aria-pressed', String(full));
                fullBtn.title = full ? 'Exit full screen' : 'Full screen';
            }
            document.documentElement.classList.toggle('map-expanded', expanded);
            map.invalidateSize();
        }
        function setExpanded(on) {
            mapWrap.classList.toggle('is-expanded', on);
            refresh();
        }

        expandBtn.addEventListener('click', function () {
            if (fullscreenElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            setExpanded(!mapWrap.classList.contains('is-expanded'));
        });
        if (fullBtn) {
            fullBtn.addEventListener('click', function () {
                if (fullscreenElement() === mapWrap) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
                else (mapWrap.requestFullscreen || mapWrap.webkitRequestFullscreen).call(mapWrap);
            });
            document.addEventListener('fullscreenchange', refresh);
            document.addEventListener('webkitfullscreenchange', refresh);
        }
        /* Esc leaves the expanded map (full screen handles Esc itself; an open dialog gets it first) */
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && mapWrap.classList.contains('is-expanded') && !document.querySelector('dialog[open]')) setExpanded(false);
        });

        var Control = window.L.Control.extend({
            options: { position: 'topright' },
            onAdd: function () {
                var bar = el('div', { className: 'leaflet-bar map-size' }, [expandBtn, fullBtn]);
                window.L.DomEvent.disableClickPropagation(bar);
                return bar;
            },
        });
        map.addControl(new Control());
    }
    /* a pill on the map that says how to zoom; fades away once someone has zoomed */
    function addZoomHint() {
        var touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
        var hint = el('div', { className: 'map-hint', 'aria-hidden': 'true' }, [
            el('span', { className: 'map-hint-icon', text: touch ? '🤏' : '🖱️' }),
            touch ? 'Pinch to zoom · drag to move' : 'Scroll to zoom · drag to move',
        ]);
        map.getContainer().appendChild(hint);
        map.once('zoomstart', function () {
            hint.classList.add('is-gone');
        });
    }
    function updateMap() {
        loadLeaflet()
            .then(function () {
                if (!map) {
                    map = window.L.map('map', { scrollWheelZoom: true }).fitBounds([
                        [30.5, 128.5],
                        [45.5, 146],
                    ]);
                    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 18,
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    }).addTo(map);
                    markerLayer = window.L.layerGroup().addTo(map);
                    map.getContainer().addEventListener('click', function (event) {
                        var button = event.target.closest('[data-map-open]');
                        if (button) openDetail(button.getAttribute('data-map-open'));
                    });
                    addMapSizeButtons();
                    addZoomHint();
                }
                map.invalidateSize();
                markerLayer.clearLayers();
                visible.forEach(function (s) {
                    if (!s.geo) return;
                    /* the main photo; its src is only set when the pin is opened, so 100+ pins don't load at once */
                    var first = s.images[0];
                    var photo = first
                        ? el('img', {
                              className: 'map-popup-photo',
                              alt: first.title || s.name,
                              width: 200,
                              height: first.width && first.height ? Math.round((200 * first.height) / first.width) : 150,
                          })
                        : null;
                    var popup = el('div', { className: 'map-popup' }, [
                        photo,
                        el('strong', { text: s.name }),
                        s.cameras ? el('span', { style: 'display:block;margin-bottom:4px', text: TS.camLabel(s.cameras) }) : null,
                        el('button', { type: 'button', className: 'btn btn--small', 'data-map-open': s.id, text: '詳細 Details' }),
                    ]);
                    window.L.circleMarker(s.geo, {
                        radius: 8,
                        weight: 3,
                        color: '#1b1f3b',
                        fillColor: s.alive ? '#1fbf4f' : '#e0242f',
                        fillOpacity: 0.9,
                    })
                        .bindTooltip(s.name)
                        .bindPopup(popup)
                        .on('popupopen', function () {
                            if (photo && !photo.src) photo.src = TS.imgUrl(first.src, 240);
                        })
                        .addTo(markerLayer);
                });
            })
            .catch(function () {
                document.getElementById('map').textContent = 'The map could not load (offline?). 地図を読み込めませんでした (´・ω・`)';
            });
    }

    /* ---------- go ---------- */
    apply();
    openFromHash();

    var newest = streams
        .filter(function (s) {
            return s.isNew;
        })
        .map(function (s) {
            return 'NEW! ' + s.name;
        });
    newest.forEach(function (text) {
        window.TSTicker && window.TSTicker.add(text, true);
    });
    var liveStreams = streams.filter(function (s) {
        return s.alive;
    });
    if (liveStreams.length && window.TSTicker) {
        window.TSTicker.add('次は ' + liveStreams[Math.floor(Math.random() * liveStreams.length)].name + ' です。 Next stop!');
    }
})();
