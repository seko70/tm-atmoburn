// ==UserScript==
// @name         AtmoBurn Services - AWACS
// @namespace    sk.seko
// @license      MIT
// @version      0.9.1
// @description  UI for abs-archivist - display nearest fleets, colonies, rally points in various contexts; uses data produced by abs-archivist
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-awacs/abs-awacs.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-awacs/abs-awacs.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-awacs/README.md
// @match        https://*.atmoburn.com/fleet.php?*
// @match        https://*.atmoburn.com/fleet/*
// @match        https://*.atmoburn.com/view_colony.php*
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/abs-utils/v1.1.0/commons/abs-utils.js
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/atmoburn-service-db/v1.0.2/commons/atmoburn-service-db.js
// @resource     TABULATOR_JS  https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator.min.js
// @resource     TABULATOR_CSS https://unpkg.com/tabulator-tables@6.3.1/dist/css/tabulator_site_dark.min.css
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceText
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
    const DARK3 = "#333333";
    const DARK4 = "#444444";

    // Relation constants
    const Relation = {MY: 'm', Friend: 'f', Neutral: 'n', Enemy: 'e',};

    // Recrod types
    const Type = {Colony: 'Colony', Fleet: 'Fleet', RP: 'RP', WH: 'WH',};

    // color map for relation value
    const REL_COLOR = {'e': MY_RED, 'f': MY_GREEN, 'n': MY_GRAY, 'm': MY_YELLOW,};

    // icons for labels
    const ICON = {Colony: "👥", Fleet: "🛰️", WH: "🌀", RP: "🧾", Navigate: "🧭", Launch: "🚀️", Reference: "👆", Edit: "🖉"};

    // window style
    const ABS_WINDOW_STYLE = `
        * { margin:0;padding:0;box-sizing:border-box;scrollbar-color:#383838 #292929; }
        a { color:inherit; }
        a.icon { text-decoration: none !important; }

        .icon-btn {
          cursor: pointer;
          user-select: none;
          font-size: 15px;
        }
        .icon-btn:hover {
          filter: brightness(1.2);
        }

        .tabulator {
            font-family: 'Arial', sans-serif !important;
            font-size: 12px !important;
            background-color: ${DARK2} !important;
            color: #cccccc !important;
        }
        .tabulator-header-contents { background-color: ${DARK2}; }
        .tabulator .tabulator-header .tabulator-col {
            background: ${DARK2} !important;
        }
        .tabulator-row .tabulator-cell {
            color: #cccccc !important;
            padding: 2px !important;
        }
        .tabulator-row.tabulator-row-even {
            background-color: ${DARK1} !important;
        }
        .tabulator-row.tabulator-row-odd {
            background-color: ${DARK2} !important;
        }
        .tabulator-row.tabulator-selectable:hover {
            background-color: ${MY_BLACK} !important;
        }
        .tabulator .tabulator-header .tabulator-col input, .tabulator .tabulator-header .tabulator-col select {
            background-color: ${DARK2} !important;
        }
        .tabulator-row,.tabulator-cell {
            cursor: default !important;
        }
        .topline {
            display: flex; justify-content: center; align-items: center;
            background-color: ${DARK1} !important; padding: 4px 10px;
        }
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
        .tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-title {
            padding-right: 12px !important;
        }
    `;

    const WINDOW_NAME = 'awacs_popup';
    const FEATURES = 'scrollbars=no,resizable=no,status=no,location=no,toolbar=no,menubar=no,width=1200,height=800,left=200,top=50';

    // --- AWACS window (lazy init)
    let awacsWin = null;

    // --- AWACS ref point (lazy init)
    let refPoint = null;

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

    // simple helper, for shorter expressions
    function byId(ele) {
        return document.getElementById(ele);
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
        //const columnOp = isOn ? table.hideColumn : table.showColumn;
        filterOp(field, "!=", value);
        if (field === 'type') {
            if (value === Type.Colony) {
                isOn ? table.hideColumn("pop") : table.showColumn("pop");
                isOn ? table.hideColumn("size") : table.showColumn("size");
            }
            if (value === Type.Fleet) {
                isOn ? table.hideColumn("ships") : table.showColumn("ships");
                isOn ? table.hideColumn("tonnage") : table.showColumn("tonnage");
            }
        }
    }

    function _setButtonState(btn, state) {
        const isOn = btn.classList.contains("on");
        if (isOn === state) return;
        btn.click();
    }

    function _setupFilter(doc, table, elementId, field, value) {
        const btn = doc.getElementById(elementId);
        if (btn) {
            btn.addEventListener("click", (e) => {
                xlog(`EventListener for ${field} : ${value}`)
                e.preventDefault();
                e.stopPropagation();
                if (e.ctrlKey) {
                    xlog(`EventListener CTRL`)
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
                    xlog(`EventListener ON ` + btn.classList)
                    btn.classList.toggle("on");
                    _modifyFilter(table, field, value, btn.classList.contains("on"));
                }
                xlog(`EventListener DONE`)
            });
        }
    }

    function setupGlobalFilters(doc, table) {
        // global filter
        //table.addFilter("dist", "<", 1000);
        // filter by relation
        _setupFilter(doc, table, "cbFilterMe", "rel", Relation.MY);
        _setupFilter(doc, table, "cbFilterFriend", "rel", Relation.Friend);
        _setupFilter(doc, table, "cbFilterNeutral", "rel", Relation.Neutral);
        _setupFilter(doc, table, "cbFilterEnemy", "rel", Relation.Enemy);
        // filter by type
        _setupFilter(doc, table, "cbFilterColony", "type", Type.Colony);
        _setupFilter(doc, table, "cbFilterFleet", "type", Type.Fleet);
        _setupFilter(doc, table, "cbFilterRP", "type", Type.RP);
        _setupFilter(doc, table, "cbFilterWH", "type", Type.WH);
    }

    async function setReferencePoint() {
        let val = awacsWin.prompt("Input global coordinates as reference point", "");
        if (val === null) return; // cancel was pressed
        refPoint = (([x, y, z]) => ({x, y, z}))(val.split(/[,\s]+/).map(Number));
        refPoint.name = "(custom)";
        refPoint.fid = null;
        await resetAwacsWindowInPlace();
    }

    async function buildTabulatorInPopup({title, data, columns, options = {}}) {
        // check for window already open
        const refPointStr = `<b>${refPoint.name}</b> (${refPoint.x},${refPoint.y},${refPoint.z})`;
        awacsWin.document.write(`
            <div id="awacsHead" class="topline tabulator">
                <span class="toplineleft cfyellow" title="Reference point for distance & elevations">${refPointStr}&nbsp;
                    <span class="icon-btn" id="awacsRefEdit" title="Set new reference point">${ICON.Edit}</span>
                </span>
                <span id="filtersRel">
                    <button class="tg cfyellow" id="cbFilterMe" title="Hide my own; use CTRL to show only my own">M</button>
                    <button class="tg cfgreen" id="cbFilterFriend" title="Hide friends; use CTRL to show only friends">F</button>
                    <button class="tg cfgray" id="cbFilterNeutral" title="Hide neutrals; use CTRL to show only neutrals">N</button>
                    <button class="tg cfred" id="cbFilterEnemy" title="Hide enemies; use CTRL to show only enemies">E</button>
                </span>
                <span id="filtersType">&nbsp;&nbsp;&nbsp;
                    <button class="tg" id="cbFilterColony" title="Hide colonies; use CTRL to show only colonies">${ICON.Colony}</button>
                    <button class="tg" id="cbFilterFleet" title="Hide fleets; use CTRL to show only fleets">${ICON.Fleet}</button>
                    <button class="tg" id="cbFilterRP" title="Hide rally points; use CTRL to show only rally points">${ICON.RP}</button>
                    <button class="tg" id="cbFilterWH" title="Hide wormholes; use CTRL to show only wormholes">${ICON.WH}</button>
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
    }

    function _fixUndefined(obj) {  // share this functions !!!
        for (let key in obj) {
            if (obj[key] == null || Number.isNaN(obj[key])) {
                delete obj[key];
            }
        }
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

    function _getTargetFleetUrlParams(o) {
        // example: tpos=colony&tsystem=123&x=3949&y=-1&z=-1
        const s = o.system ?? -1;
        if (o.colony) return `tpos=colony&tsystem=${s}&x=${o.colony}&y=-1&z=-1`;
        if (o.world) return `tpos=world&tsystem=${s}&x=${o.world}&y=-1&z=-1`;
        if (o.x === null) return null;
        if (o.system) return `tpos=system&tsystem=${s}&x=${o.x}&y=${o.y}&z=${o.z}`;
        return `tpos=global&x=${o.x}&y=${o.y}&z=${o.z}`;
    }

    function _computeLaunchLink(objType, obj) {
        if (!refPoint.fid) return null;
        if (!obj.id) return null;
        const isControlled = obj.relation === Relation.MY || obj.player === "(CONFED)";
        if (objType === Type.Colony) {
            if (isControlled) return `/fleet.php?tcolony=${obj.id}&fleet=${refPoint.fid}`;
            if (obj.world) return `/fleet.php?tworld=${obj.world}&fleet=${refPoint.fid}`;
            if (obj.system) return `/fleet.php?tsystem=${obj.system}&fleet=${refPoint.fid}`;
            return null;
        }
        if (objType === Type.Fleet) {
            const p = _getTargetFleetUrlParams(obj);
            return p ? `/fleet.php?${p}&tfleet=${obj.id}&fleet=${refPoint.fid}` : null;
        }
        if (objType === Type.RP || objType === Type.WH) {
            return `/fleet.php?x=${obj.x}&y=${obj.y}&z=${obj.z}&tpos=global&fleet=${refPoint.fid}`;
        }
        return null;
    }

    function _fillFrom(objType, icon, o) {
        const havePosition = o.x != null;
        const [horiz, vert] = havePosition ? absElevations(refPoint, o) : [null, null];
        const rec = {
            id: o.id,
            sig: o.signature,
            icon: icon,
            type: objType,
            subtype: o.type,
            name: o.name,
            navigate: _computeNavigateLink(objType, o),
            launch: _computeLaunchLink(objType, o),
            player: o.player,
            faction: o.faction,
            rel: o.relation ?? 'n',
            relColor: REL_COLOR[o.relation] ?? "white",
            ships: o.ships,
            tonnage: o.tonnage,
            roster: o.roster,
            pop: o.population,
            size: o.size,
            position: havePosition ? `${o.x},${o.y},${o.z}` : null,
            location: o.location,
            x: o.x,
            y: o.y,
            z: o.z,
            system: o.system,
            world: o.world,
            colony: o.colony,
            dist: havePosition ? Math.round((absDistance(refPoint, o)) / 10_000) / 100 : null,
            horiz: havePosition ? `${horiz}'` : null,
            vert: havePosition ? `${vert}º` : null,
            ts: o.ts,
        };
        //_fixUndefined(rec);
        return rec;
    }

    async function addAllColonies(data) {
        await db.colony.each(c => {
            data.push(_fillFrom(Type.Colony, ICON.Colony, c));
        });
    }

    async function addAllFleets(data) {
        await db.fleet.each(f => {
            data.push(_fillFrom(Type.Fleet, ICON.Fleet, f));
        });
    }

    async function addAllWormholes(data) {
        await db.wh.each(f => {
            data.push(_fillFrom(Type.WH, ICON.WH, f));
        });
    }

    async function addAllRallyPoints(data) {
        await db.rp.each(f => {
            data.push(_fillFrom(Type.RP, ICON.RP, f));
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
        if (absMinutes <= 180) return MY_GRAY;
        if (absMinutes <= 1440) return MY_ORANGE;
        if (absMinutes <= 7 * 1440) return MY_RED;
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
            const row = cell.getRow().getData();
            return `${_u("System", row.system)}<br>${_u("World", row.world)}<br>${_u("Location", row.location)}`;
        },
        DIR: function (e, cell, _onRendered) {
            const row = cell.getRow().getData();
            return `${_u("Vertical elevation", row.vert)}`;
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
        FIXED2: function (cell) {
            return cell.getValue()?.toFixed(2);
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
        REF_COLOR: function (cell, formatterParams, onRendered) {
            const r = cell.getRow().getData();
            onRendered(function () {
                cell.getElement().style.setProperty("color", r.relColor, "important");
            });
            return cell.getValue();
        },
        TYPE: function (cell, _formatterParams, _onRendered) {
            const subtype = cell.getRow().getData().subtype;
            return subtype ? `${cell.getValue()} (${subtype})` : cell.getValue();
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
            if (r.navigate && r.rel === Relation.MY) {
                const tooltip = `Open screen for '${r.name}'`;
                return `${cell.getRow().getData().icon} <a href="${r.navigate}" target="maingame" title="${tooltip}">${cell.getValue()}</a>`;
            } else {
                return `${cell.getRow().getData().icon} ${cell.getValue()}`;
            }
        },
        NAV: function (cell, _formatterParams, _onRendered) {
            const r = cell.getRow().getData();
            if (!r.navigate) return null;
            const tooltip = `Open screen for '${r.name}'`;
            return `<a href="${r.navigate}" class="icon" target="maingame" title="${tooltip}">${ICON.Navigate}</a>`;
        },
        REF: function (cell, _formatterParams, _onRendered) {
            const r = cell.getRow().getData();
            if (r.x === null) return null;
            const tooltip = `Set '${r.name}' as Reference point`;
            return `<span class="icon-btn" title="${tooltip}">${ICON.Reference}</span>`;
        },
        LNC: function (cell, _formatterParams, _onRendered) {
            const r = cell.getRow().getData();
            if (!r.launch) return null;
            const tooltip = `Launch '${refPoint.name}' toward '${r.name}'`;
            return `<a href="${r.launch}" class="icon" target="maingame" title="${tooltip}">${ICON.Launch}</a>`;
        },
    }

    async function resetAwacsWindowInPlace() {
        awacsWin.location.replace("about:blank");
        await initializeAwacsWindow(true);
    }

    const CLCK = {
        REF: async function (e, cell) {
            const r = cell.getRow().getData();
            if (r.x === null) return null;
            [refPoint.x, refPoint.y, refPoint.z] = [r.x, r.y, r.z];
            refPoint.name = r.name ?? "???";
            refPoint.fid = (r.type === Type.Fleet && (r.rel === Relation.MY || r.player === "(CONFED)")) ? r.id : null;
            await resetAwacsWindowInPlace();
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
            TYPE: "Record type - and subtype, if exists, like (L)ocation, (C)olony, (F)leet, (W)ormhole, (T)arget",
            REL: "Player relation; (m)e,(f)riend,(n)eutral,(e)nemy",
            ACT: "Action buttons",
            DIST: `Distance from ${refPoint.name}, in mkm`,
            DIR: `O’clock direction from ${refPoint.name}; relative vertical elevation (in degrees) is in tooltip`,
        };
        // collect/compute/process data
        const data = [];
        await addAllColonies(data);
        await addAllFleets(data);
        await addAllWormholes(data);
        await addAllRallyPoints(data);
        // setup columns
        const columns = [
            {title: "#", formatter: "rownum", width: 40, hozAlign: "center", headerSort: false},
            {title: "T", field: "type", width: 50, formatter: FMT.TYPE, headerTooltip: HTT.TYPE},
            {title: "ID", field: "id", headerFilter: true, formatter: FMT.ID},
            {title: "Name", field: "name", headerFilter: true, minWidth: 120, formatter: FMT.NAME},
            {title: "", field: "navigate", minWidth: 20, width: 20, headerSort: false, formatter: FMT.NAV, headerTooltip: HTT.ACT},
            {title: "", field: "launch", minWidth: 20, width: 20, headerSort: false, formatter: FMT.LNC, headerTooltip: HTT.ACT},
            {title: "Player", field: "player", headerFilter: true, minWidth: 70, formatter: FMT.REF_COLOR},
            {title: "Rel", field: "rel", headerFilter: true, width: 50, headerSort: false, formatter: FMT.REF_COLOR, headerTooltip: HTT.REL},
            {title: "Position", field: "position", headerFilter: true, minWidth: 140, hozAlign: "right", tooltip: TT.REL},
            {title: "Dist", field: "dist", hozAlign: "right", width: 70, sorter: "number", headerTooltip: HTT.DIST, formatter: FMT.FIXED2},
            {title: "Dir", field: "horiz", hozAlign: "right", headerFilter: true, width: 50, headerSort: false, headerTooltip: HTT.DIR, tooltip: TT.DIR},
            {title: "", field: "ref", minWidth: 20, width: 20, headerSort: false, formatter: FMT.REF, headerTooltip: HTT.ACT, cellClick: CLCK.REF},
            {title: "Pop", field: "pop", hozAlign: "right", width: 70, sorter: "number",},
            {title: "Size", field: "size", hozAlign: "right", width: 70, sorter: "number",},
            {title: "Ships", field: "ships", hozAlign: "right", width: 70, sorter: "number", tooltip: TT.SIZE,},
            {title: "Tons", field: "tonnage", hozAlign: "right", width: 70, sorter: "number",},
            {title: "Updated", field: "ts", headerSort: false, formatter: FMT.TS, tooltip: TT.UPDATED,}
        ];
        try {
            await buildTabulatorInPopup({
                title: `AtmoBurn-AWACS: ${refPoint.name}`,
                data, columns
            });
        } catch (err) {
            xerror(err);
            alert("Could not build Tabulator in popup (see console).");
        }
    }

    async function showStuff() {
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
            await initializeAwacsWindow()
        }
    }

    function createMenu(topmenu) {
        // create menu item
        const e = document.createElement("li");
        e.id = "AWACSMenu";
        e.innerHTML = `<a href="#" class="hide_mobile hide_small menu_title" id="awacsMenuTitle">[AWACS]</a>`;
        topmenu.append(e);
        // append click listener(s)
        byId("awacsMenuTitle").addEventListener('click', showStuff);
    }

    (async () => {
        const topmenu = byId("topmenu");
        if (topmenu) {
            createMenu(topmenu);
        }
    })();

})();
