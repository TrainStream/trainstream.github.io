/* TrainStream — the little pixel train at the bottom of the page.
 *
 * Every run picks a livery and a scenario. Most runs are a plain drive-by;
 * the rest are the rare ones below. Without JS (or Web Animations) the CSS
 * keyframes in site.scss keep the original train driving by.
 *
 * Testing: ?train=<scenario> forces one scenario on every run, and
 * ?livery=<id> forces the livery, e.g. /?train=crash&livery=hankyu
 */
(function () {
    'use strict';

    var train = document.getElementById('pixel-train');
    if (!train || !train.animate || !window.Promise) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /* ---------- liveries ---------- */
    var NAVY = '#2b3a55';
    var SILVER = '#d5dade';
    var LIVERIES = [
        // the original design: two single-arm pantographs now, see the README
        { id: 'jr-east', name: 'JR East', weight: 4, body: '#f4f4ec', bands: [[13, 3, '#00913a']], panto: [0, 2] },
        { id: 'chuo', name: 'JR Chūō Line E233', body: SILVER, bands: [[13, 3, '#f15a22']], panto: [0, 2] },
        { id: 'keihin-tohoku', name: 'JR Keihin-Tōhoku Line E233', body: SILVER, bands: [[13, 3, '#00b2e5']], panto: [0, 2] },
        { id: 'sobu', name: 'JR Sōbu Line E231', body: SILVER, bands: [[13, 3, '#ffd400']], panto: [1] },
        { id: 'yamanote', name: 'JR Yamanote Line E235', body: SILVER, bands: [[4, 2, '#80c241'], [13, 3, '#80c241']], panto: [1] },
        { id: 'osaka-loop', name: 'JR West Osaka Loop Line 323', body: SILVER, bands: [[12, 4, '#f39800']], panto: [0, 2] },
        { id: 'hankyu', name: 'Hankyu', body: '#6b1e2a', roof: '#efe6d0', light: '#fff6c0', panto: [0, 2], pantoType: 'diamond' },
        { id: 'keikyu', name: 'Keikyu', body: '#e60012', bands: [[14, 2, '#ffffff']], panto: [0, 2] },
        // the Ginza Line takes its power from a third rail: no pantograph at all
        { id: 'ginza', name: 'Tokyo Metro Ginza Line 1000', body: '#ff9500', bands: [[16, 1, '#c96a00']], panto: [] },
        { id: 'enoden', name: 'Enoshima Electric Railway', cars: 2, body: '#f2ecd0', bands: [[13, 7, '#2e7d4f']], panto: [0], pantoType: 'diamond' },
        { id: 'n700', name: 'Tōkaidō Shinkansen N700', cars: 4, nose: true, speed: 2.6, body: '#f7f7f7', bands: [[14, 2, '#1d4fa0'], [17, 1, '#1d4fa0']], panto: [1] },
        { id: 'doctor-yellow', name: 'Doctor Yellow', weight: 0, cars: 4, nose: true, speed: 4, body: '#ffd800', bands: [[14, 2, '#1d4fa0']], panto: [1] }
    ];

    function livery(id) {
        for (var i = 0; i < LIVERIES.length; i++) if (LIVERIES[i].id === id) return LIVERIES[i];
        return null;
    }

    function pickLivery(not) {
        var pool = [];
        LIVERIES.forEach(function (l) {
            var w = l.weight === undefined ? 1 : l.weight;
            if (l !== not) for (var i = 0; i < w; i++) pool.push(l);
        });
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function isDark() {
        var theme = document.documentElement.getAttribute('data-theme');
        if (theme) return theme === 'dark';
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    /* ---------- drawing ---------- */
    var svgCount = 0;
    function scale() {
        return window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 4 / 3 : 2;
    }

    function trainSvg(l, factor) {
        var n = l.cars || 3;
        var CW = 36;
        var G = 2;
        var back = l.nose ? 8 : 2;
        var front = l.nose ? 8 : 6;
        var W = back + n * CW + (n - 1) * G + front;
        var id = 'ts-train-' + ++svgCount;
        var win = isDark() ? '#ffe9a0' : l.win || NAVY;
        var shapes = [];
        var out = [];

        function rect(x, y, w, h, c) {
            return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + (c ? ' fill="' + c + '"' : '') + ' />';
        }
        function poly(points) {
            return '<polygon points="' + points.join(' ') + '" />';
        }

        for (var i = 0; i < n; i++) {
            var x0 = back + i * (CW + G);
            if (l.nose && i === n - 1) {
                var xe = x0 + CW + front;
                shapes.push(poly([x0, 4, x0 + CW - 14, 4, xe - 4, 11, xe, 17, xe, 20, x0, 20]));
            } else if (l.nose && i === 0) {
                shapes.push(poly([x0 + CW, 4, x0 + 14, 4, 4, 11, 0, 17, 0, 20, x0 + CW, 20]));
            } else {
                shapes.push(rect(x0, 4, CW, 16));
            }
        }
        if (!l.nose) {
            shapes.push(rect(0, 8, 4, 10));
            shapes.push(rect(W - 8, 8, 6, 10));
        }

        out.push('<defs><clipPath id="' + id + '">' + shapes.join('') + '</clipPath></defs>');
        out.push('<g clip-path="url(#' + id + ')">' + rect(0, 0, W, 24, l.body));
        if (l.roof) out.push(rect(0, 4, W, 2, l.roof));
        (l.bands || []).forEach(function (b) {
            out.push(rect(0, b[0], W, b[1], b[2]));
        });
        out.push('</g>');

        for (i = 0; i < n; i++) {
            x0 = back + i * (CW + G);
            var first = l.nose && i === 0 ? 2 : 0;
            var last = l.nose && i === n - 1 ? 2 : 4;
            for (var w = first; w < last; w++) out.push(rect(x0 + 6 + w * 8, 7, 5, 5, win));
            out.push(rect(x0 + 4, 20, 4, 3, '#333'));
            out.push(rect(x0 + 28, 20, 4, 3, '#333'));
        }

        // pantographs sit on the roof (y 0-4) and touch the overhead wire
        (l.panto || []).forEach(function (car) {
            var x = back + car * (CW + G) + 14;
            if (l.pantoType === 'diamond') {
                out.push(rect(x, 0, 8, 1, '#333') + rect(x + 1, 1, 1, 1, '#333') + rect(x + 6, 1, 1, 1, '#333'));
                out.push(rect(x + 2, 2, 1, 1, '#333') + rect(x + 5, 2, 1, 1, '#333') + rect(x + 1, 3, 6, 1, '#333'));
            } else {
                out.push(rect(x, 0, 7, 1, '#333') + rect(x + 2, 1, 2, 1, '#333') + rect(x + 4, 2, 1, 1, '#333') + rect(x, 3, 6, 1, '#333'));
            }
        });

        var light = l.light || '#ffd400';
        if (l.nose) {
            out.push(rect(W - front - 10, 6, 6, 3, NAVY));
            out.push(rect(W - 4, 16, 2, 1, light));
        } else {
            out.push(rect(0, 9, 3, 4, win));
            out.push(rect(W - 6, 9, 4, 4, win));
            out.push(rect(W - 4, 15, 2, 2, light));
        }

        return (
            '<svg viewBox="0 0 ' + W + ' 24" width="' + Math.round(W * factor) + '" height="' + Math.round(24 * factor) +
            '" aria-hidden="true" shape-rendering="crispEdges" style="width:' + Math.round(W * factor) + 'px;height:' +
            Math.round(24 * factor) + 'px">' + out.join('') + '</svg>'
        );
    }

    /* ---------- helpers ---------- */
    var props = [];
    var SPEED = 115; // px per second

    function wait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function vw() {
        return document.documentElement.clientWidth || window.innerWidth;
    }

    // An actor is anything that drives along the track: the main train or an extra one.
    function dress(el, l, opts) {
        opts = opts || {};
        var old = el.querySelector('svg');
        if (old) el.removeChild(old);
        el.insertAdjacentHTML('afterbegin', trainSvg(l, scale() * (opts.size || 1)));
        var svg = el.querySelector('svg');
        el.ltr = !opts.rtl;
        svg.style.transform = opts.rtl ? 'scaleX(-1)' : '';
        el.style.opacity = '';
        el.style.transformOrigin = '';
        el.x = 0;
        el.extra = '';
        el.speed = SPEED * (l.speed || 1);
        el.title = l.name + ' — ﾌｧｧｧﾝ!';
        return svg.getBoundingClientRect().width;
    }

    function place(el, x, extra) {
        el.x = x;
        if (extra !== undefined) el.extra = extra;
        el.style.transform = 'translateX(' + x + 'px)' + (el.extra ? ' ' + el.extra : '');
    }

    function animate(el, frames, ms, easing) {
        var anim = el.animate(frames, { duration: Math.max(ms, 1), easing: easing || 'linear', fill: 'forwards' });
        return anim.finished.then(function () {
            el.style.transform = frames[frames.length - 1].transform || el.style.transform;
            if (frames[frames.length - 1].opacity !== undefined) el.style.opacity = frames[frames.length - 1].opacity;
            anim.cancel();
        });
    }

    // Drive to x. Without a duration, it goes at the actor's own speed.
    function drive(el, x, opts) {
        opts = opts || {};
        var from = 'translateX(' + el.x + 'px)' + (el.extra ? ' ' + el.extra : '');
        if (opts.extra !== undefined) el.extra = opts.extra;
        var to = 'translateX(' + x + 'px)' + (el.extra ? ' ' + el.extra : '');
        var ms = opts.ms || (Math.abs(x - el.x) / (el.speed * (opts.boost || 1))) * 1000;
        el.x = x;
        return animate(el, [{ transform: from }, { transform: to }], ms, opts.easing);
    }

    function prop(cls, html, x, extraStyle) {
        var el = document.createElement('div');
        el.className = 'train-prop ' + cls;
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = html || '';
        el.style.left = x + 'px';
        if (extraStyle) for (var k in extraStyle) el.style[k] = extraStyle[k];
        document.body.appendChild(el);
        props.push(el);
        return el;
    }

    function extraTrain(l, opts) {
        var el = prop('pixel-train extra-train' + (opts.back ? ' on-back-track' : ''), '', 0);
        el.width = dress(el, l, opts);
        return el;
    }

    // A speech bubble that rides along with an actor.
    function say(el, text, ms, cls) {
        var bubble = document.createElement('span');
        bubble.className = 'train-say' + (cls ? ' ' + cls : '');
        bubble.setAttribute('aria-hidden', 'true');
        bubble.textContent = text;
        el.appendChild(bubble);
        setTimeout(function () {
            if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
        }, ms || 1800);
    }

    function cleanup() {
        props.forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        props = [];
        Array.prototype.forEach.call(train.querySelectorAll('.train-say'), function (b) {
            b.parentNode.removeChild(b);
        });
        train.style.opacity = '';
        train.style.transformOrigin = '';
        place(train, -2000, '');
    }

    /* ---------- scenarios ---------- */
    // Each one gets the main train already dressed (ltr unless it says so) and returns a Promise.
    var SCENARIOS = {
        // the everyday drive-by, now and then in the other direction
        normal: {
            weight: 60,
            run: function (w) {
                var W = vw();
                if (Math.random() < 0.3) {
                    w = dress(train, train.livery, { rtl: true });
                    place(train, W);
                    return drive(train, -w);
                }
                place(train, -w);
                return drive(train, W);
            }
        },

        // 踏切: the train waits at a level crossing like a car would
        crossing: {
            weight: 6,
            run: function (w) {
                var W = vw();
                var cx = Math.round(W * 0.62);
                var s = scale();
                var crossing = prop(
                    'crossing',
                    '<svg viewBox="0 0 20 40" width="' + 20 * s + '" height="' + 40 * s + '" shape-rendering="crispEdges">' +
                        '<rect x="9" y="4" width="2" height="36" fill="#555" />' +
                        '<rect x="5" y="2" width="10" height="2" fill="#ffd400" transform="rotate(30 10 3)" />' +
                        '<rect x="5" y="2" width="10" height="2" fill="#ffd400" transform="rotate(-30 10 3)" />' +
                        '<rect x="3" y="9" width="14" height="1" fill="#222" />' +
                        '<rect class="lamp lamp-a" x="3" y="10" width="4" height="4" />' +
                        '<rect class="lamp lamp-b" x="13" y="10" width="4" height="4" />' +
                        '<rect x="7" y="16" width="6" height="3" fill="#222" />' +
                        '<rect x="7" y="19" width="6" height="2" fill="#ffd400" />' +
                    '</svg><span class="crossing-arm"></span>',
                    cx
                );
                var arm = crossing.querySelector('.crossing-arm');
                arm.style.width = 26 * s + 'px';
                arm.style.height = 2 * s + 'px';
                arm.style.left = -16 * s + 'px';
                arm.style.bottom = 12 * s + 'px';
                var armTip = cx - 16 * s;
                place(train, -w);
                return wait(50)
                    .then(function () {
                        crossing.classList.add('down');
                        say(crossing, 'カンカンカン', 9000, 'say-red');
                        return drive(train, armTip - 8 - w - 60);
                    })
                    .then(function () {
                        return drive(train, armTip - 8 - w, { ms: 1400, easing: 'ease-out' });
                    })
                    .then(function () {
                        say(train, '…', 2000);
                        return wait(2200);
                    })
                    .then(function () {
                        crossing.classList.add('whoosh');
                        say(crossing, 'ガタンゴトン!!', 1500);
                        return wait(1800);
                    })
                    .then(function () {
                        crossing.classList.remove('down');
                        return wait(900);
                    })
                    .then(function () {
                        say(train, 'ヨシ！', 1400);
                        return wait(900);
                    })
                    .then(function () {
                        return drive(train, train.x + 80, { ms: 1400, easing: 'ease-in' });
                    })
                    .then(function () {
                        return drive(train, W);
                    });
            }
        },

        // two trains passing each other on parallel tracks
        pass: {
            weight: 7,
            run: function (w) {
                var W = vw();
                var other = extraTrain(pickLivery(train.livery), { rtl: true, back: true, size: 0.8 });
                place(train, -w);
                place(other, W);
                var meet = (W + w) / (train.speed + other.speed);
                setTimeout(function () {
                    say(train, 'ﾌｧﾝ♪', 1200);
                    say(other, 'ﾌｧﾝ♪', 1200);
                }, meet * 1000 - 300);
                return Promise.all([drive(train, W), drive(other, -other.width)]);
            }
        },

        // ...and the version where they are on the same track
        crash: {
            weight: 3,
            run: function (w) {
                var W = vw();
                var other = extraTrain(pickLivery(train.livery), { rtl: true });
                var mid = Math.round(W / 2);
                place(train, -w);
                place(other, W);
                var ms = (Math.max(mid, W - mid) / SPEED) * 1000;
                setTimeout(function () {
                    say(train, '!?', 900);
                    say(other, '!?', 900);
                }, ms - 1100);
                return Promise.all([drive(train, mid - w, { ms: ms }), drive(other, mid, { ms: ms })])
                    .then(function () {
                        var boom = prop('train-boom', '<span>ドカーン!!</span>', mid);
                        boom.style.marginLeft = '-60px';
                        train.style.transformOrigin = 'left bottom';
                        other.style.transformOrigin = 'right bottom';
                        return Promise.all([
                            drive(train, mid - w - 26, { ms: 500, easing: 'ease-out', extra: 'rotate(-7deg)' }),
                            drive(other, mid + 26, { ms: 500, easing: 'ease-out', extra: 'rotate(7deg)' })
                        ]);
                    })
                    .then(function () {
                        return Promise.all([
                            drive(train, train.x, { ms: 400, easing: 'ease-in', extra: 'rotate(-2deg)' }),
                            drive(other, other.x, { ms: 400, easing: 'ease-in', extra: 'rotate(2deg)' })
                        ]);
                    })
                    .then(function () {
                        return wait(1800);
                    })
                    .then(function () {
                        say(train, 'すみません…', 2600);
                        say(other, '申し訳ございません…', 2600);
                        // the apology bow
                        var bow = function (el, deg) {
                            return drive(el, el.x, { ms: 450, easing: 'ease-in-out', extra: 'rotate(' + deg + 'deg)' });
                        };
                        return Promise.all([bow(train, 4), bow(other, -4)])
                            .then(function () {
                                return Promise.all([bow(train, -2), bow(other, 2)]);
                            })
                            .then(function () {
                                return Promise.all([bow(train, 4), bow(other, -4)]);
                            });
                    })
                    .then(function () {
                        return wait(1200);
                    })
                    .then(function () {
                        var fade = [{ opacity: 1 }, { opacity: 0 }];
                        return Promise.all([animate(train, fade, 800), animate(other, fade, 800)]);
                    });
            }
        },

        // the famous meme
        drift: {
            weight: 3,
            run: function (w) {
                var W = vw();
                var gap = 7.5 * scale();
                var rails = prop('drift-rails', '<i></i><i></i><i></i>', 0);
                Array.prototype.forEach.call(rails.children, function (rail, i) {
                    rail.style.bottom = i * gap + 'px';
                });
                var ghosts = [1, 2].map(function (i) {
                    var g = extraTrain(train.livery, { back: true });
                    g.style.bottom = 6 + i * gap + 'px';
                    g.style.opacity = '0';
                    return g;
                });
                var all = [train].concat(ghosts);
                all.forEach(function (el) {
                    place(el, -w);
                });
                var mid = Math.round(W / 2 - w / 2);
                return drive(train, mid - 140, { boost: 2.5 })
                    .then(function () {
                        rails.classList.add('on');
                        ghosts.forEach(function (g, i) {
                            place(g, mid - 140);
                            animate(g, [{ opacity: 0 }, { opacity: 0.55 - i * 0.2 }], 300);
                        });
                        prop('drift-sparks', '<i></i><i></i><i></i><i></i><i></i><i></i>', mid - 40);
                        var burst = prop('train-manga', 'MULTI-<br />TRACK<br />DRIFTING!!', Math.min(mid + w / 2, W - 190));
                        burst.style.marginLeft = '-20px';
                        return Promise.all(all.map(function (el) {
                            return drive(el, mid, { ms: 1100, easing: 'ease-out', extra: 'skewX(-14deg) rotate(-2deg)' });
                        }));
                    })
                    .then(function () {
                        return wait(1600);
                    })
                    .then(function () {
                        return Promise.all(all.map(function (el) {
                            return drive(el, W + 40, { boost: 3, easing: 'ease-in' });
                        }));
                    });
            }
        },

        // seeing the yellow inspection Shinkansen is said to bring good luck
        doctorYellow: {
            weight: 4,
            livery: 'doctor-yellow',
            run: function (w) {
                var W = vw();
                place(train, -w);
                setTimeout(function () {
                    prop('train-lucky', '✨ ドクターイエロー！ ✨<small>見ると幸せになれる — lucky you!</small>', Math.round(W / 2));
                }, ((W / 2 + w) / train.speed) * 1000 - 400);
                return drive(train, W).then(function () {
                    return wait(2200);
                });
            }
        },

        // overshoots the stop marker, then backs up (yes, they really do this)
        overrun: {
            weight: 5,
            run: function (w) {
                var W = vw();
                var cx = Math.round(W * 0.55);
                prop('stop-marker', '<span>' + (train.livery.cars || 3) + '</span>', cx);
                place(train, -w);
                return drive(train, cx - w - 120)
                    .then(function () {
                        return drive(train, cx - w + 34, { ms: 2200, easing: 'ease-out' });
                    })
                    .then(function () {
                        say(train, 'あっ…', 1400);
                        return wait(1500);
                    })
                    .then(function () {
                        return drive(train, cx - w, { ms: 1600, easing: 'ease-in-out' });
                    })
                    .then(function () {
                        say(train, '停止位置ヨシ！', 1600);
                        return wait(2400);
                    })
                    .then(function () {
                        return drive(train, cx - w + 120, { ms: 2000, easing: 'ease-in' });
                    })
                    .then(function () {
                        return drive(train, W);
                    });
            }
        },

        // a stationmaster cat (hi Tama) sits on the tracks
        cat: {
            weight: 5,
            run: function (w) {
                var W = vw();
                var cx = Math.round(W * 0.58);
                var cat = prop(
                    'track-cat',
                    '<svg viewBox="0 0 14 12" width="' + 21 * scale() + '" height="' + 18 * scale() + '" shape-rendering="crispEdges">' +
                        '<rect x="3" y="0" width="6" height="2" fill="#1d2b5c" /><rect x="5" y="1" width="2" height="1" fill="#ffd400" />' +
                        '<rect x="3" y="2" width="1" height="1" fill="#e08a2c" /><rect x="8" y="2" width="1" height="1" fill="#222" />' +
                        '<rect x="3" y="3" width="6" height="4" fill="#fff" /><rect x="3" y="3" width="2" height="2" fill="#e08a2c" />' +
                        '<rect x="7" y="3" width="2" height="1" fill="#222" />' +
                        '<rect x="4" y="4" width="1" height="1" fill="#222" /><rect x="7" y="4" width="1" height="1" fill="#222" />' +
                        '<rect x="2" y="7" width="9" height="4" fill="#fff" /><rect x="6" y="7" width="3" height="2" fill="#e08a2c" />' +
                        '<rect x="9" y="8" width="2" height="2" fill="#222" /><rect x="11" y="6" width="1" height="4" fill="#e08a2c" />' +
                        '<rect x="12" y="5" width="1" height="2" fill="#e08a2c" />' +
                        '<rect x="2" y="11" width="2" height="1" fill="#fff" /><rect x="8" y="11" width="2" height="1" fill="#fff" />' +
                    '</svg>',
                    cx
                );
                place(train, -w);
                return drive(train, cx - w - 140)
                    .then(function () {
                        return drive(train, cx - w - 14, { ms: 1800, easing: 'ease-out' });
                    })
                    .then(function () {
                        say(train, '…ねこ？', 1600);
                        return wait(1800);
                    })
                    .then(function () {
                        say(cat, 'にゃ〜', 1500);
                        return wait(1700);
                    })
                    .then(function () {
                        say(train, 'お疲れ様です、駅長！', 1800);
                        return wait(1300);
                    })
                    .then(function () {
                        cat.classList.add('leaving');
                        return wait(1200);
                    })
                    .then(function () {
                        return drive(train, cx - w + 80, { ms: 1500, easing: 'ease-in' });
                    })
                    .then(function () {
                        return drive(train, W);
                    });
            }
        },

        // Tokyo rush hour: it stops and gets squeezed
        rushHour: {
            weight: 5,
            run: function (w) {
                var W = vw();
                var stop = Math.round(W / 2 - w / 2);
                var svg = train.querySelector('svg');
                place(train, -w);
                return drive(train, stop - 140)
                    .then(function () {
                        return drive(train, stop, { ms: 2000, easing: 'ease-out' });
                    })
                    .then(function () {
                        say(train, 'ぎゅうぎゅう…', 2400);
                        return animate(
                            svg,
                            [
                                { transform: 'scale(1, 1)' },
                                { transform: 'scale(0.97, 1.12)' },
                                { transform: 'scale(1.02, 0.96)' },
                                { transform: 'scale(0.96, 1.16)' },
                                { transform: 'scale(1.01, 0.97)' },
                                { transform: 'scale(0.95, 1.2)' },
                                { transform: 'scale(1, 1)' }
                            ],
                            2400,
                            'ease-in-out'
                        );
                    })
                    .then(function () {
                        svg.style.transform = '';
                        say(train, 'もう乗れません！', 1500);
                        return wait(1500);
                    })
                    .then(function () {
                        return drive(train, stop + 140, { ms: 2200, easing: 'ease-in' });
                    })
                    .then(function () {
                        return drive(train, W);
                    });
            }
        }
    };

    /* ---------- the timetable ---------- */
    var params = new URLSearchParams(window.location.search);
    var forced = SCENARIOS[params.get('train')] ? params.get('train') : null;
    var forcedLivery = livery(params.get('livery'));

    function pickScenario() {
        if (forced) return forced;
        var names = Object.keys(SCENARIOS);
        var total = names.reduce(function (sum, k) {
            return sum + SCENARIOS[k].weight;
        }, 0);
        var roll = Math.random() * total;
        for (var i = 0; i < names.length; i++) {
            roll -= SCENARIOS[names[i]].weight;
            if (roll < 0) return names[i];
        }
        return 'normal';
    }

    function run() {
        if (document.hidden) return schedule(5000);
        var name = pickScenario();
        var scenario = SCENARIOS[name];
        train.livery = forcedLivery || livery(scenario.livery) || pickLivery();
        var w = dress(train, train.livery);
        train.setAttribute('data-scenario', name);
        scenario
            .run(w)
            .catch(function () {})
            .then(function () {
                cleanup();
                schedule(forced ? 3000 : 25000 + Math.random() * 30000);
            });
    }

    function schedule(ms) {
        setTimeout(run, ms);
    }

    document.documentElement.classList.add('train-js');
    place(train, -2000);
    schedule(4000);
})();
