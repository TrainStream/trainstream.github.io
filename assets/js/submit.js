/* TrainStream — submit tool: public suggestions via GitHub issues, and a maintainer mode that commits directly. */
(function () {
    'use strict';

    var TS = window.TS;
    var R = window.TSRules;
    var store = window.TSStore;
    var el = TS.el;

    var config = TS.readJson('ts-config') || {};
    var REPO = config.repo;
    var STREAMS_PATH = '_data/streams.json';
    var allTags = (TS.readJson('ts-tags') || []).filter(function (t) {
        return t.slug !== 'all';
    });
    var tagIdx = TS.tagIndex(allTags);
    var knownTags = allTags.map(function (t) {
        return t.slug;
    });
    var siteStreams = TS.readJson('ts-streams') || [];

    var form = document.getElementById('stream-form');
    var imagesBox = document.getElementById('f-images');
    var linksBox = document.getElementById('f-links');
    var errorsBox = document.getElementById('form-errors');
    var preview = document.getElementById('preview');
    var jsonOut = document.getElementById('json-out');
    var result = document.getElementById('result');
    var editBanner = document.getElementById('edit-banner');

    var ctx = {
        editOf: '', // id of the stream being edited
        editAddedAt: '', // keep the original addedAt when editing
        fromIssue: null, // issue number when loaded from the review queue
        showErrors: false,
        admin: null, // { token, login, branch, canPush }
    };

    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    /* ---------- tags ---------- */
    var tagBox = document.getElementById('f-tags');
    allTags.forEach(function (tag) {
        var info = TS.tagInfo(tag.slug, tagIdx);
        var button = TS.badge(info, { button: true, pressed: false });
        button.addEventListener('click', function () {
            button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
            update();
        });
        tagBox.appendChild(el('li', null, [button]));
    });
    function selectedTags() {
        return Array.prototype.filter
            .call(tagBox.querySelectorAll('button[data-tag]'), function (b) {
                return b.getAttribute('aria-pressed') === 'true';
            })
            .map(function (b) {
                return b.dataset.tag;
            });
    }

    /* ---------- repeatable rows ---------- */
    function field(label, input, extraClass) {
        return el('label', { className: 'field' + (extraClass ? ' ' + extraClass : '') }, [el('span', { text: label }), input]);
    }

    function addImageRow(img) {
        img = img || {};
        var src = el('input', { type: 'url', placeholder: 'https://i.imgur.com/abc.jpg', 'data-k': 'src' });
        var title = el('input', { type: 'text', maxlength: '300', placeholder: 'Station platform', 'data-k': 'title' });
        var width = el('input', { type: 'number', min: '1', 'data-k': 'width' });
        var height = el('input', { type: 'number', min: '1', 'data-k': 'height' });
        src.value = img.src || '';
        title.value = img.title || img.alt || '';
        width.value = img.width || '';
        height.value = img.height || '';
        var status = el('span', { className: 'hint' });
        var row = el('div', { className: 'row-item' }, [
            field('Picture link *', src),
            field('Caption', title),
            field('Width', width),
            field('Height', height),
            el('button', { type: 'button', className: 'btn btn--small', 'aria-label': 'Remove picture', text: '✕', onclick: function () { row.remove(); update(); } }),
            status,
        ]);
        var timer;
        src.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                detectSize(src, width, height, status);
            }, 500);
        });
        imagesBox.appendChild(row);
        if (src.value && !width.value) detectSize(src, width, height, status);
        return row;
    }

    function detectSize(src, width, height, status) {
        var url = src.value.trim();
        if (!url) {
            status.textContent = '';
            return;
        }
        var probe = TS.imgUrl(url);
        if (!probe) {
            status.textContent = '⚠️ Use a full https:// link';
            return;
        }
        status.textContent = '⏳ checking picture…';
        var image = new Image();
        image.onload = function () {
            width.value = image.naturalWidth;
            height.value = image.naturalHeight;
            status.textContent = '✅ ' + image.naturalWidth + '×' + image.naturalHeight;
            update();
        };
        image.onerror = function () {
            status.textContent = '⚠️ Could not load this picture. Is it a direct image link?';
        };
        image.src = probe;
    }

    function addLinkRow(extra) {
        extra = extra || {};
        var link = el('input', { type: 'text', inputmode: 'url', placeholder: 'https://www.youtube.com/@channel/streams', 'data-k': 'link' });
        var text = el('input', { type: 'text', maxlength: '300', placeholder: '(optional) shown instead of the URL', 'data-k': 'text' });
        var note = el('input', { type: 'text', maxlength: '300', placeholder: '(optional) e.g. "has sound"', 'data-k': 'linkTitle' });
        var kind = el('select', { 'data-k': 'kind' }, [
            el('option', { value: '', text: '📺 Stream' }),
            el('option', { value: 'home', text: '🏠 Home page' }),
        ]);
        link.value = extra.link || '';
        text.value = extra.text || '';
        note.value = extra.linkTitle || '';
        kind.value = extra.kind === 'home' ? 'home' : '';
        var row = el('div', { className: 'row-item row-item--link' }, [
            field('URL', link),
            field('Text', text),
            field('Note', note),
            field('Type', kind),
            el('button', { type: 'button', className: 'btn btn--small', 'aria-label': 'Remove link', text: '✕', onclick: function () { row.remove(); update(); } }),
        ]);
        linksBox.appendChild(row);
        return row;
    }

    function readRows(box) {
        return Array.prototype.map.call(box.querySelectorAll('.row-item'), function (row) {
            var out = {};
            row.querySelectorAll('[data-k]').forEach(function (input) {
                out[input.dataset.k] = input.value;
            });
            return out;
        });
    }

    document.getElementById('add-image').addEventListener('click', function () {
        addImageRow().querySelector('input').focus();
    });
    document.getElementById('add-link').addEventListener('click', function () {
        addLinkRow().querySelector('input').focus();
    });

    /* ---------- read / fill the form ---------- */
    function $(id) {
        return document.getElementById(id);
    }

    function readEntry() {
        var input = {
            name: $('f-name').value,
            isAlive: form.querySelector('input[name="status"]:checked').value === 'live',
            tags: selectedTags(),
            region: $('f-region').value,
            lat: $('f-lat').value,
            lng: $('f-lng').value,
            description: $('f-description').value,
            submittedBy: $('f-credit').value,
            cameras: $('f-cameras').value,
            addedAt: ctx.editOf ? ctx.editAddedAt : today(),
            images: readRows(imagesBox),
            extras: readRows(linksBox),
        };
        return R.cleanEntry(input);
    }

    function fillForm(entry) {
        entry = entry || {};
        $('f-name').value = entry.name || '';
        form.querySelector('input[name="status"][value="' + (entry.isAlive === false ? 'dead' : 'live') + '"]').checked = true;
        var tags = R.splitTags(entry.tags);
        tagBox.querySelectorAll('button[data-tag]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(tags.indexOf(b.dataset.tag) >= 0));
        });
        $('f-region').value = entry.region || '';
        $('f-lat').value = entry.lat !== undefined ? entry.lat : '';
        $('f-lng').value = entry.lng !== undefined ? entry.lng : '';
        $('f-description').value = entry.description || '';
        $('f-credit').value = entry.submittedBy || '';
        $('f-cameras').value = entry.cameras || '';
        imagesBox.textContent = '';
        linksBox.textContent = '';
        (entry.images && entry.images.length ? entry.images : [{}]).forEach(addImageRow);
        (entry.extras && entry.extras.length ? entry.extras : [{}]).forEach(addLinkRow);
        update();
    }

    function setEditing(editOf, label, addedAt) {
        ctx.editOf = editOf || '';
        ctx.editAddedAt = addedAt || '';
        editBanner.hidden = !ctx.editOf && !ctx.fromIssue;
        editBanner.textContent = '';
        if (ctx.editOf || ctx.fromIssue) {
            editBanner.appendChild(
                document.createTextNode(
                    (ctx.fromIssue ? 'Reviewing suggestion #' + ctx.fromIssue + '. ' : '') + (ctx.editOf ? '✏️ Editing the existing stream "' + label + '". ' : '')
                )
            );
            editBanner.appendChild(
                el('button', {
                    type: 'button',
                    className: 'btn btn--small',
                    text: 'Cancel, start a new one',
                    onclick: function () {
                        resetForm();
                    },
                })
            );
        }
        $('send-btn').textContent = ctx.editOf ? '📮 Suggest this edit via GitHub' : '📮 Send suggestion via GitHub';
        $('publish-btn').textContent = ctx.editOf ? '🚀 Save changes now' : ctx.fromIssue ? '🚀 Approve & publish now' : '🚀 Publish now';
    }

    function resetForm() {
        ctx.fromIssue = null;
        ctx.showErrors = false;
        setEditing('', '', '');
        fillForm({});
        result.textContent = '';
        store('ts.draft', null);
        history.replaceState(null, '', location.pathname);
    }
    $('reset-form').addEventListener('click', function () {
        if (confirm('Clear the whole form?')) resetForm();
    });

    /* ---------- validation, preview, JSON ---------- */
    function submissionJson(entry) {
        var out = Object.assign({}, entry);
        if (ctx.editOf) out.editOf = ctx.editOf;
        return JSON.stringify(out, null, 2);
    }

    function currentErrors(entry) {
        return R.validateEntry(entry, { knownTags: knownTags, allowRelative: !!(ctx.admin && ctx.admin.canPush) || !!ctx.editOf });
    }

    var draftTimer;
    function update() {
        var entry = readEntry();
        var errors = currentErrors(entry);
        errorsBox.textContent = '';
        if (ctx.showErrors) {
            errors.forEach(function (message) {
                errorsBox.appendChild(el('li', { text: message }));
            });
        }
        preview.textContent = '';
        var model = TS.normalize(entry, siteStreams.length, {});
        preview.appendChild(TS.renderCard(model, { tagIndex: tagIdx, preview: true, maxLinks: 6 }));
        jsonOut.textContent = submissionJson(entry);

        clearTimeout(draftTimer);
        draftTimer = setTimeout(function () {
            if (!ctx.fromIssue) store('ts.draft', JSON.stringify({ entry: entry, editOf: ctx.editOf, editAddedAt: ctx.editAddedAt }));
        }, 400);
        return { entry: entry, errors: errors };
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);

    function checkOrShow() {
        ctx.showErrors = true;
        var state = update();
        if (state.errors.length) {
            errorsBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return null;
        }
        return state.entry;
    }

    /* ---------- public: send as a GitHub issue ---------- */
    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var entry = checkOrShow();
        if (!entry) return;
        var json = submissionJson(entry);
        var title = (ctx.editOf ? '[Stream edit] ' : '[Stream] ') + entry.name;
        var url =
            'https://github.com/' + REPO + '/issues/new?template=new-stream.yml' +
            '&title=' + encodeURIComponent(title) +
            '&stream_json=' + encodeURIComponent(json);
        result.textContent = '';
        if (url.length > 7500) {
            result.appendChild(
                el('p', { className: 'notice notice--warn' }, [
                    'This suggestion is too long to pre-fill. Press "📋 Copy JSON", then ',
                    el('a', { href: 'https://github.com/' + REPO + '/issues/new?template=new-stream.yml&title=' + encodeURIComponent(title), target: '_blank', rel: 'noopener', text: 'open the issue form' }),
                    ' and paste it into "Stream data".',
                ])
            );
            return;
        }
        window.open(url, '_blank', 'noopener');
        result.appendChild(
            el('p', { className: 'notice notice--ok' }, [
                'A GitHub page opened with your suggestion filled in. Check the boxes and press "Submit new issue". A bot checks it within a minute, then a maintainer reviews it. ありがとう！ (Nothing opened? ',
                el('a', { href: url, target: '_blank', rel: 'noopener', text: 'click here' }),
                '.)',
            ])
        );
    });

    $('copy-json').addEventListener('click', function () {
        TS.copyText(submissionJson(readEntry()));
    });

    /* ---------- tabs ---------- */
    var adminPanel = document.getElementById('admin-panel');
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('[data-tab]').forEach(function (t) {
                t.setAttribute('aria-pressed', String(t === tab));
            });
            adminPanel.hidden = tab.dataset.tab !== 'admin';
        });
    });

    /* ==========================================================================
       Maintainer mode (GitHub REST API with a personal access token)
       ========================================================================== */

    function getToken() {
        try {
            return sessionStorage.getItem('ts.gh') || store('ts.gh') || '';
        } catch (e) {
            return store('ts.gh') || '';
        }
    }
    function saveToken(token, remember) {
        try {
            sessionStorage.setItem('ts.gh', token);
        } catch (e) {}
        store('ts.gh', remember ? token : null);
    }
    function forgetToken() {
        try {
            sessionStorage.removeItem('ts.gh');
        } catch (e) {}
        store('ts.gh', null);
    }

    function gh(method, path, body) {
        return fetch('https://api.github.com' + path, {
            method: method,
            headers: {
                Authorization: 'Bearer ' + ctx.admin.token,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            cache: 'no-store',
        }).then(function (response) {
            if (!response.ok) {
                return response.text().then(function (text) {
                    var error = new Error(method + ' ' + path + ' → ' + response.status + ' ' + text.slice(0, 200));
                    error.status = response.status;
                    throw error;
                });
            }
            return response.status === 204 ? null : response.json();
        });
    }

    function b64decode(b64) {
        var binary = atob(String(b64).replace(/\s/g, ''));
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    function b64encode(text) {
        var bytes = new TextEncoder().encode(text);
        var binary = '';
        for (var i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }

    function fetchStreams() {
        return gh('GET', '/repos/' + REPO + '/contents/' + STREAMS_PATH + '?ref=' + encodeURIComponent(ctx.admin.branch)).then(function (data) {
            return { sha: data.sha, file: JSON.parse(b64decode(data.content)) };
        });
    }

    /* Re-reads the file right before writing, so nothing someone else saved is lost. */
    function commitStreams(change, message, retried) {
        return fetchStreams()
            .then(function (current) {
                var next = change(current.file);
                return gh('PUT', '/repos/' + REPO + '/contents/' + STREAMS_PATH, {
                    message: message,
                    content: b64encode(R.serializeFile(next)),
                    sha: current.sha,
                    branch: ctx.admin.branch,
                });
            })
            .catch(function (error) {
                if ((error.status === 409 || error.status === 422) && !retried) return commitStreams(change, message, true);
                throw error;
            });
    }

    var signinStatus = document.getElementById('signin-status');
    function showStatus(kind, nodes) {
        signinStatus.hidden = false;
        signinStatus.className = 'notice notice--' + kind;
        signinStatus.textContent = '';
        (Array.isArray(nodes) ? nodes : [nodes]).forEach(function (n) {
            signinStatus.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
        });
    }

    function signIn(token) {
        ctx.admin = { token: token };
        showStatus('warn', '⏳ Checking your token…');
        return Promise.all([gh('GET', '/user'), gh('GET', '/repos/' + REPO)])
            .then(function (res) {
                var user = res[0];
                var repo = res[1];
                var perms = repo.permissions || {};
                ctx.admin.login = user.login;
                ctx.admin.branch = repo.default_branch;
                ctx.admin.canPush = !!(perms.push || perms.maintain || perms.admin);
                $('signout-btn').hidden = false;
                $('signin-btn').hidden = true;
                $('token').value = '';
                if (ctx.admin.canPush) {
                    showStatus('ok', '✅ Signed in as ' + user.login + '. You can publish directly, review suggestions and edit streams.');
                    $('admin-actions').hidden = false;
                    $('admin-tools').hidden = false;
                    setEditing(ctx.editOf, $('f-name').value, ctx.editAddedAt);
                    loadQueue();
                    loadManage();
                } else {
                    showStatus('warn', [
                        '👋 Signed in as ' + user.login + ', but this token cannot write to ' + REPO + '. ',
                        'If you are a trusted publisher, just use "📮 Send suggestion via GitHub": suggestions from people listed in .github/publishers.yml are published automatically.',
                    ]);
                }
                update();
            })
            .catch(function (error) {
                ctx.admin = null;
                forgetToken();
                showStatus('error', '❌ Sign-in failed: ' + error.message);
            });
    }

    $('signin-btn').addEventListener('click', function () {
        var token = $('token').value.trim();
        if (!token) return;
        saveToken(token, $('remember').checked);
        signIn(token);
    });
    $('signout-btn').addEventListener('click', function () {
        forgetToken();
        ctx.admin = null;
        $('signout-btn').hidden = true;
        $('signin-btn').hidden = false;
        $('admin-actions').hidden = true;
        $('admin-tools').hidden = true;
        showStatus('ok', 'Signed out. The token was removed from this browser.');
        update();
    });

    /* ---------- publish ---------- */
    function commitLink(response) {
        var commit = response && response.commit;
        return commit ? el('a', { href: commit.html_url, target: '_blank', rel: 'noopener', text: commit.sha.slice(0, 7) }) : '';
    }

    $('publish-btn').addEventListener('click', function () {
        var entry = checkOrShow();
        if (!entry || !ctx.admin || !ctx.admin.canPush) return;
        var editOf = ctx.editOf;
        var issue = ctx.fromIssue;
        if (!editOf && !entry.addedAt) entry.addedAt = today();
        var button = $('publish-btn');
        button.disabled = true;
        result.textContent = '⏳ Publishing…';
        var message = (editOf ? 'Update stream: ' : 'Add stream: ') + entry.name + (issue ? ' (#' + issue + ', suggested by ' + ctx.fromIssueAuthor + ')' : '') + ' via submit tool';
        commitStreams(function (file) {
            var res = R.upsert(file, entry, editOf);
            if (editOf && !res.replaced) throw new Error('The stream being edited no longer exists. Reload and try again.');
            return res.file;
        }, message)
            .then(function (response) {
                var done = Promise.resolve();
                if (issue) {
                    done = gh('POST', '/repos/' + REPO + '/issues/' + issue + '/comments', {
                        body: '🎉 Published by @' + ctx.admin.login + ' with the submit tool' + (response.commit ? ' in ' + response.commit.sha.slice(0, 7) : '') + '. Thank you!',
                    })
                        .then(function () {
                            return gh('POST', '/repos/' + REPO + '/issues/' + issue + '/labels', { labels: ['published'] });
                        })
                        .then(function () {
                            return gh('PATCH', '/repos/' + REPO + '/issues/' + issue, { state: 'closed', state_reason: 'completed' });
                        })
                        .catch(function (error) {
                            console.warn(error);
                        });
                }
                return done.then(function () {
                    resetForm();
                    result.appendChild(
                        el('p', { className: 'notice notice--ok' }, [
                            '🎉 ' + (editOf ? 'Saved' : 'Published') + '! Commit ',
                            commitLink(response),
                            '. The site rebuilds in a minute or two.',
                        ])
                    );
                    loadQueue();
                    loadManage();
                });
            })
            .catch(function (error) {
                result.textContent = '';
                result.appendChild(el('p', { className: 'notice notice--error', text: '❌ ' + error.message }));
            })
            .then(function () {
                button.disabled = false;
            });
    });

    /* ---------- review queue ---------- */
    function loadQueue() {
        var queue = $('queue');
        queue.textContent = '';
        queue.appendChild(el('li', { text: '⏳ Loading…' }));
        gh('GET', '/repos/' + REPO + '/issues?labels=submission&state=open&per_page=50')
            .then(function (issues) {
                queue.textContent = '';
                if (!issues.length) queue.appendChild(el('li', { text: 'No suggestions waiting. 平和ですね (´-ω-`)' }));
                issues.forEach(function (issue) {
                    var labels = issue.labels.map(function (l) {
                        return l.name;
                    });
                    queue.appendChild(
                        el('li', null, [
                            el('span', { className: 'name' }, [
                                el('a', { href: issue.html_url, target: '_blank', rel: 'noopener', text: '#' + issue.number + ' ' + issue.title }),
                                ' by ' + issue.user.login,
                                labels.indexOf('needs-fix') >= 0 ? el('span', { className: 'status-pill is-dead', text: 'needs fix' }) : null,
                            ]),
                            el('button', { type: 'button', className: 'btn btn--small btn--green', text: '📥 Review', onclick: function () { reviewIssue(issue); } }),
                            el('button', { type: 'button', className: 'btn btn--small', text: '🗑 Reject', onclick: function () { rejectIssue(issue); } }),
                        ])
                    );
                });
            })
            .catch(function (error) {
                queue.textContent = '';
                queue.appendChild(el('li', { text: '❌ ' + error.message }));
            });
    }

    function reviewIssue(issue) {
        var parsed = R.extractSubmission(issue.body);
        if (parsed.error) {
            alert('#' + issue.number + ': ' + parsed.error);
            return;
        }
        ctx.fromIssue = issue.number;
        ctx.fromIssueAuthor = issue.user.login;
        var data = parsed.data;
        var editOf = String(data.editOf || '');
        var existing = editOf ? findSiteStream(editOf) : null;
        setEditing(editOf, existing ? existing.name : editOf, data.addedAt || (existing && existing.addedAt) || '');
        fillForm(data);
        ctx.showErrors = true;
        update();
        form.scrollIntoView({ behavior: 'smooth' });
    }

    function rejectIssue(issue) {
        var reason = prompt('Why is #' + issue.number + ' rejected? (posted as a comment)', 'Thanks, but this one does not fit the list.');
        if (reason === null) return;
        gh('POST', '/repos/' + REPO + '/issues/' + issue.number + '/comments', { body: '🙇 ' + reason + '\n\n_(Rejected by @' + ctx.admin.login + ' with the submit tool.)_' })
            .then(function () {
                return gh('PATCH', '/repos/' + REPO + '/issues/' + issue.number, { state: 'closed', state_reason: 'not_planned' });
            })
            .then(loadQueue)
            .catch(function (error) {
                alert(error.message);
            });
    }

    /* ---------- manage existing streams ---------- */
    var manageData = [];
    function loadManage() {
        var box = $('manage');
        box.textContent = '';
        box.appendChild(el('li', { text: '⏳ Loading the latest streams.json…' }));
        fetchStreams()
            .then(function (current) {
                var ids = R.streamIds(current.file.data);
                manageData = current.file.data.map(function (s, i) {
                    return { stream: s, id: ids[i] };
                });
                renderManage();
            })
            .catch(function (error) {
                box.textContent = '';
                box.appendChild(el('li', { text: '❌ ' + error.message }));
            });
    }

    function renderManage() {
        var box = $('manage');
        var q = $('manage-filter').value.trim().toLowerCase();
        box.textContent = '';
        manageData
            .filter(function (item) {
                return !q || String(item.stream.name).toLowerCase().indexOf(q) >= 0;
            })
            .forEach(function (item) {
                var s = item.stream;
                box.appendChild(
                    el('li', null, [
                        el('span', { className: 'status-pill' + (s.isAlive ? '' : ' is-dead'), text: s.isAlive ? 'Live' : 'Dead' }),
                        el('span', { className: 'name', text: s.name }),
                        el('button', {
                            type: 'button',
                            className: 'btn btn--small',
                            text: '✏️ Edit',
                            onclick: function () {
                                ctx.fromIssue = null;
                                setEditing(item.id, s.name, s.addedAt || '');
                                fillForm(s);
                                form.scrollIntoView({ behavior: 'smooth' });
                            },
                        }),
                        el('button', {
                            type: 'button',
                            className: 'btn btn--small',
                            text: s.isAlive ? '⏸ Mark dead' : '▶ Mark live',
                            onclick: function () {
                                quickChange(item, s.isAlive ? 'Mark stream dead: ' : 'Mark stream live: ', function (entry) {
                                    var copy = Object.assign({}, entry);
                                    copy.isAlive = !entry.isAlive;
                                    return copy;
                                });
                            },
                        }),
                        el('button', {
                            type: 'button',
                            className: 'btn btn--small',
                            text: '🗑 Delete',
                            onclick: function () {
                                if (!confirm('Delete "' + s.name + '" for good? (Marking it dead keeps it in the dead list instead.)')) return;
                                quickChange(item, 'Delete stream: ', null);
                            },
                        }),
                    ])
                );
            });
    }
    $('manage-filter').addEventListener('input', renderManage);

    function quickChange(item, label, transform) {
        commitStreams(function (file) {
            var ids = R.streamIds(file.data);
            var index = ids.indexOf(item.id);
            if (index < 0) throw new Error('That stream changed since the list loaded. Reload and try again.');
            var data = file.data.slice();
            if (transform) data[index] = transform(data[index]);
            else data.splice(index, 1);
            var out = {};
            Object.keys(file).forEach(function (key) {
                out[key] = key === 'data' ? data : file[key];
            });
            return out;
        }, label + item.stream.name + ' via submit tool')
            .then(function (response) {
                result.textContent = '';
                result.appendChild(el('p', { className: 'notice notice--ok' }, ['✅ Done: ' + label + item.stream.name + '. Commit ', commitLink(response), '.']));
                showStatus('ok', ['✅ ' + label + item.stream.name + ' (commit ', commitLink(response), ').']);
                loadManage();
            })
            .catch(function (error) {
                alert(error.message);
            });
    }

    /* ---------- start ---------- */
    function findSiteStream(id) {
        var ids = R.streamIds(siteStreams);
        var index = ids.indexOf(id);
        return index >= 0 ? siteStreams[index] : null;
    }

    var params = new URLSearchParams(location.search);
    var editParam = params.get('edit');
    var draft = null;
    try {
        draft = JSON.parse(store('ts.draft') || 'null');
    } catch (e) {}

    if (editParam && findSiteStream(editParam)) {
        var existing = findSiteStream(editParam);
        setEditing(editParam, existing.name, existing.addedAt || '');
        fillForm(existing);
    } else if (draft && draft.entry) {
        setEditing(draft.editOf, draft.entry.name, draft.editAddedAt);
        fillForm(draft.entry);
    } else {
        fillForm({});
    }

    var savedToken = getToken();
    if (savedToken) {
        document.querySelector('[data-tab="admin"]').click();
        signIn(savedToken);
    }
})();
