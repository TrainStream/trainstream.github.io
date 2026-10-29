/*
 * TrainStream — YouTube channel links (@name/streams, /channel/UC…, /c/…, /user/…),
 * shared by the TV wall (browser) and scripts/check-live.mjs (Node), so both
 * key a channel the same way in live.json.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TSChannel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* "@name", "c/name", "user/name" (lowercased: YouTube ignores case there) or "channel/UC…" (case kept) */
    function channelKey(url) {
        var m = String(url || '').match(/youtube\.com\/(@[^\/?#\s]+|channel\/UC[\w-]{22}|c\/[^\/?#\s]+|user\/[^\/?#\s]+)/i);
        if (!m) return null;
        var path = m[1];
        try {
            path = decodeURIComponent(path);
        } catch (e) {
            /* keep it encoded */
        }
        path = path.normalize('NFC');
        if (/^channel\//i.test(path)) return 'channel/' + path.slice(8);
        return path.toLowerCase();
    }

    function streamsUrl(key) {
        return 'https://www.youtube.com/' + encodeURI(key) + '/streams';
    }

    return {
        channelKey: channelKey,
        streamsUrl: streamsUrl,
    };
});
