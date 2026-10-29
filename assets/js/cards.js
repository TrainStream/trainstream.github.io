/* TrainStream — shared stream model + card renderer (camera list and submit preview). */
(function () {
    'use strict';

    var SITE = 'https://trainstream.github.io';
    var NEW_DAYS = 30;
    var FALLBACK_COLORS = ['#1e5aa8', '#d35400', '#008a3e', '#6a1b9a', '#00897b', '#c2185b', '#5b6770', '#9a6b00'];

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (key) {
                var value = attrs[key];
                if (value === null || value === undefined || value === false) return;
                if (key === 'text') node.textContent = value;
                else if (key === 'className') node.className = value;
                else if (key === 'style') node.setAttribute('style', value);
                else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), value);
                else node.setAttribute(key, value === true ? '' : value);
            });
        }
        (children || []).forEach(function (child) {
            if (child === null || child === undefined || child === false) return;
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return node;
    }

    function slugify(text) {
        return String(text || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'stream';
    }

    /* Only http(s) and site-relative links are ever turned into <a href>. */
    function safeUrl(url) {
        var value = String(url || '').trim();
        if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
        if (/^\/(?!\/)[^\s]*$/.test(value)) return value;
        return null;
    }

    function imgUrl(src, height) {
        var value = String(src || '').trim();
        var full = null;
        if (/^\/(?!\/)/.test(value)) full = SITE + value;
        else if (/^https?:\/\//i.test(value)) full = value;
        if (!full) return '';
        return '//images.weserv.nl/?' + (height ? 'h=' + height + '&' : '') + 'url=' + encodeURIComponent(full);
    }

    function youtube(url) {
        var value = String(url || '');
        var m = value.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
        if (m) return { kind: 'video', id: m[1] };
        m = value.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
        if (m) return { kind: 'channel', id: m[1] };
        return null;
    }

    function embedUrl(yt) {
        if (!yt) return '';
        if (yt.kind === 'video') return 'https://www.youtube-nocookie.com/embed/' + yt.id + '?autoplay=1&mute=1&rel=0';
        return 'https://www.youtube.com/embed/live_stream?channel=' + yt.id + '&autoplay=1&mute=1';
    }

    function rawStreamUrl(text) {
        var m = String(text || '').match(/\b((?:rtmp|rtmps|rtsp|mms|srt):\/\/[^\s)]+|https?:\/\/[^\s)]+\.m3u8[^\s)]*)/i);
        return m ? m[1] : null;
    }

    function parseTags(tags) {
        return String(tags || '')
            .split(',')
            .map(function (t) {
                return t.trim();
            })
            .filter(Boolean);
    }

    function tagIndex(tagList) {
        var map = {};
        (tagList || []).forEach(function (tag, i) {
            map[tag.slug] = {
                slug: tag.slug,
                name: tag.name || tag.slug,
                code: tag.code || String(tag.slug || '?').slice(0, 2).toUpperCase(),
                color: tag.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
            };
        });
        return map;
    }

    function tagInfo(slug, index) {
        return (
            index[slug] || {
                slug: slug,
                name: slug,
                code: String(slug).slice(0, 2).toUpperCase(),
                color: '#666',
            }
        );
    }

    function isNew(addedAt) {
        if (!addedAt) return false;
        var time = Date.parse(addedAt);
        return !isNaN(time) && Date.now() - time < NEW_DAYS * 86400000;
    }

    /* Turns a raw streams.json entry into the shape the UI uses. */
    function normalize(raw, index, usedIds) {
        var base = slugify(raw.id || raw.name);
        var id = base;
        var n = 2;
        while (usedIds && usedIds[id]) id = base + '-' + n++;
        if (usedIds) usedIds[id] = true;

        var images = (raw.images || [])
            .filter(function (img) {
                return img && img.src;
            })
            .map(function (img) {
                return {
                    src: img.src,
                    title: img.title || img.alt || '',
                    width: Number(img.width) || 0,
                    height: Number(img.height) || 0,
                };
            });

        var links = [];
        var notes = [];
        (raw.extras || []).forEach(function (extra) {
            if (!extra) return;
            var href = safeUrl(extra.link);
            if (href) {
                links.push({
                    href: href,
                    text: extra.text || extra.link,
                    note: extra.linkTitle || '',
                    kind: extra.kind === 'home' ? 'home' : 'stream',
                    youtube: youtube(href),
                    raw: rawStreamUrl(href),
                });
            } else if (extra.text) {
                notes.push({ text: extra.text, raw: rawStreamUrl(extra.text) });
            }
        });

        var lat = Number(raw.lat);
        var lng = Number(raw.lng);
        var hasGeo = raw.lat !== undefined && raw.lng !== undefined && isFinite(lat) && isFinite(lng);

        var model = {
            raw: raw,
            index: index,
            id: id,
            name: raw.name || '(no name)',
            alive: !!raw.isAlive,
            status: raw.isAlive ? 'live' : 'dead',
            tags: parseTags(raw.tags),
            images: images,
            links: links,
            notes: notes,
            description: raw.description || '',
            region: raw.region || '',
            submittedBy: raw.submittedBy || '',
            addedAt: raw.addedAt || '',
            isNew: isNew(raw.addedAt),
            geo: hasGeo ? [lat, lng] : null,
        };
        model.search = [
            model.name,
            model.region,
            model.description,
            model.tags.join(' '),
            images.map(function (i) { return i.title; }).join(' '),
            links.map(function (l) { return l.text + ' ' + l.note; }).join(' '),
            notes.map(function (x) { return x.text; }).join(' '),
        ]
            .join(' ')
            .normalize('NFKC')
            .toLowerCase();
        model.youtubeLinks = links.filter(function (l) {
            return l.youtube;
        });
        return model;
    }

    function badge(info, opts) {
        opts = opts || {};
        var tagName = opts.button ? 'button' : 'span';
        var node = el(
            tagName,
            {
                className: 'badge' + (opts.button ? '' : ' badge--static'),
                style: '--tag:' + info.color,
                type: opts.button ? 'button' : null,
                'data-tag': info.slug,
                'data-action': opts.action || null,
                'aria-pressed': opts.button && opts.pressed !== undefined ? String(!!opts.pressed) : null,
                title: info.name,
            },
            [el('span', { className: 'code', text: info.code }), el('span', { className: 'name', text: info.name })]
        );
        if (opts.count !== undefined) node.appendChild(el('span', { className: 'count', text: String(opts.count) }));
        return node;
    }

    /* opts: { tagIndex, isFav, inTv, maxLinks, preview } */
    function renderCard(model, opts) {
        opts = opts || {};
        var tags = opts.tagIndex || {};
        var maxLinks = opts.maxLinks || 4;
        var first = model.images[0];
        var detailHref = '#stream=' + encodeURIComponent(model.id);

        var thumb = el(
            'button',
            {
                type: 'button',
                className: 'card-thumb',
                'data-action': 'details',
                'aria-label': 'Show details and all cameras for ' + model.name,
            },
            [
                first
                    ? el('img', {
                          src: imgUrl(first.src, 240),
                          alt: first.title || model.name,
                          title: first.title || null,
                          loading: 'lazy',
                          decoding: 'async',
                      })
                    : el('span', { className: 'kaomoji', style: 'display:grid;place-items:center;height:100%;color:#ddd', text: '(・_・) no image' }),
                model.images.length > 1 ? el('span', { className: 'cams-chip', text: '📷×' + model.images.length }) : null,
                model.alive ? null : el('span', { className: 'dead-stamp', text: '運休' }),
            ]
        );

        var heading = el('div', { className: 'card-heading' }, [
            el('h3', { className: 'card-title' }, [
                el('a', { href: detailHref, 'data-action': 'details', text: model.name }),
                model.isNew ? el('span', { className: 'new-badge', text: 'NEW!' }) : null,
            ]),
            model.region ? el('p', { className: 'card-region', text: '📍 ' + model.region }) : null,
        ]);

        var tagList = el(
            'ul',
            { className: 'tag-list', 'aria-label': 'Tags' },
            model.tags.map(function (slug) {
                var info = tagInfo(slug, tags);
                var node = badge(info, { button: !opts.preview, action: 'tag' });
                if (!opts.preview) node.title = 'Show only ' + info.name;
                return el('li', null, [node]);
            })
        );

        var linkItems = [];
        model.links.slice(0, maxLinks).forEach(function (link) {
            linkItems.push(
                el('li', null, [
                    linkKindBadge(link),
                    el('a', { href: link.href, target: link.href.charAt(0) === '/' ? null : '_blank', rel: 'noopener noreferrer', title: link.note || null, text: link.text }),
                    link.note ? el('small', { text: link.note }) : null,
                ])
            );
        });
        model.notes.slice(0, Math.max(0, maxLinks - model.links.length)).forEach(function (note) {
            linkItems.push(el('li', { className: 'card-note', text: note.text }));
        });
        var hidden = model.links.length + model.notes.length - linkItems.length;
        if (hidden > 0) {
            linkItems.push(el('li', null, [el('a', { href: detailHref, 'data-action': 'details', text: '+' + hidden + ' more…' })]));
        }

        var actions = el('div', { className: 'card-actions' }, [
            el('button', {
                type: 'button',
                className: 'btn btn--small fav-btn',
                'data-action': 'fav',
                'aria-pressed': String(!!opts.isFav),
                title: 'Favourite',
                text: opts.isFav ? '★' : '☆',
            }),
            model.youtubeLinks.length
                ? el('button', {
                      type: 'button',
                      className: 'btn btn--small tv-btn',
                      'data-action': 'tv',
                      'aria-pressed': String(!!opts.inTv),
                      title: 'Add to the TV wall',
                      text: opts.inTv ? '📺 On wall' : '📺＋',
                  })
                : null,
            el('button', { type: 'button', className: 'btn btn--small', 'data-action': 'details', text: '詳細 Details' }),
        ]);

        return el(
            'article',
            {
                className: 'card',
                id: opts.preview ? null : 's-' + model.id,
                'data-id': model.id,
                'data-status': model.status,
                'data-geo': model.geo ? '1' : '0',
            },
            [
                el('header', { className: 'card-strip' }, [
                    el('span', { className: 'strip-status', text: model.alive ? '運転中 IN SERVICE' : '運休 SUSPENDED' }),
                    el('span', { className: 'serial', text: 'No.' + String(model.index + 1).padStart(4, '0') }),
                ]),
                thumb,
                el('div', { className: 'card-body' }, [
                    heading,
                    tagList,
                    el('span', { className: 'board-cams', text: model.images.length + ' cam' + (model.images.length === 1 ? '' : 's') }),
                    el('ul', { className: 'card-links' }, linkItems),
                    actions,
                ]),
            ]
        );
    }

    function linkKindBadge(link) {
        return link.kind === 'home'
            ? el('span', { className: 'link-kind', title: 'Home page / camera portal', text: '🏠 公式 Home' })
            : el('span', { className: 'link-kind link-kind--stream', title: 'Live stream / camera', text: '📺 配信 Stream' });
    }

    function copyText(text) {
        function toast() {
            var t = el('div', { className: 'copied-toast', role: 'status', text: 'コピーしました！ Copied' });
            document.body.appendChild(t);
            setTimeout(function () {
                t.remove();
            }, 1400);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(toast, function () {
                window.prompt('Copy this:', text);
            });
        } else {
            window.prompt('Copy this:', text);
        }
    }

    function readJson(id) {
        var node = document.getElementById(id);
        if (!node) return null;
        try {
            return JSON.parse(node.textContent);
        } catch (e) {
            return null;
        }
    }

    window.TS = {
        el: el,
        slugify: slugify,
        safeUrl: safeUrl,
        imgUrl: imgUrl,
        youtube: youtube,
        embedUrl: embedUrl,
        rawStreamUrl: rawStreamUrl,
        parseTags: parseTags,
        tagIndex: tagIndex,
        tagInfo: tagInfo,
        badge: badge,
        linkKindBadge: linkKindBadge,
        normalize: normalize,
        renderCard: renderCard,
        copyText: copyText,
        readJson: readJson,
    };
})();
