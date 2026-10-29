/* TrainStream — shared behaviour for every new-style page. */
(function () {
    'use strict';

    function store(key, value) {
        try {
            if (value === undefined) return localStorage.getItem(key);
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch (e) {
            return null;
        }
        return null;
    }

    window.TSStore = store;

    /* ---------- ticket machine menu ---------- */
    var menu = document.getElementById('menu');
    if (menu) {
        document.addEventListener('click', function (event) {
            if (menu.open && !menu.contains(event.target)) menu.open = false;
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && menu.open) {
                menu.open = false;
                menu.querySelector('summary').focus();
            }
        });
    }

    /* ---------- classic view preference ---------- */
    document.querySelectorAll('[data-set-style="classic"]').forEach(function (link) {
        link.addEventListener('click', function () {
            store('trainstreamStyle', 'classic');
        });
    });

    /* ---------- night mode ---------- */
    var themeToggle = document.getElementById('theme-toggle');
    function isDark() {
        var forced = document.documentElement.getAttribute('data-theme');
        if (forced) return forced === 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    function syncThemeLabel() {
        if (!themeToggle) return;
        var dark = isDark();
        themeToggle.querySelector('.icon').textContent = dark ? '☀️' : '🌙';
        themeToggle.querySelector('.ja').textContent = dark ? '昼の列車' : '夜行列車';
        themeToggle.querySelector('.en').textContent = dark ? 'Day mode' : 'Night mode';
    }
    if (themeToggle) {
        syncThemeLabel();
        themeToggle.addEventListener('click', function () {
            var next = isDark() ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            store('ts.theme', next);
            syncThemeLabel();
        });
    }

    /* ---------- LED ticker: keep a constant reading speed ---------- */
    var led = document.getElementById('led-text');
    function tuneTicker() {
        if (!led) return;
        var pixelsPerSecond = 90;
        var distance = led.scrollWidth;
        led.style.animationDuration = Math.max(20, Math.round(distance / pixelsPerSecond)) + 's';
        // whole-pixel steps keep the text sharp while it moves, like a real LED board
        led.style.animationTimingFunction = 'steps(' + Math.max(1, Math.round(distance)) + ')';
    }
    window.TSTicker = {
        add: function (text, first) {
            if (!led) return;
            var span = document.createElement('span');
            span.textContent = text;
            if (first) led.insertBefore(span, led.firstChild);
            else led.appendChild(span);
            tuneTicker();
        },
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(tuneTicker);
    tuneTicker();

    /* ---------- visitor counter (joke or real) ---------- */
    var counter = document.getElementById('counter');
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var currentCount = 0;
    var hitKiriban = false;

    function renderDigits(number) {
        var digits = String(Math.max(0, Math.floor(number))).padStart(7, '0');
        var box = document.getElementById('counter-digits');
        box.textContent = '';
        digits.split('').forEach(function (d) {
            var span = document.createElement('span');
            span.textContent = d;
            box.appendChild(span);
        });
    }

    /* キリ番: repeated digits (777, 5555), round thousands, ...777 endings and 12345-style runs */
    function isKiriban(n) {
        var s = String(n);
        return n >= 100 && (/^(\d)\1+$/.test(s) || /000$/.test(s) || /777$/.test(s) || '1234567890'.indexOf(s) === 0);
    }

    function checkKiriban(n) {
        var box = document.getElementById('kiriban');
        if (isKiriban(n)) {
            hitKiriban = true;
            box.hidden = false;
            box.textContent = '🎉 キリ番ゲット！ Kiriban get! No.' + n.toLocaleString('en-US') + '. Screenshot it and post it in the thread for eternal glory 🎉';
        } else if (!hitKiriban && (isKiriban(n - 1) || isKiriban(n + 1))) {
            box.hidden = false;
            box.textContent = '前後賞！ So close… one away from a キリ番 (´；ω；`)';
        } else if (!hitKiriban) {
            box.hidden = true;
        }
    }

    function showCount(number, note) {
        currentCount = Math.max(0, Math.floor(number));
        renderDigits(currentCount);
        document.getElementById('counter-en').textContent = currentCount.toLocaleString('en-US') + (note || '');
        checkKiriban(currentCount);
    }

    /* the odometer spins up from zero, then settles on the number */
    function rollTo(target, note, done) {
        if (reduceMotion) {
            showCount(target, note);
            if (done) done();
            return;
        }
        var start = null;
        var duration = 1400;
        function frame(time) {
            if (start === null) start = time;
            var t = Math.min(1, (time - start) / duration);
            var eased = 1 - Math.pow(1 - t, 3);
            renderDigits(Math.floor(target * eased));
            if (t < 1) requestAnimationFrame(frame);
            else {
                showCount(target, note);
                if (done) done();
            }
        }
        requestAnimationFrame(frame);
    }

    /* other "visitors" keep arriving while you read */
    function keepTicking(note) {
        var noteBox = document.getElementById('counter-note');
        var shown = currentCount;
        function tick() {
            var groupTour = Math.random() < 1 / 15;
            var add = groupTour ? 40 + Math.floor(Math.random() * 20) : 1 + Math.floor(Math.random() * 3);
            // only the odometer (everyone) moves; "your" number stays the one you arrived with
            shown += add;
            renderDigits(shown);
            if (groupTour) {
                noteBox.hidden = false;
                noteBox.textContent = '🚌 団体様ご来店！ A tour group just arrived (+' + add + ')';
                setTimeout(function () {
                    noteBox.hidden = true;
                }, 4000);
            }
            setTimeout(tick, 4000 + Math.random() * 5000);
        }
        setTimeout(tick, 4000 + Math.random() * 5000);
    }

    /* 回数券: one punch per visit (per browser session), the 11th ride is free */
    function countVisit() {
        var visits = parseInt(store('ts.visits') || '0', 10);
        var counted = false;
        try {
            counted = sessionStorage.getItem('ts.visit') === '1';
            sessionStorage.setItem('ts.visit', '1');
        } catch (e) {}
        if (!counted) {
            visits += 1;
            store('ts.visits', String(visits));
        }
        return Math.max(1, visits);
    }

    function showKaisuken(visits) {
        var box = document.getElementById('kaisuken');
        if (!box) return;
        var punched = visits % 11 || 11;
        var holes = '';
        for (var i = 1; i <= 11; i++) holes += i <= punched ? '●' : '○';
        if (punched === 11) {
            box.textContent = '🎫 回数券 ' + holes + '  無料乗車！ Free ride! 乗車記念 Thank you for riding TrainStream (visit ' + visits + ')';
            box.classList.add('is-free');
        } else {
            box.textContent = '🎫 回数券 Coupon ticket ' + holes + '  ' + (11 - punched) + ' more visit' + (11 - punched === 1 ? '' : 's') + ' until your free ride';
        }
    }

    function jokeCount(visits) {
        var since = new Date((counter.dataset.since || '2018-05-03') + 'T00:00:00Z').getTime();
        var days = Math.floor((Date.now() - since) / 86400000);
        var n = 1337 + days * 41 + new Date().getHours() * 3 + visits;
        var luck = Math.random();
        if (luck < 1 / 40) n = Math.ceil(n / 1000) * 1000; // a キリ番
        else if (luck < 2 / 40) n = Math.ceil(n / 1000) * 1000 - 1; // 前後賞
        counter.title = 'This counter is a joke. The number is made up (´・ω・`)';
        rollTo(n, ' (probably)', function () {
            keepTicking(' (probably)');
        });
    }

    function pickNumber(obj) {
        if (typeof obj === 'number') return obj;
        if (!obj || typeof obj !== 'object') return null;
        var keys = ['up_count', 'count', 'value', 'total'];
        for (var i = 0; i < keys.length; i++) {
            if (typeof obj[keys[i]] === 'number') return obj[keys[i]];
        }
        return pickNumber(obj.data);
    }

    if (counter) {
        var visits = countVisit();
        showKaisuken(visits);
        var workspace = counter.dataset.workspace;
        if (counter.dataset.mode === 'real' && workspace) {
            var counted = false;
            try {
                counted = sessionStorage.getItem('ts.counted') === '1';
            } catch (e) {}
            var base = 'https://api.counterapi.dev/v2/' + encodeURIComponent(workspace) + '/' + encodeURIComponent(counter.dataset.name || 'visits');
            fetch(counted ? base : base + '/up')
                .then(function (r) {
                    if (!r.ok) throw new Error('counter ' + r.status);
                    return r.json();
                })
                .then(function (json) {
                    var n = pickNumber(json);
                    if (n === null) throw new Error('counter: unknown response');
                    try {
                        sessionStorage.setItem('ts.counted', '1');
                    } catch (e) {}
                    rollTo(n);
                })
                .catch(function () {
                    jokeCount(visits);
                });
        } else {
            jokeCount(visits);
        }
    }

    /* ---------- pixel train horn ---------- */
    var train = document.getElementById('pixel-train');
    var horn = document.getElementById('horn');
    var hornTexts = ['ﾌｧｧｧﾝ!!', 'ﾌｧﾝﾌｧﾝ♪', 'プァーン！', 'がたんごとん…', 'しゅっぱつしんこう！', 'Choo choo!'];
    function playHorn() {
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            var ctx = new AudioCtx();
            var gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
            gain.connect(ctx.destination);
            [311, 370, 466].forEach(function (freq) {
                var osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                osc.connect(gain);
                osc.start();
                osc.stop(ctx.currentTime + 0.95);
            });
            setTimeout(function () {
                ctx.close();
            }, 1200);
        } catch (e) {}
    }
    if (train && horn) {
        train.addEventListener('click', function () {
            horn.textContent = hornTexts[Math.floor(Math.random() * hornTexts.length)];
            horn.classList.remove('honk');
            void horn.offsetWidth;
            horn.classList.add('honk');
            playHorn();
        });
    }
})();
