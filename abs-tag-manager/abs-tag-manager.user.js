// ==UserScript==
// @name         AtmoBurn Services - Tag Manager
// @namespace    sk.seko
// @license      MIT
// @version      1.1.0
// @description  Simple fleet/colony tagging script; use ALT-T for tagging current fleet/colony
// @match        https://*.atmoburn.com/*
// @exclude    	 https://*.atmoburn.com/extras/view_universe.php*
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-tag-manager/abs-tag-manager.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-tag-manager/abs-tag-manager.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-tag-manager/README.md
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

/* Stored formats (examples):
GM key: "colony::allTags" or "fleet::allTags"
    {
      "c123": ["t1", "t3"],
      "c245": ["t2"]
    }
GM key: "colony::tagsById" or "fleet::tagsById"
    {
      "t1": { "name": "Urgent", "color": "#ff3b3b" },
      "t2": { "name": "Review", "color": "#3b82f6" },
      "t3": { "name": "Blocked", "color": "#f59e0b" }
    }
GM key: "colony::tagIndexByName" or "fleet::tagIndexByName"
    {
        "urgent": "t1",
        "review": "t2",
        "blocked": "t3"
    }
*/

/* jshint esversion: 11 */
/* jshint node: true */

(function () {
    "use strict";

    const MAX_CHARS = 12;  // max tag length; just in case
    const ZWSP = "\u200B"; // invisible, but harmless character; used to distinguish original label and tags, and to mark already decorated label

    const TAG_MANAGER_STYLE = `
<style>
    #tm-tag-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        display: none;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }
    #tm-tag-modal {
        width: min(520px, calc(100vw - 24px));
        margin: 7vh auto 0 auto;
        background: #111827;
        color: #e5e7eb;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        box-shadow: 0 18px 54px rgba(0,0,0,0.55);
        overflow: hidden;
    }
    #tm-tag-modal header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: rgba(255,255,255,0.03);
        border-bottom: 1px solid rgba(255,255,255,0.10);
    }
    #tm-tag-modal header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 650;
        letter-spacing: 0.015em;
    }
    #tm-tag-close {
        border: 0;
        background: transparent;
        color: #9ca3af;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 8px;
    }
    #tm-tag-close:hover { background: rgba(255,255,255,0.06); color:#e5e7eb; }
    #tm-tag-modal main { padding: 10px 12px 12px 12px; }
    .tm-help { color:#9ca3af; font-size:12px; margin:0 0 8px 0; }
    .tm-row {
        display:grid;
        grid-template-columns:1fr auto;
        gap:8px;
        margin-bottom:8px;
        align-items:center;
    }
    .tm-input, .tm-btn {
        height:32px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,0.14);
        background:rgba(255,255,255,0.04);
        color:#e5e7eb;
        padding:0 10px;
        outline:none;
    }
    .tm-input::placeholder { color:#3f3f3f; }
    .tm-input:focus {
        border-color:rgba(99,102,241,0.65);
        box-shadow:0 0 0 3px rgba(99,102,241,0.18);
    }
    .tm-btn {
        cursor:pointer;
        font-weight:600;
        background:rgba(99,102,241,0.22);
        border-color:rgba(99,102,241,0.35);
        padding:0 12px;
    }
    .tm-btn:hover { background:rgba(99,102,241,0.30); }
    .tm-secondary {
        background:rgba(255,255,255,0.06);
        border-color:rgba(255,255,255,0.12);
    }
    .tm-palette {
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        margin:0 0 10px 0;
    }
    .tm-swatch {
        width:18px;
        height:18px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,0.22);
        cursor:pointer;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
    }
    .tm-swatch.tm-selected {
        outline:2px solid rgba(255,255,255,0.85);
        outline-offset:2px;
    }
    #tm-tag-list {
        display:flex;
        flex-wrap:wrap;
        gap:6px;
    }
    .tm-chip {
        display:inline-flex;
        align-items:center;
        gap:6px;
        border-radius:999px;
        padding:3px 8px;
        background:rgba(255,255,255,0.04);
        border:1px solid rgba(255,255,255,0.12);
        user-select:none;
    }
    .tm-chip:hover { background:rgba(255,255,255,0.07); }
    .tm-dot {
        width:8px;
        height:8px;
        border-radius:999px;
        flex:0 0 auto;
    }
    .tm-chip span {
        font-size:11px;
        line-height:1;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:240px;
    }
    .tm-del {
        border:0;
        background:transparent;
        color:#9ca3af;
        cursor:pointer;
        font-size:12px;
        padding:0 4px;
        border-radius:8px;
    }
    .tm-del:hover { background:rgba(255,255,255,0.08); color:#e5e7eb; }
    footer {
        display:flex;
        justify-content:flex-end;
        gap:8px;
        padding:10px 12px;
        border-top:1px solid rgba(255,255,255,0.10);
        background:rgba(255,255,255,0.02);
    }
</style>
`;

    const TAG_MANAGER_BODY = `
<div id="tm-tag-modal-backdrop" role="dialog" aria-modal="true">
  <div id="tm-tag-modal">
    <header>
      <h3 id="tm-tag-title">ABS Tag Manager</h3>
      <button id="tm-tag-close" title="Close" aria-label="Close">×</button>
    </header>
    <main>
      <div class="tm-row">
        <input id="tm-tag-name"
               class="tm-input"
               placeholder="tag name (max ${MAX_CHARS} chars); suggestions keep their color"
               maxlength="${MAX_CHARS}"
               list="tm-tag-suggestions" />
        <button id="tm-tag-add" class="tm-btn">Add</button>
      </div>
      <datalist id="tm-tag-suggestions"></datalist>
      <div id="tm-tag-palette" class="tm-palette"></div>
      <div id="tm-tag-list"></div>
    </main>
    <footer>
      <button id="tm-tag-clear" class="tm-btn tm-secondary">Clear all</button>
      <button id="tm-tag-done" class="tm-btn">Done</button>
    </footer>
  </div>
</div>
`;

    const TagManagerUI = (() => {

        const PALETTE = [
            {name: "White", value: "#ffffff"},
            {name: "Yellow", value: "#ffff00"},
            {name: "Red", value: "#ff3333"},
            {name: "Orange", value: "#f97316"},
            {name: "Amber", value: "#f59e0b"},
            {name: "Green", value: "#22c55e"},
            {name: "Teal", value: "#14b8a6"},
            {name: "Blue", value: "#3b82f6"},
            {name: "Indigo", value: "#6366f1"},
            {name: "Violet", value: "#8b5cf6"},
            {name: "Pink", value: "#ec4899"},
            {name: "Gray", value: "#9ca3af"},
            {name: "Black", value: "#000000"},
        ];
        const DEFAULT_COLOR = PALETTE[0].value;

        const state = {
            objectId: "global",
            tags: [],
            currentColor: DEFAULT_COLOR,
            onChange: () => {
            }
        };

        let modalEl = null;

        function gmNsKey(baseKey) {
            return `${location.host}::${baseKey}`;
        }

        function typedKey(objType, baseKey) {
            return `${objType}:${baseKey}`;
        }

        function gmGet(objType, baseKey, defaultValue) {
            return GM_getValue(gmNsKey(typedKey(objType, baseKey)), defaultValue);
        }

        function gmSet(objType, baseKey, value) {
            GM_setValue(gmNsKey(typedKey(objType, baseKey)), value);
        }

        function el(tag, props = {}, ...children) {
            const e = document.createElement(tag);
            const {style, on, ...rest} = props;
            Object.assign(e, rest);
            if (style) Object.assign(e.style, style);
            if (on) Object.entries(on).forEach(([k, v]) => e.addEventListener(k, v));
            children.forEach(c => e.append(c instanceof Node ? c : document.createTextNode(String(c))));
            return e;
        }

        function nextId(prefix = "t") {
            const k = "__seq__";
            const n = gmGet(prefix, k, 0) + 1;
            gmSet(prefix, k, n);
            return `${prefix}${n.toString(36)}`;
        }

        function normName(name, color) {
            return `${name.trim()}#${color.trim()}`.toLowerCase();
        }

        function getOrCreateTag(objectType, name, color) {
            const tagsById = gmGet(objectType, "tagsById", {});
            const tagIndexByName = gmGet(objectType, "tagIndexByName", {});
            const key = normName(name, color);
            const existing = tagIndexByName[key];
            if (existing) return existing;
            const tagId = nextId("t");
            tagsById[tagId] = {name: name.trim(), color};
            tagIndexByName[key] = tagId;
            gmSet(objectType, "tagsById", tagsById);
            gmSet(objectType, "tagIndexByName", tagIndexByName);
            return tagId;
        }

        function getAllTags(objectType, objectId = null) {
            const allTags = gmGet(objectType, "allTags", {});
            const tagsById = gmGet(objectType, "tagsById", {});
            if (!objectId) return [allTags, tagsById];
            const tags = {[objectId]: (allTags[objectId] ? allTags[objectId] : [])};
            return [tags, tagsById];
        }

        /*
         * Loads object tags (by object type), returns list of tags, in format: [{id:"t1","name":"Urgent","color":"#ff3b3b"},...]
         */
        function loadObjectTags(objectType, objectId) {
            const allTags = gmGet(objectType, "allTags", {});
            const tagIds = allTags[objectId];
            if (!tagIds || !tagIds.length) return [];
            const tagsById = gmGet(objectType, "tagsById", {});
            return tagIds.map(id => ({id, ...tagsById[id]}));
        }

        function addTagToObject(objectType, objectId, tagId) {
            const allTags = gmGet(objectType, "allTags", {});
            const arr = allTags[objectId] ?? (allTags[objectId] = []);
            if (!arr.includes(tagId)) arr.push(tagId);
            gmSet(objectType, "allTags", allTags);
        }

        function deleteTagFromObject(objectType, objectId, tagId) {
            const allTags = gmGet(objectType, "allTags", {});
            const tags = allTags[objectId];
            if (!Array.isArray(tags)) return false; // no change
            const idx = tags.indexOf(tagId);
            if (idx === -1) return false; // tag not found
            tags.splice(idx, 1);
            if (tags.length === 0) delete allTags[objectId]; // fix empty records
            gmSet(objectType, "allTags", allTags);
            return true; // tags changed
        }

        function buildSuggestionPool() {
            const allTags = Object.values(gmGet(state.objectType, "tagsById", {}));
            const usedTagNames = new Set(state.tags.map(t => t.name));
            const all = allTags
                .filter(s => s && s.name && s.color && !usedTagNames.has(s.name))
                .map(s => ({name: s.name.slice(0, MAX_CHARS), color: s.color}));
            return [
                ...new Map(all.map(item => [item.name, item])).values()
            ].sort((a, b) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            );
        }

        function updateDatalist(prefix) {
            const dl = document.getElementById("tm-tag-suggestions");
            if (!dl) return;
            const p = String(prefix || "").toLowerCase();
            const pool = buildSuggestionPool();
            const matches = pool
                .filter(s => !p || s.name.toLowerCase().startsWith(p))
                .slice(0, 12);
            dl.innerHTML = "";
            matches.forEach(s => {
                dl.appendChild(el("option", {value: s.name}));
            });
        }

        function ensureModal() {
            if (modalEl) return;
            modalEl = document.createElement("div");
            modalEl.innerHTML = TAG_MANAGER_STYLE + TAG_MANAGER_BODY;
            document.documentElement.appendChild(modalEl);
            const backdrop = document.getElementById("tm-tag-modal-backdrop");
            const titleEl = document.getElementById("tm-tag-title");
            const nameIn = document.getElementById("tm-tag-name");
            const addBtn = document.getElementById("tm-tag-add");
            const clearBtn = document.getElementById("tm-tag-clear");
            const doneBtn = document.getElementById("tm-tag-done");
            const closeBtn = document.getElementById("tm-tag-close");

            function renderPalette() {
                const pal = document.getElementById("tm-tag-palette");
                pal.innerHTML = "";
                PALETTE.forEach(c => {
                    pal.appendChild(el("div", {
                        className: "tm-swatch" + (state.currentColor === c.value ? " tm-selected" : ""),
                        style: {background: c.value},
                        on: {
                            click: () => {
                                state.currentColor = c.value;
                                render();
                            }
                        }
                    }));
                });
            }

            function render() {
                renderPalette();
                const list = document.getElementById("tm-tag-list");
                list.innerHTML = "";
                if (!state.tags.length) {
                    list.appendChild(el("div", {className: "tm-help"}, "(no tags)"));
                    return;
                }
                state.tags.forEach((t, i) => {
                    list.appendChild(el("div", {className: "tm-chip", style: {borderColor: t.color}},
                        el("div", {className: "fa-solid fa-tag", style: {color: t.color}}),
                        el("span", {style: {color: t.color}}, t.name),
                        el("button", {
                            className: "tm-del", on: {
                                click: (e) => {
                                    e.stopPropagation();
                                    deleteTagFromObject(state.objectType, state.objectId, state.tags[i].id);
                                    state.tags = loadObjectTags(state.objectType, state.objectId);
                                    render();
                                }
                            }
                        }, "✕")
                    ))
                    ;
                });
            }

            addBtn.addEventListener("click", () => {
                const raw = (nameIn.value || "").trim().slice(0, MAX_CHARS);
                if (!raw) return;
                const tagId = getOrCreateTag(state.objectType, raw, state.currentColor)
                addTagToObject(state.objectType, state.objectId, tagId);
                state.tags = loadObjectTags(state.objectType, state.objectId);
                nameIn.value = "";
                updateDatalist("");
                render();
                state.onChange(structuredClone(state.tags));
            });

            clearBtn.addEventListener("click", () => {
                if (!state.tags || !state.tags.length) return;
                const allTags = gmGet(state.objectType, "allTags", {});
                state.tags = [];
                delete allTags[state.objectId];
                gmSet(state.objectType, "allTags", allTags);
                render();
            });

            nameIn.addEventListener("input", e => updateDatalist(e.target.value));
            nameIn.addEventListener("focus", () => updateDatalist(nameIn.value));
            nameIn.addEventListener("keydown", e => {
                if (e.key === "Enter") addBtn.click();
                if (e.key === "Escape") close();
            });

            [doneBtn, closeBtn].forEach(b => b.addEventListener("click", close));
            backdrop.addEventListener("mousedown", e => {
                if (e.target === backdrop) close();
            });

            ensureModal._render = render;
            ensureModal._titleEl = titleEl;
            ensureModal._backdrop = backdrop;
            ensureModal._nameInput = nameIn;
        }

        function open(opts = {}) {
            ensureModal();
            state.objectId = opts.objectId || "global";
            state.objectType = opts.objectType || "object";
            state.onclose = opts.onclose;
            ensureModal._titleEl.textContent = opts.title || "ABS Tag Manager";
            state.tags = loadObjectTags(state.objectType, state.objectId);
            updateDatalist("");
            ensureModal._render();
            ensureModal._backdrop.style.display = "block";
            setTimeout(() => ensureModal._nameInput.focus(), 0);
        }

        function close() {
            if (ensureModal._backdrop) ensureModal._backdrop.style.display = "none";
            if (state.onclose) setTimeout(state.onclose, 100);
        }

        return {open, getAllTags};
    })();

    (async () => {
        const FLEET_ID_RE = /(?:[?&]fleet=|\/fleet\/)(\d+)/;
        const COLONY_ID_RE = /[?&]colony=(\d+)/;

        function parseIdFromURL(pattern) {
            const m = document.URL.match(pattern);
            return (m && m[1]) ? Number(m[1]) : null;
        }

        const ZWSP_RE = new RegExp(ZWSP + ".*$");

        function decorateLink(node, tagIds, tagsById) {
            let txt = node.innerHTML.replace(ZWSP_RE, "") + (tagIds.length ? ZWSP : "");
            for (const tagId of tagIds) {
                const tag = tagsById[tagId].name;
                const color = tagsById[tagId].color;
                txt += `&nbsp;<span style="color:${color};white-space:nowrap;"><i class="fa-solid fa-tag"></i>${tag}</span>`
            }
            node.innerHTML = txt;
        }

        function decorateAllColonies(allTags, tagsById) {
            for (const [objectId, tagIds] of Object.entries(allTags)) {
                document.getElementById('colonylist').querySelectorAll(`a[href$="colony=${objectId}"]`).forEach((node) => {
                    try {
                        decorateLink(node, tagIds, tagsById);
                    } catch (e) {
                        console.error(e.message, e);
                    }
                });
            }
        }

        function decorateAllFleets(allTags, tagsById) {
            for (const [objectId, tagIds] of Object.entries(allTags)) {
                if (!tagIds || tagIds.length === 0) continue;
                document.getElementById('fleetlist').querySelectorAll(`a[href$="fleet=${objectId}"]`).forEach((node) => {
                    try {
                        decorateLink(node, tagIds, tagsById);
                    } catch (e) {
                        console.error(e.message, e);
                    }
                });
            }
        }

        function addTagManagerListener(objectType, objectId) {
            document.addEventListener("keydown", e => {
                if (e.altKey && e.key.toLowerCase() === "t") {
                    TagManagerUI.open({
                        objectType: objectType,
                        objectId: objectId,
                        title: `Tags for ${objectType} #${objectId}`,
                        onclose: function () {
                            decorateSome(objectType, objectId);
                        }
                    });
                }
            });
        }

        function decorateSome(objectType, objectId) {
            switch (objectType) {
                case "colony":
                    return decorateAllColonies(...TagManagerUI.getAllTags("colony", objectId));
                case "fleet":
                    return decorateAllFleets(...TagManagerUI.getAllTags("fleet"), objectId);
            }
            console.error("Unknown objectType:", objectType);
        }

        function decorateAll() {
            decorateAllColonies(...TagManagerUI.getAllTags("colony"));
            decorateAllFleets(...TagManagerUI.getAllTags("fleet"));
        }

        try {
            const urlstr = document.URL;
            if (urlstr.match(/atmoburn\.com\/view_colony\.php/i)) {
                const objectId = parseIdFromURL(COLONY_ID_RE);
                if (objectId) {
                    addTagManagerListener("colony", objectId);
                }
            } else if (urlstr.match(/atmoburn\.com\/fleet\.php/i) || urlstr.match(/atmoburn\.com\/fleet\//i)) {
                const objectId = parseIdFromURL(FLEET_ID_RE);
                if (objectId) {
                    addTagManagerListener("fleet", objectId);
                }
            }
            decorateAll();
        } catch (e) {
            console.error('tags: error', e);
        }

    })();

})();
