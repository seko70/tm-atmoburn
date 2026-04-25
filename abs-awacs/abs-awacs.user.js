// ==UserScript==
// @name         AtmoBurn Services - AWACS
// @namespace    sk.seko
// @license      MIT
// @version      0.18.0
// @description  UI for abs-archivist - display nearest fleets, colonies, rally points in various contexts; uses data produced by abs-archivist
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-awacs/abs-awacs.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-awacs/abs-awacs.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-awacs/README.md
// @match        https://*.atmoburn.com/fleet.php?*
// @match        https://*.atmoburn.com/fleet/*
// @match        https://*.atmoburn.com/view_colony.php*
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/abs-utils/v1.2.2/commons/abs-utils.js
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/atmoburn-service-db/v1.2.0/commons/atmoburn-service-db.js
// @resource     TABULATOR_JS  https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator.min.js
// @resource     TABULATOR_CSS https://unpkg.com/tabulator-tables@6.3.1/dist/css/tabulator_site_dark.min.css
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceText
// @grant        GM_setClipboard
// @grant        unsafeWindow
// ==/UserScript==

/* jshint esversion: 11 */
/* jshint node: true */

// @ts-check
/// <reference types="tabulator-tables" />
/* global Tabulator */


// main function/definition/script
(function () {
    'use strict';

    // specific colors
    const MY_GREEN = "#3BCC72";
    const MY_GRAY = "#cccccc";
    const MY_RED = "#ff3838";
    const MY_ORANGE = "#faca4b";
    const MY_YELLOW = "#f5ff80";
    const MY_BLACK = "#111111";
    const DARK1 = "#2b2b2b";
    const DARK2 = "#242424";
    const DARK4 = "#444444";

    // Relation constants
    const Relation = {MY: 'm', Friend: 'f', Neutral: 'n', Enemy: 'e',};

    // Recrod types
    const Type = {Colony: 'Colony', Fleet: 'Fleet', RP: 'RP', WH: 'WH',};

    // color map for relation value
    const REL_COLOR = {'e': MY_RED, 'f': MY_GREEN, 'n': MY_GRAY, 'm': MY_YELLOW,};

    // Rally Points subtype code-to-name map
    const RP_SUBTYPES = {'L': 'Location', 'C': 'Colony', 'F': 'Fleet', 'W': 'Wormhole', 'T': 'Target'};

    // icons for labels
    const ICON = {Colony: "👥", Fleet: "🛰️", WH: "🌀", RP: "🧾", Navigate: "🧭", Launch: "🚀️", Reference: "👆", Edit: "🖉", Map: "🌌", Link: "🔗"};

    // ui profile
    const DIALOG_PROFILES = {
        MY_COLS: {relFilter: 0, typeFilter: 0, colonies: 1, fleets: 0, rps: 0, whs: 0, rel: Relation.MY},
        ALL_COLS: {relFilter: 1, typeFilter: 0, colonies: 1, fleets: 0, rps: 0, whs: 0},
        MY_FLTS: {relFilter: 0, typeFilter: 0, colonies: 0, fleets: 1, rps: 0, whs: 0, rel: Relation.MY},
        ALL_FLTS: {relFilter: 1, typeFilter: 0, colonies: 0, fleets: 1, rps: 0, whs: 0},
        RPS: {relFilter: 0, typeFilter: 0, colonies: 0, fleets: 0, rps: 1, whs: 0},
        WHS: {relFilter: 0, typeFilter: 0, colonies: 0, fleets: 0, rps: 0, whs: 1},
        ALL: {relFilter: 1, typeFilter: 1, colonies: 1, fleets: 1, rps: 1, whs: 1},
    }

    // window style
    const ABS_WINDOW_STYLE = `
html { font-family:Arial,sans-serif; background-color:${DARK2}; color:${MY_GRAY}; }
* { margin:0; padding:0; box-sizing:border-box; }
a { color:inherit; }
a.icon { text-decoration: none !important; }
.icon-btn { cursor: pointer; user-select: none; font-size: 15px; }
.icon-btn:hover { filter: brightness(1.2); }
.tabulator { font-size: 12px !important; background-color: ${DARK2} !important; color: ${MY_GRAY} !important; }
.tabulator-header-contents { background-color: ${DARK2}; }
.tabulator .tabulator-header .tabulator-col { background: ${DARK2} !important; }
.tabulator-row .tabulator-cell { color: ${MY_GRAY} !important; padding: 2px !important; }
.tabulator-row.tabulator-row-even { background-color: ${DARK1} !important; }
.tabulator-row.tabulator-row-odd { background-color: ${DARK2} !important; }
.tabulator-row.tabulator-selectable:hover { background-color: ${MY_BLACK} !important; }
.tabulator .tabulator-header .tabulator-col input, .tabulator .tabulator-header .tabulator-col select { background-color: ${DARK2} !important; }
.tabulator-row,.tabulator-cell { cursor: default !important; }
.tabulator-menu .tabulator-menu-item { font-size: 12px !important; background-color: ${DARK4}; color: #eeeeee !important; }
.tabulator-menu .tabulator-menu-item:hover { color: ${MY_BLACK} !important; }
.topline { display: flex; justify-content: center; align-items: center; background-color: ${DARK1} !important; padding: 4px 10px; }
.toplineleft { margin-right: auto; }
.toplineright {margin-left: auto; }
.cfgreen { color: ${MY_GREEN}; }
.cfgray { color: ${MY_GRAY}; }
.cfred { color: ${MY_RED}; }
.cfyellow { color: ${MY_YELLOW}; }
.cborgange { color: ${MY_ORANGE}; }
.tg {
  min-width: 30px; height: 22px; padding: 0 6px; background: ${DARK4};
  border-radius: 4px; border: 1px solid #999;
  font-size: 11px; font-weight: 600; cursor: pointer; user-select: none;
}
.tg.on { filter: brightness(0.50); border-color: #4caf50; }
.tg:active { transform: translateY(1px);}
.tg.on:hover { filter: brightness(0.60); }
.tg:hover { filter: brightness(0.90); }
.tabulator .tabulator-header .tabulator-col .tabulator-col-content .tabulator-col-sorter .tabulator-arrow {
    border-left: 3px solid transparent !important;
    border-right: 3px solid transparent !important;
}
.tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-title { padding-right: 12px !important; }
`;

    const LOADING_HTML = `<!doctype html>
<html lang="C">
    <head><meta name="color-scheme" content="dark"><style>:root{color-scheme:dark} html,body{background:${DARK2};color:#ccc}</style></head>
    <body><div id="boot">LOADING…</div><div id="app"></div></body>
</html>`;

    const WINDOW_NAME = 'awacs_popup';
    const FEATURES = 'scrollbars=no,resizable=no,status=no,location=no,toolbar=no,menubar=no,width=1000,height=800,left=200,top=50';

    // --- AWACS window (lazy init)
    let awacsWin = null;

    // --- AWACS ref point (lazy init)
    let refPoint = null;

    // --- dialog profile (lazy init)
    let dialogProfile = null;

    // --- Dexie DB
    const db = window.sharedDB;

    // --- Various helpers

    // current date
    const now = Date.now();

    // just log the message to console, with script name as a prefix
    function xlog(...args) {
        console.info('AWACS', ...args);
    }

    // same as xlog, but as a warning
    function xerror(msg, ...err) {
        console.warn('AWACS', msg, ...err);
    }

    // Inject Tabulator from @resource into the POPUP so it’s evaluated in win
    async function ensureTabulatorIn(win) {
        const d = win.document;
        // CSS once
        if (!d.querySelector('style[data-awacs-tabulator-css]')) {
            const css = GM_getResourceText('TABULATOR_CSS');
            const style = d.createElement('style');
            style.setAttribute('data-awacs-tabulator-css', '1');
            style.textContent = css;
            d.head.appendChild(style);
        }
        // JS once
        if (!win.Tabulator) {
            const js = GM_getResourceText('TABULATOR_JS');
            const s = d.createElement('script');
            s.setAttribute('data-awacs-tabulator-js', '1');
            // Evaluate in popup global => defines win.Tabulator with win.HTMLElement realm
            s.textContent = js;
            d.head.appendChild(s);
        }
        // Wait until Tabulator appears (very quick since inline)
        const start = performance.now();
        while (!win.Tabulator) {
            if (performance.now() - start > 2000) throw new Error("Tabulator failed to attach to popup.");
            await new Promise(r => setTimeout(r, 10));
        }
        return win.Tabulator;
    }

    function _modifyFilter(table, field, value, isOn) {
        const filterOp = isOn ? table.addFilter : table.removeFilter;
        filterOp(field, "!=", value);
    }

    function _setButtonState(btn, state) {
        if (btn.classList.contains("on") !== state) btn.click();
    }

    function _setupFilter(doc, table, elementId, field, value, disable) {
        const btn = doc.getElementById(elementId);
        if (!btn) return;
        if (disable) {
            btn.style.visibility = 'hidden';
            return;
        }
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey) {
                // set current button filter off
                _modifyFilter(table, field, value, false);
                // set all others buttons on (in the same group)
                const btnGroupId = {"rel": "filtersRel", "type": "filtersType"}[field];
                const btns = btnGroupId ? doc.getElementById(btnGroupId) : null;
                if (btns) {
                    // modify filter for all buttons in the same group
                    btns.querySelectorAll(".tg").forEach((ele) => {
                        _setButtonState(ele, ele !== btn);
                    });
                }
            } else {
                btn.classList.toggle("on");
                _modifyFilter(table, field, value, btn.classList.contains("on"));
            }
        });
    }

    function setupGlobalFilters(doc, table) {
        // global filter
        //table.addFilter("dist", "<", 1000);
        // filter by relation
        const relFilterDisabled = !dialogProfile.relFilter;
        _setupFilter(doc, table, "cbfMe", "rel", Relation.MY, relFilterDisabled);
        _setupFilter(doc, table, "cbfFriend", "rel", Relation.Friend, relFilterDisabled);
        _setupFilter(doc, table, "cbfNeutral", "rel", Relation.Neutral, relFilterDisabled);
        _setupFilter(doc, table, "cbfEnemy", "rel", Relation.Enemy, relFilterDisabled);
        // filter by type
        const typeFilterDisabled = !dialogProfile.typeFilter;
        _setupFilter(doc, table, "cbfColony", "type", Type.Colony, typeFilterDisabled);
        _setupFilter(doc, table, "cbfFleet", "type", Type.Fleet, typeFilterDisabled);
        _setupFilter(doc, table, "cbfRP", "type", Type.RP, typeFilterDisabled);
        _setupFilter(doc, table, "cbfWH", "type", Type.WH, typeFilterDisabled);
    }

    async function setReferencePoint() {
        let val = awacsWin.prompt("Input global coordinates as reference point", "");
        if (val === null) return; // cancel was pressed
        const [x, y, z] = val.split(/[^0-9-]+/).map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        [refPoint.x, refPoint.y, refPoint.z, refPoint.name, refPoint.fid] = [x, y, z, "(custom)", null];
        await resetAwacsWindowInPlace();
    }

    function exportToCSV(table) {
        table.download("csv", "data.csv", {bom: true, delimiter: csvDelimiterByLocale()});
    }

    async function buildTabulatorInPopup({title, data, columns, options = {}}) {
        // check for window already open
        const refPointStr = `<b>${refPoint.name}</b> (${refPoint.x},${refPoint.y},${refPoint.z})`;
        awacsWin.document.open();
        awacsWin.document.write(`
            <div id="awacsHead" class="topline tabulator">
                <span class="toplineleft cfyellow" title="Reference point for distance, directions etc">${refPointStr}&nbsp;
                    <span class="icon-btn" id="awacsRefEdit" title="Set custom Reference point (enter global coordinates)">${ICON.Edit}</span>
                </span>
                <span id="filtersRel">
                    <button class="tg cfyellow" id="cbfMe" title="Hide my own; use CTRL to show only my own">M</button>
                    <button class="tg cfgreen" id="cbfFriend" title="Hide friends; use CTRL to show only friends">F</button>
                    <button class="tg cfgray" id="cbfNeutral" title="Hide neutrals; use CTRL to show only neutrals">N</button>
                    <button class="tg cfred" id="cbfEnemy" title="Hide enemies; use CTRL to show only enemies">E</button>
                </span>
                <span id="filtersType">&nbsp;&nbsp;&nbsp;
                    <button class="tg" id="cbfColony" title="Hide colonies; use CTRL to show only colonies">${ICON.Colony}</button>
                    <button class="tg" id="cbfFleet" title="Hide fleets; use CTRL to show only fleets">${ICON.Fleet}</button>
                    <button class="tg" id="cbfRP" title="Hide rally points; use CTRL to show only rally points">${ICON.RP}</button>
                    <button class="tg" id="cbfWH" title="Hide wormholes; use CTRL to show only wormholes">${ICON.WH}</button>
                </span>
                <span id="filtersType">&nbsp;&nbsp;&nbsp;
                    <button class="tg" id="exportCSV" title="Export current view to CSV file">CSV</button>
                </span>
                <span class="toplineright">Last update: __updateInfo__</span>
            </div>
            <div id="awacsTable"></div>
        `);
        awacsWin.document.title = title;
        awacsWin.document.getElementById("awacsRefEdit").addEventListener('click', setReferencePoint);

        // apply default/global style
        const styleElement = awacsWin.document.createElement('style');
        styleElement.textContent = ABS_WINDOW_STYLE;
        awacsWin.document.head.appendChild(styleElement);

        // prepare container element for table
        let container = awacsWin.document.querySelector("#awacsTable");
        if (!container) {
            container = awacsWin.document.createElement("div");
            container.id = "awacsTable";
            awacsWin.document.body.appendChild(container);
        }

        // initialize tabulator table
        await ensureTabulatorIn(awacsWin);

        // IMPORTANT: use win.Tabulator and popup element
        const head = awacsWin.document.getElementById("awacsHead");
        const headHeight = head ? head.offsetHeight : 0;
        const table = new awacsWin.Tabulator(container, {
            data,
            columns,
            layout: "fitColumns",
            height: `calc(100vh - ${headHeight}px)`,
            initialSort: [{column: "dist", dir: "asc"},],
            ...options,
        });

        // add filter callbacs
        setupGlobalFilters(awacsWin.document, table);
        awacsWin.document.close();

        return table;
    }

    function _computeNavigateLink(objType, obj) {
        if (!obj.id) return null;
        if (objType === Type.Colony) {
            return `/view_colony.php?colony=${obj.id}`;
        }
        if (objType === Type.Fleet && (obj.relation === Relation.MY || obj.player === "(CONFED)")) {
            return `/fleet.php?fleet=${obj.id}`;
        }
        return null;
    }

    function _computeMapLink(row) {
        if (!row.id || row.x == null) return null;
        const fleetLink = (refPoint && refPoint.fid) ? `&fleet=${refPoint.fid}` : '';
        return `/extras/view_universe.php?x=${row.x}&y=${row.y}&z=${row.z}${fleetLink}`;
    }

    function _getTargetFleetUrlParams(o) {
        // example: tpos=colony&tsystem=123&x=3949&y=-1&z=-1
        const s = o.system ?? -1;
        if (o.id && o.colony) return `tpos=colony&tsystem=${s}&x=${o.colony}&y=-1&z=-1&tfleet=${o.id}`;
        if (o.world) return `tworld=${o.world}`;
        if (o.x === null) return null;
        if (o.id && o.system) return `tpos=system&tsystem=${s}&x=${o.x}&y=${o.y}&z=${o.z}&tfleet=${o.id}`;
        return `tpos=global&x=${o.x}&y=${o.y}&z=${o.z}&tfleet=${o.id}`;
    }

    function _computeLaunchLink(objType, obj) {
        if (!refPoint.fid) return null;
        const isControlled = obj.relation === Relation.MY || obj.player === "(CONFED)";
        const isCivilGov = obj.player === 'Civil Goverment' || obj.player === 'Ghosts of the Past';
        if (objType === Type.Colony) {
            if (obj.id && (isControlled || isCivilGov)) return `/fleet.php?tcolony=${obj.id}&fleet=${refPoint.fid}`;
            if (obj.world) return `/fleet.php?tworld=${obj.world}&fleet=${refPoint.fid}`;
            if (obj.system) return `/fleet.php?tsystem=${obj.system}&fleet=${refPoint.fid}`;
            return null;
        }
        if (objType === Type.Fleet) {
            const p = _getTargetFleetUrlParams(obj);
            return p ? `/fleet.php?fleet=${refPoint.fid}&${p}` : null;
        }
        if (objType === Type.RP || objType === Type.WH) {
            return `/fleet.php?x=${obj.x}&y=${obj.y}&z=${obj.z}&tpos=global&fleet=${refPoint.fid}`;
        }
        return null;
    }

    function _concatStrings(s1, s2, s3) {
        return [s1, s2, s3].filter(s => s != null && s !== '').join(', ') || null;
    }

    function _getSubtype(objType, obj) {
        return objType === Type.RP ? `(${RP_SUBTYPES[obj.type] ?? "?"})` : null;
    }

    function _fillFrom(objType, icon, o) {
        const havePosition = o.x != null;
        const directions = havePosition ? absDirections(refPoint, o) : [null, null];
        return {
            id: o.id,
            sig: o.signature,
            icon: icon,
            type: objType,
            name: o.name,
            comment: _concatStrings(o.comment, o.location, _getSubtype(objType, o)),
            navigate: _computeNavigateLink(objType, o),
            launch: _computeLaunchLink(objType, o),
            player: o.player,
            faction: o.faction,
            rel: o.relation ?? 'n',
            ships: o.ships,
            tonnage: o.tonnage,
            roster: o.roster,
            pop: o.population,
            size: o.size,
            position: havePosition ? `${o.x},${o.y},${o.z}` : null,
            x: o.x,
            y: o.y,
            z: o.z,
            system: o.system,
            world: o.world,
            colony: o.colony,
            dist: havePosition ? absDistance(refPoint, o) : null,
            horiz: havePosition ? `${directions.arrow} ${directions.clock}'` : null,
            vert: havePosition ? `${directions.v}º` : null,
            ts: o.ts,
        };
    }

    async function addAllColonies(data) {
        await db.colony.each(c => {
            if (!dialogProfile.rel || dialogProfile.rel === c.relation) {
                data.push(_fillFrom(Type.Colony, ICON.Colony, c));
            }
        });
    }

    async function addAllFleets(data) {
        await db.fleet.each(f => {
            if (!dialogProfile.rel || dialogProfile.rel === f.relation) {
                data.push(_fillFrom(Type.Fleet, ICON.Fleet, f));
            }
        });
        await db.signature.each(f => {
            if (!dialogProfile.rel || dialogProfile.rel === f.relation) {
                data.push(_fillFrom(Type.Fleet, ICON.Fleet, {...f, id: null, signature: f.id, comment: '(signature scan)'}));
            }
        });
        await db.outpost.each(f => {
            if (!dialogProfile.rel || dialogProfile.rel === f.relation) {
                data.push(_fillFrom(Type.Fleet, ICON.Fleet, {...f, id: null, comment: '(outpost)'}));
            }
        });
    }

    async function addAllWormholes(data) {
        await db.wh.each(wh => {
            data.push(_fillFrom(Type.WH, ICON.WH, wh));
        });
    }

    async function addAllRallyPoints(data) {
        await db.rp.each(rp => {
            data.push(_fillFrom(Type.RP, ICON.RP, rp));
        });
    }

    function formatMinutesCompact(totalMinutes) {
        const absMinutes = Math.abs(totalMinutes);
        const days = Math.floor(absMinutes / 1440);
        const remainingMinutes = absMinutes % 1440;
        const hours = Math.floor(remainingMinutes / 60);
        const minutes = remainingMinutes % 60;
        const parts = [
            days > 0 ? `${days}d` : '',
            hours > 0 ? `${hours}h` : '',
            (minutes > 0 || absMinutes === 0) && days === 0 ? `${minutes}m` : '' // don't show minutes if there are days
        ].filter(Boolean);
        return (totalMinutes < 0 ? '-' : '') + parts.join(' ');
    }

    function getTimeColor(totalMinutes) {
        const absMinutes = Math.abs(totalMinutes);
        if (absMinutes <= 30) return MY_GREEN;
        if (absMinutes <= 3 * 60) return MY_GRAY;
        if (absMinutes <= 24 * 60) return MY_ORANGE;
        if (absMinutes <= 7 * 24 * 60) return MY_RED;
        return "black";
    }

    function getTimeDiffInMinutes(ts) {
        return Math.round((ts - now) / 60_000);
    }

    // helper function for creating labeled value
    const _u = function (label, value) {
        return `${label}: <b>${value ?? "?"}</b>`
    }

    // Field tooltips
    const TT = {
        REL: function (e, cell, _onRendered) {
            const r = cell.getRow().getData();
            return `${_u("System", r.system)}<br>${_u("World", r.world)}<br>${_u("Location", r.location)}`;
        },
        DIR: function (e, cell, _onRendered) {
            return `${_u("Vertical elevation", cell.getRow().getData().vert)}`;
        },
        SIZE: function (e, cell, _onRendered) {
            return `${_u("Roster", cell.getRow().getData().roster)}`;
        },
        UPDATED: function (e, cell, _onRendered) {
            return cell.getValue() ? `${formatDateTime(new Date(cell.getValue()))}` : null;
        },
    }

    // Formatters
    const FMT = {
        MENU: () => `<span style="cursor:pointer;">⋮</span>`,
        FIXED2: function (cell, formatterParams, onRendered) {
            const distkm = cell.getValue();
            if (distkm == null) return null;
            const dist = (Math.round(distkm / 10_000) / 100).toFixed(2);
            if (!refPoint || refPoint.range == null) return dist;
            if (distkm > refPoint.maxRange) return dist;
            const color = distkm < 10_000 ? MY_YELLOW : distkm <= refPoint.range ? MY_GREEN : MY_RED;
            if (color) {
                onRendered(function () {
                    cell.getElement().style.setProperty("color", color, "important");
                });
            }
            return dist;
        },
        TS: function (cell, formatterParams, onRendered) {
            const ts = cell.getValue();
            if (!ts) return null;
            const timeDiffInMinutes = getTimeDiffInMinutes(ts);
            const tsFormat = formatMinutesCompact(timeDiffInMinutes);
            const tsColor = getTimeColor(timeDiffInMinutes);
            onRendered(function () {
                cell.getElement().style.setProperty("color", tsColor, "important");
            });
            return tsFormat;
        },
        REF_COLOR_FG: function (cell, formatterParams, onRendered) {
            const color = REL_COLOR[cell.getRow().getData().rel] ?? "white"
            onRendered(function () {
                cell.getElement().style.setProperty("color", color, "important");
            });
            return cell.getValue();
        },
        ID: function (cell, _formatterParams, _onRendered) {
            const sig = cell.getRow().getData().sig;
            const val = cell.getValue(); // id - number or string (s#signature)
            if (typeof val === 'string' && val.startsWith('s#')) {
                return sig;
            }
            if (sig) {
                return `${val} / ${sig}`
            }
            return `${val}`;
        },
        NAME: function (cell, _formatterParams, _onRendered) {
            const r = cell.getRow().getData();
            let name = `${cell.getValue()}`;
            if (r.launch && refPoint && refPoint.fid) {
                const tooltip = `Launch '${refPoint.name}' toward '${r.name}'`;
                return `${r.icon} <a href="${r.launch}" target="maingame" title="${tooltip}">${name}</a>`;
            }
            if (r.navigate && r.rel === Relation.MY) {
                const tooltip = `Open screen for '${r.name}'`;
                return `${r.icon} <a href="${r.navigate}" target="maingame" title="${tooltip}">${name}</a>`;
            }
            return `${r.icon} ${cell.getValue()}`;
        },
    }

    async function resetAwacsWindowInPlace() {
        awacsWin.location.replace("about:blank");
        await initializeAwacsWindow(true);
    }

    function setReferencePointTo(row) {
        if (!row || row.x == null) return null;
        [refPoint.x, refPoint.y, refPoint.z] = [row.x, row.y, row.z];
        refPoint.name = row.name ?? "???";
        refPoint.fid = (row.type === Type.Fleet && (row.rel === Relation.MY || row.player === "(CONFED)")) ? row.id : null;
        resetAwacsWindowInPlace().catch(console.error);
    }

    const CLCK = {
        MENU: function (e, cell) {
            const row = cell.getRow().getData();
            const actions = [];
            // 'Navigate' menu item
            if (row.navigate) {
                actions.push({
                    label: `<a href="${row.navigate}" class="icon" target="maingame">${ICON.Navigate} Open screen for ${row.name}</a>`,
                });
            }
            // 'Map' menu item
            const mapLink = _computeMapLink(row);
            if (mapLink) {
                actions.push({
                    label: `<a href="${mapLink}" class="icon">${ICON.Map} Open universe map</a>`,
                });
            }
            // 'Launch' menu item
            if (row.launch) {
                actions.push({
                    label: `<a href="${row.launch}" class="icon" target="maingame">${ICON.Launch} Launch '${refPoint.name}' toward '${row.name}</a>`,
                });
            }
            // 'Set reference point' menu item
            if (row.x != null) {
                actions.push({
                    label: `<a href="#" class="icon">${ICON.Reference} Set '${row.name}' as Reference point</a>`,
                    action: () => setReferencePointTo(row),
                });
            }
            // 'Copy coords''
            if (row.x != null) {
                actions.push({
                    label: `${ICON.Link} Copy coords`,
                    action: () => GM_setClipboard(String(row.position), "text"),
                });
            }
            return actions;
        },
    }

    async function initializeAwacsWindow(keepRefPoint) {
        // init refPoint
        if (!keepRefPoint && unsafeWindow.refPoint) {
            refPoint = Object.assign({}, unsafeWindow.refPoint);
        }
        if (!refPoint) {
            xerror("No refPoint found; using default");
            refPoint = {x: 0, y: 0, z: 0, name: "???"};
        }
        // Header tooltips
        const HTT = {
            ID: "Identifier of the colony/fleet/rally point/wormhole etc",
            SIG: "Signature of the fleet",
            REL: "Player relation; (m)e,(f)riend,(n)eutral,(e)nemy",
            ACT: "Action buttons",
            DIST: `Distance from ${refPoint.name}, in mkm`,
            DIR: `O’clock direction from ${refPoint.name}; relative vertical elevation (in degrees) is in tooltip`,
        };
        // collect/compute/process data
        const data = [];
        if (dialogProfile.colonies) await addAllColonies(data);
        if (dialogProfile.fleets) await addAllFleets(data);
        if (dialogProfile.rps) await addAllRallyPoints(data);
        if (dialogProfile.whs) await addAllWormholes(data);
        // define columns
        let columns = [
            {title: "#", formatter: "rownum", width: 40, hozAlign: "center", headerSort: false},
            {title: "ID", field: "id", headerFilter: true, width: 60, headerTooltip: HTT.ID},
            {title: "Sig", field: "sig", headerFilter: true, width: 60, headerTooltip: HTT.SIG},
            {title: "Name", field: "name", headerFilter: true, minWidth: 130, formatter: FMT.NAME, tooltip: TT.NAME},
            {title: "Detail", field: "comment", headerFilter: true, minWidth: 70},
            {title: "", field: "actions", minWidth: 20, width: 25, hozAlign: "center", headerSort: false, formatter: FMT.MENU, clickMenu: CLCK.MENU},
            {title: "Player", field: "player", headerFilter: true, minWidth: 70, formatter: FMT.REF_COLOR_FG},
            {title: "Rel", field: "rel", headerFilter: true, width: 50, headerSort: false, formatter: FMT.REF_COLOR_FG, headerTooltip: HTT.REL},
            {title: "Position", field: "position", headerFilter: true, minWidth: 40, maxWidth: 200, hozAlign: "right", tooltip: TT.REL},
            {title: "Dist", field: "dist", hozAlign: "right", width: 70, sorter: "number", headerTooltip: HTT.DIST, formatter: FMT.FIXED2},
            {title: "Dir", field: "horiz", hozAlign: "right", headerFilter: true, width: 50, headerSort: false, headerTooltip: HTT.DIR, tooltip: TT.DIR},
            {title: "Pop", field: "pop", hozAlign: "right", width: 60, sorter: "number"},
            {title: "Size", field: "size", hozAlign: "right", width: 60, sorter: "number"},
            {title: "Ships", field: "ships", hozAlign: "right", width: 65, sorter: "number", tooltip: TT.SIZE},
            {title: "Tons", field: "tonnage", hozAlign: "right", width: 60, sorter: "number"},
            {title: "Updated", field: "ts", headerSort: false, minWidth: 70, maxWidth: 120, formatter: FMT.TS, tooltip: TT.UPDATED}
        ];
        // remove columns if not appropriate
        if (!dialogProfile.colonies) columns = columns.filter(c => !["pop", "size"].includes(c.field));
        if (!dialogProfile.fleets) columns = columns.filter(c => !["sig", "ships", "tonnage"].includes(c.field));
        if (!dialogProfile.fleets && !dialogProfile.colonies) columns = columns.filter(c => !["player", "id"].includes(c.field));
        // create table
        try {
            return await buildTabulatorInPopup({
                title: `AtmoBurn-AWACS: ${refPoint.name}`,
                data, columns
            });
        } catch (err) {
            xerror(err);
            alert("Could not build Tabulator in popup (see console).");
        }
    }

    function csvDelimiterByLocale() {
        // If decimal separator is "," then CSV delimiter is (almost always) ";"
        const number = 1.1;
        return number.toLocaleString().includes(",") ? ";" : ",";
    }

    async function showAllStuffDialog(newDialogProfile) {
        dialogProfile = newDialogProfile;
        if (awacsWin && !awacsWin.closed) {
            awacsWin.focus();
        } else {
            awacsWin = window.open("", WINDOW_NAME, FEATURES);
            if (!awacsWin) {
                throw new Error("Can't open window " + WINDOW_NAME);
            }
            if (awacsWin.__initialized) {
                awacsWin.close();
                awacsWin = window.open("", WINDOW_NAME, FEATURES);
            }
            awacsWin.__initialized = true;
            awacsWin.document.open();
            awacsWin.document.write(LOADING_HTML);
            awacsWin.document.close();
            const table = await initializeAwacsWindow(false)
            if (table) {
                awacsWin.document.getElementById("exportCSV").addEventListener('click', function () {
                    exportToCSV(table);
                });
            }
        }
    }

    function showMyColoniesDialog() {
        return showAllStuffDialog(DIALOG_PROFILES.MY_COLS);
    }

    function showAllColoniesDialog() {
        return showAllStuffDialog(DIALOG_PROFILES.ALL_COLS);
    }

    function showMyFleetsDialog() {
        return showAllStuffDialog(DIALOG_PROFILES.MY_FLTS);
    }

    function showAllFleetsDialog() {
        return showAllStuffDialog(DIALOG_PROFILES.ALL_FLTS);
    }

    function showRallyPointsDialog() {
        return showAllStuffDialog(DIALOG_PROFILES.RPS);
    }

    function showWormholesDialog() {
        return showAllStuffDialog(DIALOG_PROFILES.WHS);
    }

    function showAllDialog() {
        return showAllStuffDialog(DIALOG_PROFILES.ALL);
    }

    function createMenu(topmenu) {
        // create menu item
        const e = document.createElement("li");
        e.id = "AWACSMenu";
        e.innerHTML = `
		<a href="#" class="hide_mobile hide_small menu_title" id="awacsMenuTitle">[AWACS]</a>
		<div class="">
			<ul>
				<li><a id="awacsMyColsMenu" style="color:${REL_COLOR.m}">${ICON.Colony}&nbsp;My Colonies</a></li>
				<li><a id="awacsAllColsMenu">${ICON.Colony}&nbsp;All Colonies</a></li>
				<li><a id="awacsMyFleetsMenu" style="color:${REL_COLOR.m}">${ICON.Fleet}&nbsp;My Fleets</a></li>
				<li><a id="awacsAllFleetsMenu">${ICON.Fleet}&nbsp;All Fleets</a></li>
				<li><a id="awacsRPMenu">${ICON.RP}&nbsp;Rally Points</a></li>
				<li><a id="awacsWHMenu">${ICON.WH}&nbsp;Wormholes</a></li>
				<li><a id="awacsAllMenu">${ICON.Colony}${ICON.Fleet}${ICON.RP}${ICON.WH}&nbsp;All Records</a></li>
			</ul>
		</div>`;
        topmenu.append(e);

        // append click listener(s)
        document.getElementById("awacsMyColsMenu").addEventListener('click', showMyColoniesDialog);
        document.getElementById("awacsAllColsMenu").addEventListener('click', showAllColoniesDialog);
        document.getElementById("awacsMyFleetsMenu").addEventListener('click', showMyFleetsDialog);
        document.getElementById("awacsAllFleetsMenu").addEventListener('click', showAllFleetsDialog);
        document.getElementById("awacsRPMenu").addEventListener('click', showRallyPointsDialog);
        document.getElementById("awacsWHMenu").addEventListener('click', showWormholesDialog);
        document.getElementById("awacsAllMenu").addEventListener('click', showAllDialog);
    }

    (async () => {
        const topmenu = document.getElementById("topmenu");
        if (topmenu) {
            createMenu(topmenu);
        }
    })();

})
();
