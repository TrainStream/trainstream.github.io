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
    function showCount(number, note) {
        var digits = String(Math.max(0, Math.floor(number))).padStart(7, '0');
        var box = document.getElementById('counter-digits');
        box.textContent = '';
        digits.split('').forEach(function (d) {
            var span = document.createElement('span');
            span.textContent = d;
            box.appendChild(span);
        });
        document.getElementById('counter-en').textContent = Number(number).toLocaleString('en-US') + (note || '');
        var kiriban = document.getElementById('kiriban');
        var isKiriban = /^(\d)\1+$/.test(digits.replace(/^0+/, '')) || /(000|777)$/.test(digits);
        if (isKiriban) {
            kiriban.hidden = false;
            kiriban.textContent = '🎉 キリ番ゲット！ Kiriban get! Screenshot it and post it in the thread for eternal glory 🎉';
        }
    }
    function jokeCount() {
        var since = new Date((counter.dataset.since || '2018-05-03') + 'T00:00:00Z').getTime();
        var days = Math.floor((Date.now() - since) / 86400000);
        var visits = parseInt(store('ts.visits') || '0', 10) + 1;
        store('ts.visits', String(visits));
        var n = 1337 + days * 41 + new Date().getHours() * 3 + visits;
        if (Math.random() < 1 / 30) n = 777777;
        counter.title = 'This counter is a joke. The number is made up (´・ω・`)';
        showCount(n, ' (probably)');
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
                    showCount(n);
                })
                .catch(jokeCount);
        } else {
            jokeCount();
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
