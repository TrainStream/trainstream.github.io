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
        { id: 'n700', name: 'Tōkaidō Shinkansen N700', cars: 4, nose: true, speed: 1.8, body: '#f7f7f7', bands: [[14, 2, '#1d4fa0'], [17, 1, '#1d4fa0']], panto: [1] },
        // the last night train in Japan, only after dark
        { id: 'sunrise', name: 'Sunrise Izumo / Seto 285', weight: 0, cars: 4, speed: 0.85, lit: true, body: '#e8dcc4', bands: [[13, 1, '#c9a24a'], [14, 6, '#8b2a2a']], light: '#fff6c0', panto: [1] },
        { id: 'doctor-yellow', name: 'Doctor Yellow', weight: 0, cars: 4, nose: true, speed: 2.6, body: '#ffd800', bands: [[14, 2, '#1d4fa0']], panto: [1] }
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

    function trainSvg(l, factor, plough) {
        var n = l.cars || 3;
        var CW = 36;
        var G = 2;
        var back = l.nose ? 8 : 2;
        var front = l.nose ? 8 : 6;
        var W = back + n * CW + (n - 1) * G + front;
        var id = 'ts-train-' + ++svgCount;
        var win = l.lit || isDark() ? '#ffe9a0' : l.win || NAVY;
        var extra = plough ? 6 : 0;
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
        // a yellow-and-black snowplough on the front
        if (plough) {
            out.push('<polygon points="' + [W - 4, 15, W + 6, 23, W - 4, 23].join(' ') + '" fill="#ffd400" />');
            out.push(rect(W - 4, 20, 4, 3, '#1b1f3b') + rect(W + 1, 21, 2, 2, '#1b1f3b'));
        }
        W += extra;

        return (
            '<svg viewBox="0 0 ' + W + ' 24" width="' + Math.round(W * factor) + '" height="' + Math.round(24 * factor) +
            '" aria-hidden="true" shape-rendering="crispEdges" style="width:' + Math.round(W * factor) + 'px;height:' +
            Math.round(24 * factor) + 'px">' + out.join('') + '</svg>'
        );
    }

    /* ---------- helpers ---------- */
    var props = [];
    var SPEED = 115; // px per second, the same for every train unless its livery says otherwise
    var runId = 0; // bumped to abort the current run (tab hidden)
    var ABORT = {};
    var timer;

    function guard(id) {
        if (id !== runId) throw ABORT;
    }

    function wait(ms) {
        var id = runId;
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        }).then(function () {
            guard(id);
        });
    }

    // setTimeout that does nothing once the run is over
    function later(fn, ms) {
        var id = runId;
        setTimeout(function () {
            if (id === runId) fn();
        }, ms);
    }

    function vw() {
        return document.documentElement.clientWidth || window.innerWidth;
    }

    // An actor is anything that drives along the track: the main train or an extra one.
    function dress(el, l, opts) {
        opts = opts || {};
        var old = el.querySelector('svg');
        if (old) el.removeChild(old);
        el.insertAdjacentHTML('afterbegin', trainSvg(l, scale() * (opts.size || 1), opts.plough));
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
        var id = runId;
        var anim = el.animate(frames, { duration: Math.max(ms, 1), easing: easing || 'linear', fill: 'forwards' });
        return anim.finished.then(function () {
            guard(id);
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
        var stacked = 0;
        Array.prototype.forEach.call(el.children, function (child) {
            if (child.classList.contains('train-say')) stacked++;
        });
        if (stacked) bubble.style.bottom = 'calc(100% + ' + (10 + stacked * 32) + 'px)';
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
        Array.prototype.forEach.call(train.querySelectorAll('.train-say, .train-fx'), function (b) {
            b.parentNode.removeChild(b);
        });
        train.style.opacity = '';
        train.style.transformOrigin = '';
        place(train, -2000, '');
    }

    // Something sits on the tracks: the train stops, the lines play, it leaves.
    function blocker(w, cls, html, lines) {
        var W = vw();
        var cx = Math.round(W * 0.58);
        var animal = prop(cls + ' track-animal', html, cx);
        place(train, -w);
        var chain = drive(train, cx - w - 140).then(function () {
            return drive(train, cx - w - 14, { ms: 1800, easing: 'ease-out' });
        });
        lines.forEach(function (line) {
            chain = chain.then(function () {
                say(line[0] === 'animal' ? animal : train, line[1], 1600);
                return wait(1800);
            });
        });
        return chain
            .then(function () {
                animal.classList.add('leaving');
                return wait(1200);
            })
            .then(function () {
                return drive(train, cx - w + 80, { ms: 1500, easing: 'ease-in' });
            })
            .then(function () {
                return drive(train, W);
            });
    }

    /* ---------- scenarios ---------- */
    // Each one gets the main train already dressed (ltr unless it says so) and returns a Promise.
    var SCENARIOS = {
        // the everyday drive-by, now and then in the other direction
        normal: {
            weight: 30,
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
            weight: 8,
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
            weight: 9,
            run: function (w) {
                var W = vw();
                var other = extraTrain(pickLivery(train.livery), { rtl: true, back: true, size: 0.8 });
                place(train, -w);
                place(other, W);
                var meet = (W + w) / (train.speed + other.speed);
                later(function () {
                    say(train, 'ﾌｧﾝ♪', 1200);
                    say(other, 'ﾌｧﾝ♪', 1200);
                }, meet * 1000 - 300);
                return Promise.all([drive(train, W), drive(other, -other.width)]);
            }
        },

        // ...and the version where they are on the same track
        crash: {
            weight: 7,
            run: function (w) {
                var W = vw();
                var other = extraTrain(pickLivery(train.livery), { rtl: true });
                var mid = Math.round(W / 2);
                place(train, -w);
                place(other, W);
                var ms = (Math.max(mid, W - mid) / SPEED) * 1000;
                later(function () {
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

        // the famous meme: the train rides across the screen with its wheels on two tracks at once
        drift: {
            weight: 7,
            run: function (w) {
                var W = vw();
                var s = scale();
                var gap = Math.round(12 * s);
                var rails = prop('drift-rails', '<i></i><i></i>', 0);
                rails.children[0].style.bottom = gap + 'px';
                // lean the train so the rear wheels stay on the near rail and the front ones reach the far rail
                var lean = (Math.atan(gap / (w - 12 * s)) * 180) / Math.PI;
                var fx = document.createElement('span');
                fx.className = 'train-fx drift-fx';
                fx.innerHTML = '<b></b><b></b>';
                fx.children[0].style.left = 6 * s + 'px';
                fx.children[1].style.left = w - 14 * s + 'px';
                // sparks at both ends, smoke only from the rear so it trails behind
                Array.prototype.forEach.call(fx.children, function (wheels, i) {
                    wheels.innerHTML = '<i></i><i></i><i></i><i></i><i></i>' + (i ? '' : '<u></u><u></u><u></u>');
                });
                train.appendChild(fx);
                train.style.transformOrigin = 'left bottom';
                place(train, -w, 'skewY(' + -lean.toFixed(2) + 'deg)');
                rails.classList.add('on');
                var speed = train.speed * 1.5;
                later(function () {
                    var burst = prop('train-manga', 'MULTI-<br />TRACK<br />DRIFTING!!', Math.max(8, Math.round(W / 2 - 100)));
                    burst.style.bottom = 24 * s + gap + 40 + 'px';
                }, ((W / 2 - w / 2 + w) / speed) * 1000 - 900);
                return wait(300)
                    .then(function () {
                        return drive(train, W, { boost: 1.5 });
                    })
                    .then(function () {
                        rails.classList.remove('on');
                        return wait(400);
                    });
            }
        },

        // seeing the yellow inspection Shinkansen is said to bring good luck
        doctorYellow: {
            weight: 6,
            livery: 'doctor-yellow',
            run: function (w) {
                var W = vw();
                place(train, -w);
                later(function () {
                    prop('train-lucky', '✨ ドクターイエロー！ ✨<small>見ると幸せになれる — lucky you!</small>', Math.round(W / 2));
                }, ((W / 2 + w) / train.speed) * 1000 - 400);
                return drive(train, W).then(function () {
                    return wait(2200);
                });
            }
        },

        // overshoots the stop marker, then backs up (yes, they really do this)
        overrun: {
            weight: 7,
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
            weight: 7,
            run: function (w) {
                return blocker(w, 'track-cat',
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
                    [[train, '…ねこ？'], ['animal', 'にゃ〜'], [train, 'お疲れ様です、駅長！']]
                );
            }
        },

        // a deer that will not move (a real thing on rural lines)
        deer: {
            weight: 7,
            run: function (w) {
                var s = scale();
                return blocker(w, 'track-deer',
                    '<svg viewBox="0 0 16 16" width="' + 24 * s + '" height="' + 24 * s + '" shape-rendering="crispEdges">' +
                        '<rect x="1" y="0" width="1" height="3" fill="#6b4a2b" /><rect x="5" y="0" width="1" height="3" fill="#6b4a2b" />' +
                        '<rect x="0" y="1" width="1" height="1" fill="#6b4a2b" /><rect x="6" y="1" width="1" height="1" fill="#6b4a2b" />' +
                        '<rect x="2" y="2" width="3" height="1" fill="#6b4a2b" />' +
                        '<rect x="1" y="3" width="5" height="4" fill="#b5784a" /><rect x="2" y="4" width="1" height="1" fill="#222" />' +
                        '<rect x="0" y="5" width="2" height="2" fill="#b5784a" /><rect x="0" y="6" width="1" height="1" fill="#222" />' +
                        '<rect x="4" y="7" width="3" height="2" fill="#b5784a" />' +
                        '<rect x="4" y="8" width="11" height="4" fill="#b5784a" /><rect x="6" y="9" width="1" height="1" fill="#f4e6cf" />' +
                        '<rect x="9" y="10" width="1" height="1" fill="#f4e6cf" /><rect x="12" y="9" width="1" height="1" fill="#f4e6cf" />' +
                        '<rect x="14" y="7" width="2" height="2" fill="#f4e6cf" />' +
                        '<rect x="5" y="12" width="1" height="4" fill="#6b4a2b" /><rect x="7" y="12" width="1" height="4" fill="#6b4a2b" />' +
                        '<rect x="12" y="12" width="1" height="4" fill="#6b4a2b" /><rect x="14" y="12" width="1" height="4" fill="#6b4a2b" />' +
                    '</svg>',
                    [[train, '鹿！？'], [train, 'ﾌｧﾝ!'], ['animal', '…'], [train, 'どいてください…'], ['animal', 'ぴゃー']]
                );
            }
        },

        // the 2017 Tsukuba Express apology, but for this train
        early: {
            weight: 7,
            run: function (w) {
                var W = vw();
                var stop = Math.round(W / 2 - w / 2);
                place(train, -w);
                return drive(train, stop - 140)
                    .then(function () {
                        return drive(train, stop, { ms: 2000, easing: 'ease-out' });
                    })
                    .then(function () {
                        return wait(500);
                    })
                    .then(function () {
                        say(train, '発車！', 1000);
                        return drive(train, stop + 140, { ms: 1600, easing: 'ease-in' });
                    })
                    .then(function () {
                        prop('train-notice', '【お詫び】 列車が<b>20秒</b>早く発車いたしました。大変ご迷惑をおかけしました。' +
                            '<small>This train left 20 seconds early. We deeply apologise.</small>', Math.round(W / 2));
                        return drive(train, W);
                    })
                    .then(function () {
                        return wait(2500);
                    });
            }
        },

        // winter: a snowplough train ploughing through
        snow: {
            weight: function () {
                var month = new Date().getMonth();
                return month >= 11 || month <= 2 ? 12 : 3;
            },
            dress: { plough: true },
            run: function (w) {
                var W = vw();
                prop('snowfall', '', 0);
                var spray = document.createElement('span');
                spray.className = 'train-fx snow-spray';
                spray.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
                train.appendChild(spray);
                place(train, -w);
                return drive(train, Math.round(W / 2 - w / 2), {})
                    .then(function () {
                        say(train, 'ザザザザ…', 1600);
                        return drive(train, W, {});
                    });
            }
        },

        // after dark: the Sunrise sleeper, everyone asleep
        sleeper: {
            weight: function () {
                var hour = new Date().getHours();
                return hour >= 20 || hour < 5 ? 12 : 0;
            },
            livery: 'sunrise',
            run: function (w) {
                var W = vw();
                place(train, -w);
                [800, 4000, 7200].forEach(function (ms) {
                    later(function () {
                        say(train, 'Zzz…', 2200);
                    }, ms);
                });
                return drive(train, W);
            }
        },

        // Tokyo rush hour: it stops and gets squeezed
        rushHour: {
            weight: 7,
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
        var weights = names.map(function (k) {
            var weight = SCENARIOS[k].weight;
            return typeof weight === 'function' ? weight() : weight;
        });
        var total = weights.reduce(function (sum, x) {
            return sum + x;
        }, 0);
        var roll = Math.random() * total;
        for (var i = 0; i < names.length; i++) {
            roll -= weights[i];
            if (roll < 0) return names[i];
        }
        return 'normal';
    }

    function run() {
        if (document.hidden) return schedule(5000);
        var name = pickScenario();
        var scenario = SCENARIOS[name];
        train.livery = forcedLivery || livery(scenario.livery) || pickLivery();
        var w = dress(train, train.livery, scenario.dress);
        train.setAttribute('data-scenario', name);
        var id = ++runId;
        scenario
            .run(w)
            .catch(function (e) {
                if (e !== ABORT && window.console) console.warn('pixel train:', e);
            })
            .then(function () {
                if (id !== runId) return;
                cleanup();
                // the next one comes 12-24 seconds after this one has left
                schedule(forced ? 3000 : 12000 + Math.random() * 12000);
            });
    }

    function schedule(ms) {
        clearTimeout(timer);
        timer = setTimeout(run, ms);
    }

    // Only take over when the matching stylesheet is there (a cached old site.css has no props).
    var probe = document.createElement('div');
    probe.className = 'train-prop';
    document.body.appendChild(probe);
    var styled = window.getComputedStyle(probe).position === 'fixed';
    document.body.removeChild(probe);
    if (!styled) return;

    // Timers and animations drift apart in a background tab: drop the run, start fresh on return.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            runId++;
            clearTimeout(timer);
            [train].concat(props).forEach(function (el) {
                if (el.getAnimations) {
                    el.getAnimations({ subtree: true }).forEach(function (anim) {
                        anim.cancel();
                    });
                }
            });
            cleanup();
        } else {
            schedule(3000);
        }
    });

    train.style.animation = 'none';
    document.documentElement.classList.add('train-js');
    place(train, -2000);
    schedule(4000);
})();
