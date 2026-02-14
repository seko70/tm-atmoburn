// ==UserScript==
// @name         AtmoBurn Services - Tag Manager
// @namespace    sk.seko
// @license      MIT
// @version      2.0.4
// @description  Simple fleet/colony tagging script; use ALT-T for tagging current fleet/colony
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-tag-manager/abs-tag-manager.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-tag-manager/abs-tag-manager.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-tag-manager/README.md
// @match        https://*.atmoburn.com/*
// @exclude    	 https://*.atmoburn.com/extras/view_universe.php*
// @require      https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

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
    .tm-deco-title { cursor:pointer; font-size:0.5em; }
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
        <input id="tm-tag-name" class="tm-input"
               placeholder="tag name (max ${MAX_CHARS} chars); suggestions keep their color"
               maxlength="${MAX_CHARS}" list="tm-tag-suggestions" />
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

    // DB initialization
    const db = new Dexie('AtmoBurnTagsDB');
    db.version(1).stores({
        colony: '&id',
        fleet: '&id'
    });

    // Tag DB manipulation functions
    class TagDB {
        static async saveTags(objectType, id, tagList) {
            return await db.table(objectType).put({id, tagList});
        }

        static async getTags(objectType, id) {
            const record = await db.table(objectType).get(id);
            return record ? record.tagList : [];
        }

        static async deleteRecord(objectType, id) {
            return await db.table(objectType).delete(id);
        }

        // returns object/map: {"1093: [{"name": "OOF","color": "#ff0000"},...], ...}
        static async getAllRecordsMap(objectType) {
            const tagMap = new Map();
            await db.table(objectType).each(record => {
                tagMap.set(record.id, record.tagList);
            });
            return tagMap;
        }

        static async getUniqueTagNames(objectType) {
            const allRecords = await db.table(objectType).toArray();
            if (!allRecords || !allRecords.length) return [];
            const uniqueNames = new Set(
                allRecords.flatMap(record => (record.tagList || []).map(tag => tag.name).filter(name => name))
            );
            return Array.from(uniqueNames);
        }
    }

    // Helper function for creating element and setting it's attributes
    function el(tag, props = {}, ...children) {
        const e = document.createElement(tag);
        const {style, on, ...rest} = props;
        Object.assign(e, rest);
        if (style) Object.assign(e.style, style);
        if (on) Object.entries(on).forEach(([k, v]) => e.addEventListener(k, v));
        children.forEach(c => e.append(c instanceof Node ? c : document.createTextNode(String(c))));
        return e;
    }

    const TagManagerUI = (() => {
        const PALETTE = [
            {name: "White", value: "#ffffff"},
            {name: "Yellow", value: "#ffff00"},
            {name: "Red", value: "#ff3333"},
            {name: "Orange", value: "#f97316"},
            {name: "Amber", value: "#e19e0b"},
            {name: "Green", value: "#22c55e"},
            {name: "Teal", value: "#14b8a6"},
            {name: "Blue", value: "#5b82f6"},
            {name: "Indigo", value: "#6333ff"},
            {name: "Violet", value: "#a05ce6"},
            {name: "Pink", value: "#ec4899"},
            {name: "Gray", value: "#9ca3af"},
        ];
        const DEFAULT_COLOR = PALETTE[0].value;
        const state = {
            objectId: "global",
            tags: [],
            currentColor: DEFAULT_COLOR
        };

        let modalEl = null;

        /*
         * Loads object tags (by object type), returns list of tags, in format: [{id:"t1","name":"Urgent","color":"#ff3b3b"},...]
         */
        async function loadObjectTags(objectType, objectId) {
            const objectTags = await TagDB.getTags(objectType, objectId);
            return objectTags ? objectTags : [];
        }

        async function saveObjectTags(objectType, objectId, tagList) {
            await TagDB.saveTags(objectType, objectId, tagList);
        }

        async function addTagToObject(objectType, objectId, tagList, tagToAdd) {
            tagList.push(tagToAdd);
            await saveObjectTags(objectType, objectId, tagList);
        }


        async function deleteTagFromObject(objectType, objectId, tagList, tagToRemove) {
            const originalLength = tagList.length;
            // if already empty -> quit
            if (!originalLength) return false;
            // remove (all) matching tags from tagList
            tagList.splice(0, tagList.length, ...tagList.filter(t => t.name !== tagToRemove.name || t.color !== tagToRemove.color));
            // if nothing changed (deleted) -> quit
            if (tagList.length === originalLength) return false;
            // save new list or delete if empty
            if (tagList.length) {
                await saveObjectTags(objectType, objectId, tagList);
            } else {
                await TagDB.deleteRecord(objectType, objectId);
            }
            return true;
        }

        async function buildSuggestionPool() {
            const allTags = await TagDB.getUniqueTagNames(state.objectType);
            if (!allTags || !allTags.length) return [];
            return allTags.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        }

        async function updateDatalist(prefix) {
            const dl = document.getElementById("tm-tag-suggestions");
            if (!dl) return;
            const p = String(prefix || "");
            const pool = await buildSuggestionPool();
            const matches = pool
                .filter(s => !p || s.startsWith(p))
                .slice(0, MAX_CHARS);
            dl.innerHTML = "";
            matches.forEach(s => {
                dl.appendChild(el("option", {value: s}));
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
                                click: async (e) => {
                                    e.stopPropagation();
                                    await deleteTagFromObject(state.objectType, state.objectId, state.tags, state.tags[i]);
                                    state.tags = await loadObjectTags(state.objectType, state.objectId);
                                    render();
                                }
                            }
                        }, "✕")
                    ));
                });
            }

            addBtn.addEventListener("click", async () => {
                const tagName = (nameIn.value || "").trim().slice(0, MAX_CHARS);
                if (!tagName) return;
                await addTagToObject(state.objectType, state.objectId, state.tags, {name: tagName, color: state.currentColor});
                state.tags = await loadObjectTags(state.objectType, state.objectId);
                nameIn.value = "";
                await updateDatalist("");
                render();
            });

            clearBtn.addEventListener("click", async () => {
                if (!state.tags || !state.tags.length) return;
                await TagDB.deleteRecord(state.objectType, state.objectId);
                state.tags = [];
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

        async function open(opts = {}) {
            ensureModal();
            state.objectId = opts.objectId || "global";
            state.objectType = opts.objectType || "UNKNOWN";
            state.onclose = opts.onclose;
            ensureModal._titleEl.textContent = opts.title || "ABS Tag Manager";
            state.tags = await loadObjectTags(state.objectType, state.objectId);
            await updateDatalist("");
            ensureModal._render();
            ensureModal._backdrop.style.display = "block";
            setTimeout(() => ensureModal._nameInput.focus(), 0);
        }

        function close() {
            if (ensureModal._backdrop) ensureModal._backdrop.style.display = "none";
            if (state.onclose) setTimeout(state.onclose, 100);
        }

        /*
         * This is temporaru function for migration of pre-v2.0 data (GM_setValue) to 2.x data (IndexedDB); will be removed in v2.5+
         */
        async function oneTimeMigration() {
            function gmNsKey(baseKey) {
                return `${location.host}::${baseKey}`;
            }

            function typedKey(objType, baseKey) {
                return `${objType}:${baseKey}`;
            }

            function gmGet(objType, baseKey, defaultValue) {
                return GM_getValue(gmNsKey(typedKey(objType, baseKey)), defaultValue);
            }

            async function migrateOnce(objectType) {
                // get all legacy data
                const tagsById = gmGet(objectType, "tagsById", {});
                const allTags = gmGet(objectType, "allTags", {});
                // transaction for safe migration
                await db.transaction('rw', db.table(objectType), async () => {
                    const migrationPromises = Object.entries(allTags).map(async ([entityId, tagIds]) => {
                        const tags = tagIds.map(tagId => {
                            const tagInfo = tagsById[tagId];
                            return tagInfo ? {name: tagInfo.name, color: tagInfo.color} : null;
                        }).filter(Boolean);
                        await db.table(objectType).put({id: Number(entityId), tagList: tags});
                    });
                    await Promise.all(migrationPromises);
                });
                // after successfull migration delete legacy data
                GM_deleteValue(gmNsKey(typedKey(objectType, "tagsById")));
                GM_deleteValue(gmNsKey(typedKey(objectType, "allTags")));
                GM_deleteValue(gmNsKey(typedKey(objectType, "tagIndexByName")));
                GM_deleteValue(gmNsKey(typedKey("t", "__seq__")));
            }

            for (const objectType of ["colony", "fleet"]) {
                try {
                    if (gmGet(objectType, "allTags", null) === null) continue; // already migrated
                    console.info(`TM: Trying to migrate '${objectType}' ...`);
                    await migrateOnce(objectType);
                    console.info(`TM: Migration of '${objectType}' finished OK`);
                } catch (e) {
                    console.error(`TM: Migration of '${objectType}' failed`, e);
                }
            }
        }

        return {open, oneTimeMigration};
    })();

    (async () => {
        const FLEET_ID_RE = /(?:[?&]fleet=|\/fleet\/)(\d+)/;
        const COLONY_ID_RE = /[?&]colony=(\d+)/;
        const ZWSP_RE = new RegExp(ZWSP + ".*$");

        function parseIdFromURL(pattern) {
            const m = document.URL.match(pattern);
            return (m && m[1]) ? Number(m[1]) : null;
        }

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({
                "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
            }[c]));
        }

        function getTagsFragment(tagList) {
            if (!tagList || !tagList.length) return "";
            const chips = [];
            for (const tag of tagList) {
                chips.push(`&nbsp;<span style="color:${tag.color};white-space:nowrap;"><i class="fa-solid fa-tag"></i>${escapeHtml(tag.name)}</span>`);
            }
            return chips.join("");
        }

        function decorateOneLink(node, tagList) {
            const name = node.innerHTML.replace(ZWSP_RE, "").trim();
            const tags = getTagsFragment(tagList);
            const space = tags.length ? `${ZWSP}&nbsp;` : "";
            node.innerHTML = `${name}${space}${tags}`;
        }

        function decorateTitle(node, tagList, clickHandler) {
            let tags = getTagsFragment(tagList);
            if (!tags || !tags.length) tags = `&nbsp;<i class="fa-solid fa-tag"></i>`;
            const TM_TITLE_TAGS = 'tm-title-tags';
            const span = byId(TM_TITLE_TAGS) || el("span", {
                id: TM_TITLE_TAGS,
                title: "Click to open tag manager",
                style: {cursor: "pointer", "font-size": "0.5em", "font-family": "Rubik,sans-serif", "letter-spacing": "normal"},
                on: {click: clickHandler}
            });
            span.innerHTML = `&nbsp;&nbsp;${tags}`;
            node.after(span);
        }

        function decorateColonyScreen(objectId, colonyTags) {
            const mid = byId('midcolumn');
            const nodeToDecorate = mid?.querySelector('.pagetitle > div.flex_center') ?? mid?.querySelector('.pagetitle');
            if (nodeToDecorate) {
                decorateTitle(nodeToDecorate, colonyTags, () => {
                    openDialog("colony", objectId);
                });
            }
        }

        function decorateFleetScreen(objectId, fleetTags) {
            const nodeToDecorate = byId('midcolumn')?.querySelector('#pageHeadLine');
            if (!nodeToDecorate) return; // no title?
            decorateTitle(nodeToDecorate, fleetTags, function () {
                openDialog("fleet", objectId);
            });
        }

        function _decorateObjectList(allTags, nodeSelector) {
            for (const [objectId, tags] of allTags) {
                if (!objectId || !tags) return;
                nodeSelector(objectId).forEach((node) => {
                    try {
                        decorateOneLink(node, tags);
                    } catch (e) {
                        console.error(`TM: Can't decorate ${objectId}: ${e.message}`, e);
                    }
                });
            }
        }

        function decorateColonySideList(allTags) {
            const colonyList = document.getElementById('colonylist');
            if (!colonyList) return;
            _decorateObjectList(allTags, (objectId) => {
                return colonyList.querySelectorAll(`a[href$="/view_colony.php?colony=${objectId}"]`);
            });
        }

        function decorateOverviewColonies(colonyTags) {
            const colonyList = document.getElementById('coloniesContainer');
            if (!colonyList) return;
            _decorateObjectList(colonyTags, (objectId) => {
                return colonyList.querySelectorAll(`a[href$="/view_colony.php?colony=${objectId}"]`);
            });
        }

        function decorateFleetSideList(fleetTags) {
            const fleetList = document.getElementById('fleetlist');
            if (!fleetList) return;
            _decorateObjectList(fleetTags, (objectId) => {
                return fleetList.querySelectorAll(`a[href$="/fleet.php?fleet=${objectId}"]`)
            });
        }

        function decorateOverviewFleets(allTags, tagsById) {
            const fleetList = document.getElementById('fleetSort');
            if (!fleetList) return;
            _decorateObjectList(allTags, (objectId) => {
                return fleetList.querySelectorAll(`a[href$="/fleet.php?fleet=${objectId}"]`);
            });
        }

        function openDialog(objectType, objectId) {
            TagManagerUI.open({
                objectType: objectType,
                objectId: objectId,
                title: `Tags for ${objectType} #${objectId}`,
                onclose: function () {
                    decorateSome(objectType, objectId);
                }
            });
        }

        function addTagManagerListener(objectType, objectId) {
            document.addEventListener("keydown", e => {
                if (e.altKey && e.key.toLowerCase() === "t") openDialog(objectType, objectId);
            });
        }

        // decorates only specific entity/object (after tags changed for specific entity)
        async function decorateSome(objectType, objectId) {
            switch (objectType) {
                case "colony": {
                    const colonyTags = await TagDB.getTags("colony", objectId)
                    decorateColonySideList(new Map().set(objectId, colonyTags));
                    decorateColonyScreen(objectId, colonyTags);
                    return;
                }
                case "fleet": {
                    const fleetTags = await TagDB.getTags("fleet", objectId)
                    decorateFleetSideList(new Map().set(objectId, fleetTags));
                    decorateFleetScreen(objectId, fleetTags);
                    return;
                }
            }
            console.error("TM: decorateSome - unknown objectType:", objectType);
        }

        // FIXME
        await TagManagerUI.oneTimeMigration();

        try {
            const urlstr = document.URL;
            const colonyTags = await TagDB.getAllRecordsMap("colony")
            const fleetTags = await TagDB.getAllRecordsMap("fleet")
            if (urlstr.match(/atmoburn\.com\/[a-zA-Z_]+\.php\?colony=/i)) {
                const objectId = parseIdFromURL(COLONY_ID_RE);
                if (objectId) {
                    addTagManagerListener("colony", objectId);
                    if (colonyTags) decorateColonyScreen(objectId, colonyTags.get(objectId));
                }
            } else if (urlstr.match(/atmoburn\.com\/fleet\.php/i) || urlstr.match(/atmoburn\.com\/fleet\//i)) {
                const objectId = parseIdFromURL(FLEET_ID_RE);
                if (objectId) {
                    addTagManagerListener("fleet", objectId);
                    if (fleetTags) decorateFleetScreen(objectId, fleetTags.get(objectId));
                }
            } else if (urlstr.match(/atmoburn\.com\/overview.php\?view=1/i)) {
                decorateOverviewColonies(colonyTags);
            } else if (urlstr.match(/atmoburn\.com\/overview.php\?view=2/i)) {
                decorateOverviewFleets(fleetTags);
            }
            decorateColonySideList(colonyTags);
            decorateFleetSideList(fleetTags);
        } catch (e) {
            console.error('TM: error', e);
        }

    })();

})();
