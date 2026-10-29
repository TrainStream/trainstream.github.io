/*
 * TrainStream — rules for stream entries, shared by the submit tool (browser)
 * and the GitHub Actions scripts (Node). Keeps _data/streams.json in the exact
 * format the original trainstream-editor writes: JSON.stringify(data, null, 4).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TSRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LIMITS = {
        name: 200,
        text: 300,
        description: 2000,
        url: 2000,
        images: 12,
        extras: 20,
    };

    function str(value) {
        return value === undefined || value === null ? '' : String(value).trim();
    }

    function isHttpUrl(value) {
        return /^https?:\/\/[^\s<>"]+$/i.test(value);
    }

    function isRelativeUrl(value) {
        return /^\/(?!\/)[^<>"\r\n]*$/.test(value);
    }

    function isSafeUrl(value, allowRelative) {
        return isHttpUrl(value) || (!!allowRelative && isRelativeUrl(value));
    }

    function splitTags(tags) {
        var list = Array.isArray(tags) ? tags : String(tags || '').split(',');
        var seen = {};
        return list
            .map(str)
            .filter(function (t) {
                if (!t || seen[t]) return false;
                seen[t] = true;
                return true;
            });
    }

    function toNumber(value) {
        if (value === '' || value === null || value === undefined) return undefined;
        var n = Number(value);
        return isFinite(n) ? n : NaN;
    }

    /* Builds a clean entry with a stable key order; drops empty optional fields. */
    function cleanEntry(input) {
        input = input || {};
        var entry = { name: str(input.name), isAlive: input.isAlive !== false && input.isAlive !== 'false' };
        if (str(input.id)) entry.id = str(input.id);
        entry.tags = splitTags(input.tags).join(', ');
        if (str(input.region)) entry.region = str(input.region);
        var lat = toNumber(input.lat);
        var lng = toNumber(input.lng);
        if (lat !== undefined) entry.lat = lat;
        if (lng !== undefined) entry.lng = lng;
        if (str(input.description)) entry.description = str(input.description);
        if (str(input.addedAt)) entry.addedAt = str(input.addedAt);
        if (str(input.submittedBy)) entry.submittedBy = str(input.submittedBy);
        entry.images = (input.images || [])
            .map(function (img) {
                img = img || {};
                var out = { src: str(img.src) };
                var title = str(img.title || img.alt);
                if (title) out.title = title;
                var width = Math.round(toNumber(img.width) || 0);
                var height = Math.round(toNumber(img.height) || 0);
                if (!(width > 0 && height > 0)) {
                    width = 356;
                    height = 200;
                } else if (height > 400) {
                    width = Math.round((width * 200) / height);
                    height = 200;
                }
                out.width = width;
                out.height = height;
                return out;
            })
            .filter(function (img) {
                return img.src;
            });
        entry.extras = (input.extras || [])
            .map(function (extra) {
                extra = extra || {};
                var out = {};
                if (str(extra.link)) out.link = str(extra.link);
                if (str(extra.linkTitle)) out.linkTitle = str(extra.linkTitle);
                if (str(extra.kind) && str(extra.kind) !== 'stream') out.kind = str(extra.kind);
                if (str(extra.text)) out.text = str(extra.text);
                return out;
            })
            .filter(function (extra) {
                return extra.link || extra.text;
            });
        return entry;
    }

    /*
     * opts.knownTags: array of tag slugs (optional)
     * opts.allowRelative: allow "/pictures/..." images and "/..." links (maintainers)
     */
    function validateEntry(entry, opts) {
        opts = opts || {};
        var errors = [];
        function check(condition, message) {
            if (!condition) errors.push(message);
        }

        check(entry.name, 'Name is required.');
        check(entry.name.length <= LIMITS.name, 'Name is too long (max ' + LIMITS.name + ' characters).');

        var tags = splitTags(entry.tags);
        check(tags.length > 0, 'Pick at least one tag.');
        if (opts.knownTags) {
            tags.forEach(function (tag) {
                check(opts.knownTags.indexOf(tag) >= 0 && tag !== 'all', 'Unknown tag "' + tag + '".');
            });
        }

        check(entry.images.length > 0, 'Add at least one picture (a link to a screenshot hosted somewhere like imgur or catbox).');
        check(entry.images.length <= LIMITS.images, 'Too many pictures (max ' + LIMITS.images + ').');
        entry.images.forEach(function (img, i) {
            var n = 'Picture ' + (i + 1);
            check(img.src.length <= LIMITS.url, n + ': link is too long.');
            check(
                isSafeUrl(img.src, opts.allowRelative),
                n + ': must be a full https:// link to an image' + (opts.allowRelative ? ' or a /pictures/... path' : '') + '.'
            );
            check(!img.title || img.title.length <= LIMITS.text, n + ': caption is too long.');
        });

        var linkCount = 0;
        check(entry.extras.length <= LIMITS.extras, 'Too many links (max ' + LIMITS.extras + ').');
        entry.extras.forEach(function (extra, i) {
            var n = 'Link ' + (i + 1);
            if (extra.link) {
                linkCount++;
                check(extra.link.length <= LIMITS.url, n + ': link is too long.');
                check(isSafeUrl(extra.link, opts.allowRelative), n + ': must start with https:// or http://.');
            }
            check(!extra.text || extra.text.length <= LIMITS.text, n + ': text is too long.');
            check(!extra.linkTitle || extra.linkTitle.length <= LIMITS.text, n + ': note is too long.');
            check(!extra.kind || extra.kind === 'home', n + ': unknown link type "' + extra.kind + '".');
        });
        check(linkCount > 0, 'Add at least one link to the stream or channel.');

        check(!entry.description || entry.description.length <= LIMITS.description, 'Description is too long (max ' + LIMITS.description + ' characters).');
        check(!entry.region || entry.region.length <= 80, 'Region is too long.');
        check(!entry.submittedBy || entry.submittedBy.length <= 80, 'Credit name is too long.');
        check(!entry.addedAt || /^\d{4}-\d{2}-\d{2}$/.test(entry.addedAt), 'Added date must look like 2026-10-29.');

        var hasLat = entry.lat !== undefined;
        var hasLng = entry.lng !== undefined;
        check(hasLat === hasLng, 'Give both latitude and longitude, or neither.');
        if (hasLat) check(entry.lat >= -90 && entry.lat <= 90, 'Latitude must be between -90 and 90.');
        if (hasLng) check(entry.lng >= -180 && entry.lng <= 180, 'Longitude must be between -180 and 180.');

        return errors;
    }

    /* Lenient whole-file check used by CI for every commit, from any tool. */
    function validateFile(file, knownTags) {
        var errors = [];
        if (!file || typeof file !== 'object' || !Array.isArray(file.data)) {
            return ['streams.json must be an object with a "data" array.'];
        }
        file.data.forEach(function (s, i) {
            var where = 'Entry ' + (i + 1) + ' (' + (s && s.name ? s.name : 'no name') + ')';
            if (!s || typeof s !== 'object') {
                errors.push(where + ': not an object.');
                return;
            }
            if (!str(s.name)) errors.push(where + ': missing name.');
            if (typeof s.isAlive !== 'boolean') errors.push(where + ': isAlive must be true or false.');
            if (s.tags !== undefined && typeof s.tags !== 'string') errors.push(where + ': tags must be a comma separated string.');
            if (knownTags) {
                splitTags(s.tags).forEach(function (tag) {
                    if (knownTags.indexOf(tag) < 0) errors.push(where + ': unknown tag "' + tag + '".');
                });
            }
            (s.images || []).forEach(function (img, j) {
                if (!img || !str(img.src)) errors.push(where + ': picture ' + (j + 1) + ' has no src.');
                else if (!isSafeUrl(str(img.src), true)) errors.push(where + ': picture ' + (j + 1) + ' has an unsafe src.');
            });
            (s.extras || []).forEach(function (extra, j) {
                if (extra && str(extra.link) && !isSafeUrl(str(extra.link), true)) {
                    errors.push(where + ': link ' + (j + 1) + ' must be http(s) or a /path.');
                }
            });
            ['lat', 'lng'].forEach(function (key) {
                if (s[key] !== undefined && typeof s[key] !== 'number') errors.push(where + ': ' + key + ' must be a number.');
            });
        });
        return errors;
    }

    function serializeFile(file) {
        return JSON.stringify(file, null, 4);
    }

    /* The id rules match the camera list (assets/js/cards.js). */
    function slugify(text) {
        return (
            String(text || '')
                .normalize('NFKC')
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 80) || 'stream'
        );
    }

    function streamIds(list) {
        var used = {};
        return list.map(function (s) {
            var base = slugify(s.id || s.name);
            var id = base;
            var n = 2;
            while (used[id]) id = base + '-' + n++;
            used[id] = true;
            return id;
        });
    }

    /* Adds or replaces (when editOf matches an id) an entry. Returns { file, replaced }. */
    function upsert(file, entry, editOf) {
        var data = file.data.slice();
        var replaced = false;
        if (editOf) {
            var index = streamIds(data).indexOf(editOf);
            if (index >= 0) {
                data[index] = entry;
                replaced = true;
            }
        }
        if (!replaced) data.push(entry);
        var out = {};
        Object.keys(file).forEach(function (key) {
            out[key] = key === 'data' ? data : file[key];
        });
        return { file: out, replaced: replaced };
    }

    /* Finds the submission JSON inside an issue body (first ``` block). */
    function extractSubmission(body) {
        var match = /```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/i.exec(String(body || ''));
        if (!match) return { error: 'No stream data found. The issue must contain a ```json block.' };
        try {
            var parsed = JSON.parse(match[1]);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'The stream data must be a JSON object.' };
            return { data: parsed };
        } catch (e) {
            return { error: 'The stream data is not valid JSON: ' + e.message };
        }
    }

    return {
        LIMITS: LIMITS,
        isSafeUrl: isSafeUrl,
        splitTags: splitTags,
        cleanEntry: cleanEntry,
        validateEntry: validateEntry,
        validateFile: validateFile,
        serializeFile: serializeFile,
        slugify: slugify,
        streamIds: streamIds,
        upsert: upsert,
        extractSubmission: extractSubmission,
    };
});
