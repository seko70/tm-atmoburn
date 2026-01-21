// ==UserScript==
// @name         AtmoBurn Services - Archivist
// @namespace    sk.seko
// @license      MIT
// @version      0.9.2
// @description  Parses and stores various entities while browsing AtmoBurn; see Tampermonkey menu for some actions; see abs-awacs for in-game UI
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-archivist/abs-archivist.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-archivist/abs-archivist.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-archivist/README.md
// @match      	 https://*.atmoburn.com/overview.php?view=2
// @match        https://*.atmoburn.com/fleet.php?*
// @match        https://*.atmoburn.com/fleet/*
// @match        https://*.atmoburn.com/view_colony.php*
// @match        https://*.atmoburn.com/known_universe.php*
// @match        https://*.atmoburn.com/extras/scan.php?*
// @match        https://*.atmoburn.com/extras/fleet_refuel_info.php?*
// @match        https://*.atmoburn.com/rally_points.php*
// @match        https://*.atmoburn.com/sensor_net.php*
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/abs-utils/v1.1.0/commons/abs-utils.js
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/atmoburn-service-db/v1.0.2/commons/atmoburn-service-db.js
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// ==/UserScript==

/* jshint esversion: 11 */
/* jshint node: true */

// @ts-check
// <reference types="dexie" />

const DEBUG = true;

(function () {
    'use strict';

    // refpoint; exported for use in other scripts as well
    unsafeWindow.refPoint = {x: 0, y: 0, z: 0, name: "Center-of-the-Universe"};

    // --- Dexie DB
    const db = window.sharedDB;

    const ENTITY_DEFS = { // allowed properties
        system: ['id', 'name', 'x', 'y', 'z', 'galaxy'],
        world: ['id', 'name', 'system', 'x', 'y', 'z'],
        colony: ['id', 'name', 'x', 'y', 'z', 'world', 'system', 'player', 'faction', 'relation', 'population', 'size', 'ts', 'src'],
        fleet: ['id', 'name', 'x', 'y', 'z', 'system', 'world', 'colony', 'player', 'faction', 'relation', 'signature', 'location', 'speed', 'ships', 'tonnage', 'roster', 'ts', 'src'],
        rp: ['id', 'name', 'x', 'y', 'z', 'relation', 'type', 'comment', 'ts', 'src'],
        wh: ['id', 'name', 'system', 'x', 'y', 'z', 'tsystem', 'tx', 'ty', 'tz', 'ts', 'src'],
        signature: ['id', 'name', 'x', 'y', 'z', 'system', 'world', 'colony', 'player', 'faction', 'relation', 'location', 'speed', 'ships', 'tonnage', 'roster', 'ts', 'src'],
        relation: ['id', 'relation', 'ts', 'src'],
    };

    const STATIC_DATA = ['world', 'system', 'wh', 'rp']; // these data are not changed during the game

    const Relation = {
        MY: 'm',
        Friend: 'f',
        Neutral: 'n',
        Enemy: 'e',
    };

    const ScannerRelationMap = {
        'Friend': Relation.Friend,
        'No contact': Relation.Neutral,
        'Peace': Relation.Neutral,
    }

    // --- Various helpers

    // regex pattern to match and capture x,y,z coordinates (plain text)
    const XYZ_REGEX = /^\s*(-*\d+)[,\s]+(-*\d+)[,\s]+(-*\d+)/;
    // regex pattern to match and capture x,y,z coordinates (URL)
    const XYZ_URL_REGEX = /\\?x=(-?\d+)&y=(-?\d+)&z=(-?\d+)/;
    // current date
    const now = Date.now();
    // player name (current, lazy initialized
    let playerName = null;

    // just log the message to console, with script name as a prefix
    function xdebug(msg, ...data) {
        if (!DEBUG) return;
        console.debug('ARCH', msg, ...data);
    }

    // just log the message to console, with script name as a prefix
    function xlog(...args) {
        console.info('ARCH', ...args);
    }

    // same as xlog, but as a warning
    function xerror(msg, ...err) {
        console.warn('ARCH', msg, ...err);
    }

    // simple helper, for shorter expressions
    function byId(ele) {
        return document.getElementById(ele);
    }

    function lastElement(array) {
        return array && array.length > 0 ? array[array.length - 1] : null;
    }

    // functor, catches and logs/notifies the error, so it's not lost in async hell...
    function safeAsync(fn) {
        return (...args) => {
            fn(...args).catch(err => {
                notify('Async error', err);
            });
        };
    }

    function copyXYZ(dest, src) {
        if (src && dest) {
            [dest.x, dest.y, dest.z] = [src.x, src.y, src.z];
            return true;
        }
        return false;
    }

    // copy object attributes from 'src' to 'dest'; ignore null attributes; attribute map defined by two lists
    function safeCopy(dest, destAttrs, src, srcAttrs = null) {
        srcAttrs = srcAttrs || destAttrs;
        assert(dest && destAttrs && destAttrs.length === srcAttrs.length);
        if (src) {
            for (let i = 0; i < srcAttrs.length; i++) {
                if (src[srcAttrs[i]] != null) {
                    dest[destAttrs[i]] = src[srcAttrs[i]];
                }
            }
            return true;
        }
        return false;
    }

    function notify(text, err) {
        err ? xerror(text, err) : xlog(text); // log it anyway, first
        try {
            GM_notification({title: 'ARCH', text: err ? `${text}: ${err}` : text, timeout: 5000});
        } catch {
            // do nothing
        }
    }

    function setRefPoint(obj, fid = null, name = null) {
        const r = unsafeWindow.refPoint;
        if (obj) {
            copyXYZ(r, obj);
            r.name = name ? name : obj.name;
            r.fid = fid;
        } else {
            [r.x, r.y, r.z, r.name, r.fid] = [0, 0, 0, name ? name : "Center-Of-The-Universe", fid];
        }
    }

    // --- IndexedDB helpers -------------------------------------------------------

    // select only "registerd" attributes, return sanitized object
    function sanitize(type, data) {
        const allowed = ENTITY_DEFS[type];
        assert(allowed, `Unknown entity type: "${type}"`);
        const out = {};
        for (const k of allowed) {
            if (k in data) out[k] = data[k];
        }
        if (!('id' in out) || out.id === undefined || out.id === null || String(out.id).trim() === '') {
            throw new Error(`[${type}] 'id' is required`);
        }
        return out;
    }

    // returns true only if new data are changed (ignores attributes not present in new data)
    function isShallowEqualForUpdate(type, oldData, newData) {
        const ks = ENTITY_DEFS[type];
        for (const k of ks) {
            if (newData[k] != null && !Object.is(oldData[k], newData[k]))
                return false; // handles NaN correctly
        }
        return true;
    }

    async function update(type, data) { // same as 'create', but updates data if data.id already exists
        const tbl = db.table(type);
        const obj = sanitize(type, data);
        const exists = await tbl.get(obj.id);
        if (exists) {
            if (STATIC_DATA.includes(type) && isShallowEqualForUpdate(type, exists, obj)) {
                //xdebug(`Identical data, no update needed: ${type}#${data.id}`, exists, obj);
                return false;
            }
            await tbl.update(obj.id, obj);
        } else {
            await tbl.put(obj);
        }
        xdebug(`Object "${type}" updated`, obj);
        return true;
    }

    async function bulkUpdate(type, items) { // same as 'update', but for array of objects
        let count = 0;
        // FIXME this is not optimal, but for now ...
        for (const item of items) {
            if (await update(type, item)) count += 1;
        }
        return count;
    }

    async function save(type, data) { // same as 'create', but replaces data if data.id already exists
        const tbl = db.table(type);
        const obj = sanitize(type, data);
        await tbl.put(obj);
        xdebug(`Object "${type}" saved`, obj);
        return true;
    }

    async function bulkSave(type, items) { // same as 'save', but for array of objects
        const tbl = db.table(type);
        const sanitized = items.map((data, idx) => {
            return sanitize(type, data);
        });
        await tbl.bulkPut(sanitized);
        xdebug(`Objects "${type}" bulk-saved (${sanitized.length})`, sanitized);
        return sanitized.length;
    }

    function updateColonyFromObject(id, c, obj) {
        c.id = id;
        c.ts = now;
        safeCopy(c, ['name', 'world', 'system', 'x', 'y', 'z'], obj, ['colonyName', 'world', 'system', 'x', 'y', 'z']);
        assert(c.name);
        assert(c.world);
        return c;
    }

    function updateWorldFromObject(id, w, obj) {
        w.id = id;
        safeCopy(w, ['name', 'system', 'x', 'y', 'z'], obj, ['worldName', 'system', 'x', 'y', 'z']);
        assert(w.system);
        return w;
    }

    function updateSystemFromObject(id, s, obj) {
        s.id = id;
        safeCopy(s, ['name', 'x', 'y', 'z'], obj, ['systemdName', 'x', 'y', 'z']);
        return s;
    }

    async function deleteMissingColonies(colonyList, worldId) { // delete all colonies on world not on colonyList
        assert(!!worldId);
        const keepIds = new Set(colonyList.map(obj => obj.id));
        const idsToDelete = await db.colony.where('world').equals(worldId).filter(x => !keepIds.has(x.id)).primaryKeys();
        xdebug('idsToDelete', idsToDelete);
        if (!idsToDelete || idsToDelete.length <= 0)
            return 0;
        xdebug('deleting colonies', idsToDelete);
        await db.colony.bulkDelete(idsToDelete);
        xlog('Deleted colonies at w#', worldId, idsToDelete);
        return idsToDelete.length;
    }

    async function findColonyByName(name) {
        return db.colony.where('name').equals(name).first();
    }

    async function deleteMissingFleets(myFleetList) { // delete all my fleets not on the list
        const keepIds = new Set(myFleetList.map(obj => obj.id));
        const idsToDelete = await db.fleet.where('relation').equals(Relation.MY).filter(f => !keepIds.has(f.id)).primaryKeys();
        if (!idsToDelete || idsToDelete.length <= 0)
            return 0;
        //xdebug('deleteing fleets', idsToDelete);
        await db.fleet.bulkDelete(idsToDelete);
        xlog('Deleted my fleets', idsToDelete);
        return idsToDelete.length;
    }

    async function deleteMissingRPs(myRPList, empiredb) { // delete all rally points not on the list
        const keepIds = new Set(myRPList.map(obj => obj.id));
        const prefixToDelete = `#${empiredb}.`
        const idsToDelete = await db.rp.filter(r => r.id.startsWith(prefixToDelete) && !keepIds.has(r.id)).primaryKeys();
        if (!idsToDelete || idsToDelete.length <= 0)
            return 0;
        //xdebug('deleting RPs', idsToDelete);
        await db.rp.bulkDelete(idsToDelete);
        xlog('Deleted RP', idsToDelete);
        return idsToDelete.length;
    }

    async function enrichFleetLocation(f) {
        if (f.x) {
            return true; // already enriched
        }
        if (f.colony) { // translate colony ID to system ID
            const colony = await db.colony.get(f.colony);
            if (colony) return safeCopy(f, ['world', 'system', 'x', 'y', 'z'], colony);
        }
        if (f.world) { // translate world ID to system ID
            const world = await fetchWorldInfo(f.world);
            if (world) return safeCopy(f, ['system', 'x', 'y', 'z'], world);
        }
        if (f.system) { // translate system ID to global coordinates
            const system = await fetchSystemInfo(f.system);
            if (system) return copyXYZ(f, system);
        }
        return false;
    }


    // --- Local Storage Helper -----------------------------------------------------

    const StoredTimestamps = {
        Fleets: 'fleets',
        WormholesMy: 'wh.my',
        WormholesEmpire: 'wh.empire',
        RallyPointsMy: 'rp.my',
        RallyPointsEmpire: 'rp.empire',
        SensorNetMy: 'sn.my',
        SensorNetEmpire: 'sn.empire',
    };

    function storeTimestamp(name, dateValue) {
        localStorage.setItem(`abs.arch.ts.${name}`, dateValue);
    }

    // --- AtmoBurn API Helpers -----------------------------------------------------

    const WF_BASE_URL = `https://${window.location.host}`;

    async function fetchSystemInfo(sid) {
        //xdebug(`fetchSystemInfo(id=${sid})`);
        let s = await db.system.get(sid);
        if (s) return s;
        const url = `${WF_BASE_URL}/API/?c=system&ID=${sid}`;
        const response = await fetch(url);
        xdebug(`fetchSystemInfo(id=${sid}) fetch response`, response);
        assert(response.ok, `Error fetchnig ${url}, status: ${response.status}`);
        s = await response.json();
        if (!s) {
            xdebug(`fetchSystemInfo(id=${sid}) - no data; unexplored or empire explored?`);
            return null;
        }
        s = {id: s.ID, name: s.name, x: s.x, y: s.y, z: s.z, galaxy: s.galaxy};
        await save('system', s);
        //xdebug('fetchSystemInfo: system stored', s)
        return s;
    }

    async function fetchWorldInfo(wid) {
        //xdebug(`fetchWorldInfo(id=${wid})`);
        let w = await db.world.get(wid);
        if (w) return w;
        const url = `${WF_BASE_URL}/API/?c=world&ID=${wid}`;
        const response = await fetch(url);
        xdebug(`fetchWorldInfo(id=${wid}) fetch response`, response);
        assert(response.ok, `Error fetchnig ${url}, status: ${response.status}`);
        w = await response.json();
        if (!w) {
            xdebug(`fetchWorldInfo(id=${wid}) - no data; unexplored or empire explored?`);
            return null;
        }
        const s = await fetchSystemInfo(w.system);
        w = {id: w.ID, name: w.name, system: w.system, x: s.x, y: s.y, z: s.z};
        await save('world', w);
        //xdebug('fetchWorldInfo: world stored', w)
        return w;
    }


    // === Parser ====

    const PureParser = {
        // Parse some colony metadata from (current) screen; we assume it is "my" colony; returns colony:
        // {id,name,player,relation,world,worldName,system,systemName,population,size}
        parseColonyScreen: function () {
            // parse colony ID from URL
            const cid = Parsing.parseColonyIdFromURL();
            if (!cid) return; // No colony ID in page URL = no parsing
            // retrieve colony info or create new one
            let colony = {id: cid, relation: Relation.MY, player: Parsing.parsePlayerName(), ts: now, src: 'c'};
            // parse colony system and world info
            const mid = byId('midcolumn');
            const subtitleElement = mid?.querySelector('div.subtitle');
            // sanity check
            if (!subtitleElement) {
                xlog(`Can't parse colony #${cid} - no subtitle - not a colony, or we have no access?`);
                return;
            }
            const systemLink = subtitleElement.querySelector('a[onclick*="showSystem"]');
            Parsing.parseSystemInfoFromLink(systemLink, colony, 'system', 'systemName');
            assert(colony.system, `No system determined for colony #${cid}`);
            const worldLink = subtitleElement.querySelector('a[onclick*="showPlanet"]');
            Parsing.parseWorldInfoFromLink(worldLink, colony, 'world', 'worldName');
            assert(colony.world, `No world determined for colony #${cid}`);
            // parse colony name
            colony.name = Parsing.textContent(
                mid.querySelector('.pagetitle > div.flex_center') ?? mid.querySelector('.pagetitle')
            );
            assert(colony.name, `No name found for colony #${cid}`);
            // pop and size
            const colonydropdown = mid.querySelectorAll('div.colonydropdown')
            colony.population = safeInteger(Parsing.getTextAfterPrefix(colonydropdown, 'Population:'));
            colony.size = safeFloat(Parsing.getTextAfterPrefix(colonydropdown, 'Size:'));
            return colony;
        },
        // Parse colony list form "Colonies" menu; returns list of {id,name,style}
        parseColonyList: function () {
            const colonylist = byId("colonylist");
            if (!colonylist) return null;
            const colonies = [];
            colonylist.querySelectorAll('a[href*="/view_colony.php?colony="]')?.forEach((node) => {
                const c = {};
                const parsedOK = Parsing.parseColonyInfoFromLink(node, c, 'id', 'name');
                assert(parsedOK, `Can't parse colony id/name from colony list node ${node?.outerHTML}`);
                c.style = node.getAttribute("style");
                colonies.push(c);
            });
            assert(colonies.length > 0, "No colonies in colony list?");
            xdebug("Colony list parsed OK", colonies);
            return colonies;
        },
        // Parse fleet list form "Fleets" menu; returns list of {id,name,style}
        parseFleetList: function () {
            const fleetlist = byId("fleetlist");
            if (!fleetlist) return null;
            const fleets = [];
            fleetlist.querySelectorAll('a[href*="/fleet.php?fleet="]')?.forEach((node) => {
                const f = {};
                const parsedOK = Parsing.parseFleetInfoFromLink(node, f, 'id', 'name');
                assert(parsedOK, `Can't parse fleet id/name from colony list node ${node?.outerHTML}`);
                f.style = node.getAttribute("style");
                fleets.push(f);
            });
            assert(fleets.length > 0, "No fleets in fleet list?");
            xdebug("Fleet list parsed OK", fleets);
            return fleets;
        },
    }


    // --- Parse helpers -----------------------------------------------------------

    const Parsing = {
        textContent: function (e) {
            return e?.textContent?.trim();
        },
        parseXYZ: function (s, obj = null) {
            const m = s.match(XYZ_REGEX);
            if (!m) return null;
            obj = obj || {};
            [obj.x, obj.y, obj.z] = [Number(m[1]), Number(m[2]), Number(m[3])];
        },
        parseNumberFromURL: function (pattern) {
            const m = document.URL.match(pattern);
            return (m && m[1]) ? Number(m[1]) : null;
        },
        getElementsByExactText: function (elements, text) {
            return elements ? Array.from(elements).filter(e => Parsing.textContent(e) === text) : null;
        },
        getElementsByPrefixText: function (elements, text) {
            return elements ? Array.from(elements).filter(e => Parsing.textContent(e).startsWith(text)) : null;
        },
        getTextAfterPrefix: function (elements, prefix) {
            if (!elements) return null;
            const e = Parsing.getElementsByPrefixText(elements, prefix)[0] ?? null;
            return Parsing.textContent(e)?.match(new RegExp(`${prefix}\\s*(.*)`))[1] ?? null
        },
        parseFleetCoordinates: function (navData, fleet) {
            const rightData = navData.querySelector('div#positionRight > div > a');
            if (rightData && rightData.textContent) {
                Parsing.parseXYZ(rightData.textContent, fleet);
            }
            assert(fleet.x != null, 'No fleet global coordinates?');
            return fleet;
        },
        parseInfoFromLink: function (link, pattern, obj, idAttr, nameAttr) {
            // link example: <a href="/view_colony.php?colony=123&fleet=456">Seko Prime</a>
            // pattern example: /colony=(\d+)/
            if (!link) return false;
            const m = (link.href || link.getAttribute('onClick'))?.match(pattern);
            if (!m) return false;
            if (idAttr) obj[idAttr] = Number(m[1]);
            if (nameAttr) obj[nameAttr] = Parsing.textContent(link);
            return true;
        },
        parseFleetInfoFromLink: function (link, obj, idAttr, nameAttr) {
            return Parsing.parseInfoFromLink(link, /fleet=(\d+)/, obj, idAttr, nameAttr);
        },
        parseColonyInfoFromLink: function (link, obj, idAttr, nameAttr) {
            return Parsing.parseInfoFromLink(link, /colony=(\d+)/, obj, idAttr, nameAttr);
        },
        parseWorldInfoFromLink: function (link, obj, idAttr, nameAttr) {
            return Parsing.parseInfoFromLink(link, /showPlanet\((\d+)/, obj, idAttr, nameAttr);
        },
        parseSystemInfoFromLink: function (link, obj, idAttr, nameAttr) {
            return Parsing.parseInfoFromLink(link, /showSystem\((\d+)/, obj, idAttr, nameAttr);
        },
        parseGlobalInfoFromLink: function (link, obj, xAttr, yAttr, zAttr) {
            if (!link) return false;
            const m = (link.href || link.getAttribute('onClick'))?.match(XYZ_URL_REGEX);
            if (!m) return false;
            [obj[xAttr], obj[yAttr], obj[zAttr]] = [Number(m[1]), Number(m[2]), Number(m[3])];
            return true;
        },
        parseFleetIdFromURL: function () {
            return Parsing.parseNumberFromURL(/(?:[?&]fleet=|\/fleet\/)(\d+)/);
        },
        parseColonyIdFromURL: function () {
            return Parsing.parseNumberFromURL(/[?&]colony=(\d+)/);
        },
        parsePlayerName: function () {
            if (playerName) return playerName; // simple cache
            playerName = Parsing.textContent(parent.document.querySelector('#menu_wrap span.menu_playername'));
            return playerName;
        },
        fixRelation: function (obj) {
            // string to relation code
            if (obj.relation) {
                if (obj.relation in ScannerRelationMap) {
                    obj.relation = ScannerRelationMap[obj.relation];
                } else {
                    obj.relation = obj.relation.trim()[0].toLowerCase();
                }
            }
            // scan: own fleets/colonies are displayed as "friend"; fuel bunker: no relationship for colony
            if (obj.player === Parsing.parsePlayerName()) {
                obj.relation = Relation.MY;
            } else if (obj.player === 'Civil Goverment' || obj.player === 'Ghosts of the Past') {
                if (!obj.relation) obj.relation = Relation.Neutral;
            }
            if (!obj.player) {
                if (obj.relation === Relation.MY) obj.player = Parsing.parsePlayerName();
            }
        },
        fixUndefined: function (obj) {
            for (let key in obj) {
                if (obj[key] == null || Number.isNaN(obj[key])) {
                    delete obj[key];
                }
            }
        },
        sanitizeFleet: function (f) {
            Parsing.fixRelation(f);
            if (typeof f.speed != 'number') f.speed = safeInteger(f.speed);
            if (typeof f.ships != 'number') f.ships = safeInteger(f.ships);
            if (typeof f.tonnage != 'number') f.tonnage = safeFloat(f.tonnage);
            Parsing.fixUndefined(f);
        },
        sanitizeSignature: function (s) {
            Parsing.sanitizeFleet(s); // for now  it is the same as fleet (except "signature" an "id" fields)
        },
        sanitizeColony: function (c) {
            Parsing.fixRelation(c);
            Parsing.fixUndefined(c);
        },
        parseFleetLocationFromLink: function (f, locLink, refObj = null) {
            if (!f) return;
            if (locLink) { // parse info from link
                if (Parsing.parseColonyInfoFromLink(locLink, f, 'colony', 'location')) return;
                if (Parsing.parseWorldInfoFromLink(locLink, f, 'world', 'location')) return;
                if (Parsing.parseSystemInfoFromLink(locLink, f, 'system', 'location')) return;
                if (Parsing.parseGlobalInfoFromLink(locLink, f, 'x', 'y', 'z')) return;
                throw new Error(`Unknown location for fleet #${f.id}: ${locLink}`);
            } else if (refObj) {
                safeCopy(f, ['system', 'world', 'x', 'y', 'z', 'location'], refObj) // not a link, probably local object/colony
            }
        },
    }

    // --- Parsers -----------------------------------------------------------------

    async function parseKnownUniverse() {

        async function _parseWormhole(row, wormholes) {
            const divs = row.querySelectorAll(':scope > div');
            assert(divs && divs.length >= 3, 'Wormhole record unrecognized');
            // parse wormhole name
            const wh = {ts: now, src: 'ku'};
            wh.name = Parsing.textContent(divs[0]);
            // parse wormhole system
            Parsing.parseSystemInfoFromLink(divs[1], wh, 'system', null);
            const fromSystem = await fetchSystemInfo(wh.system);
            [wh.x, wh.y, wh.z] = [fromSystem.x, fromSystem.y, fromSystem.z];
            // parse wormhole target system
            Parsing.parseSystemInfoFromLink(divs[2], wh, 'tsystem', null);
            const toSystem = await fetchSystemInfo(wh.tsystem);
            [wh.tx, wh.ty, wh.tz] = [toSystem.x, toSystem.y, toSystem.z];
            // generate wormhole ID
            wh.id = `${wh.name.replace('Wormhole ', '')}.${wh.system}`;
            wormholes.push(wh);
        }

        const empiredb = !!document.URL.match(/empiredb=1/) ? 1 : 0
        // get all lines
        const mid = byId('midcolumn');
        const whAddLinks = mid.querySelectorAll('a[href^="/rally_points.php?add=add&type=wormhole"]');
        if (!whAddLinks || whAddLinks.length <= 0) return;
        // parse wormholes one by one
        const wormholeList = [];
        for (const link of whAddLinks) {
            await _parseWormhole(link.parentNode.parentNode, wormholeList);
        }
        // save (create or update) parsed items
        const saved = await bulkSave('wh', wormholeList);
        // note timestamp for this screen
        storeTimestamp(empiredb === 1 ? StoredTimestamps.WormholesEmpire : StoredTimestamps.WormholesMy, now)
        xlog(`Stored ${saved} wormholes`);
    }

    async function parseMyFleetsOverview() {

        async function _parseFleet(node, fleets) {
            const f = {
                id: parseInt(node.href.match(/fleet=(\d+)/)[1]),
                name: node.text.trim(),
                player: Parsing.parsePlayerName(),
                relation: Relation.MY,
                ts: now,
                src: 'fo',
            }
            const divs = node.parentNode.parentNode.querySelectorAll(':scope > div');
            f.ships = Parsing.textContent(divs[2]);
            f.tonnage = Parsing.textContent(divs[3]);
            const locLink = divs[6]?.querySelector('a');
            if (locLink) {
                Parsing.parseFleetLocationFromLink(f, locLink);
                if (await enrichFleetLocation(f)) {
                    f.ts = now;
                }
            }
            Parsing.sanitizeFleet(f);
            fleets.push(f);
        }

        // parse fleets (fleet ID and fleet name)
        const fleets = [];
        const fleetNodes = byId('fleetSort').querySelectorAll('a[href*="/fleet.php?fleet="]');
        if (fleetNodes) {
            for (const node of fleetNodes) {
                await _parseFleet(node, fleets);
            }
        }
        // save (create, update, delete) parsed items
        const saved = await bulkSave('fleet', fleets);
        const deleted = await deleteMissingFleets(fleets)
        // note timestamp for this screen
        storeTimestamp(StoredTimestamps.Fleets, now);
        xlog(`Stored/deleted fleets: ${saved}/${deleted}`);
    }

    async function parseFleetScreen() {
        // parse fleet ID from URL
        const fid = Parsing.parseFleetIdFromURL();
        if (!fid) return; // No fleet ID in page URL means there is no info to parse
        // retrieve fleet info or create new one
        let fleet = {id: fid, ts: now, relation: Relation.MY};
        // if fleet info is complete and recent, just quit
        if (fleet.x && !isOlderThan(fleet.ts, now, 30)) {
            setRefPoint(fleet, fid);
            xdebug(`parseFleetScreen: no recent changes for #${fid}`, new Date(fleet.ts));
            return;
        }
        // find navigation data panel
        const navData = parent.document.getElementById('navData');
        xdebug('navData1=' + navData);
        if (!navData) {
            xdebug('No navData, parsing skipped');
            return;
        }
        // parse fleet coordinates
        xdebug('navData2=' + navData);
        Parsing.parseFleetCoordinates(navData, fleet);
        // parse fleet location (colony, world, system) if present
        const leftData = navData.querySelector('div#positionLeft');
        leftData?.querySelectorAll('a[href]')?.forEach((link) => {
            if (Parsing.parseColonyInfoFromLink(link, fleet, 'colony', 'colonyName'))
                return;
            if (Parsing.parseWorldInfoFromLink(link, fleet, 'world', 'worldName'))
                return;
            Parsing.parseSystemInfoFromLink(link, fleet, 'system', 'systemName');
        });
        [fleet.location, fleet.ts, fleet.relation, fleet.src] = [fleet.colonyName || fleet.worldName || fleet.systemName, now, Relation.MY, 'f'];
        // fleet name
        const name = Parsing.textContent(parent.document.getElementById('pageHeadLine'));
        fleet.name = name && name.length > 0 ? name : '???';
        setRefPoint(fleet, fid);
        // check for confed/shared fleets
        const shared = Parsing.textContent(parent.document.getElementById('midcolumn').querySelector('div.subtext'));
        if (shared && shared === 'Shared empire access') {
            fleet.relation = Relation.Friend;
            fleet.player = '(CONFED)';
        }
        // sanitize fleet data
        Parsing.sanitizeFleet(fleet);
        // save fleet info (create or update)
        await save('fleet', fleet);
        xlog("Updated fleet", fleet);
        // cache colony, world and system coordinates - eventually
        if (fleet.colony) {
            Parsing.sanitizeColony(fleet.colony);
            await update('colony', updateColonyFromObject(fleet.colony, {}, fleet));
        }
        if (fleet.world) {
            await update('world', updateWorldFromObject(fleet.world, {}, fleet));
        }
        if (fleet.system) {
            await update('system', updateSystemFromObject(fleet.system, {}, fleet));
        }
    }

    async function parseColonyScreen() {
        const colony = PureParser.parseColonyScreen();
        if (!colony) return; // quit quietly - no colony info is available
        let c = await db.colony.get(colony.id);
        if (c && c.x != null) {
            [colony.x, colony.y, colony.z] = [c.x, c.y, c.z];
        } else {
            const w = await fetchWorldInfo(colony.world);
            assert(w, `Can't fetch world #${colony.world}`);
            [colony.x, colony.y, colony.z] = [w.x, w.y, w.z];
        }
        Parsing.sanitizeColony(colony);
        setRefPoint(colony);
        await save('colony', colony);
        xlog("Updated colony", colony);
    }

    async function parseScan() {

        function _parseColonyFromScan(clink, scanner, colonyList) {
            const c = {ts: now, src: 'sc'};
            const parsed = Parsing.parseInfoFromLink(clink, /tcolony=(\d+)/, c, 'id', 'name');
            assert(parsed, 'No colony info in link ' + clink.outerHTML);
            const row = clink.parentElement.parentElement;
            const cols = Array.from(row?.querySelectorAll(':scope > td'));
            c.player = Parsing.textContent(cols[1]); // player name
            c.faction = Parsing.textContent(cols[2]); // player faction
            c.relation = Parsing.textContent(cols[3]); // player relation
            c.population = safeInteger(Parsing.textContent(cols[4])); // colony population
            c.size = safeFloat(Parsing.textContent(cols[5])); // colony size
            // copy some attributes from scanning entity (colony or fleet)
            safeCopy(c, ['system', 'world', 'x', 'y', 'z'], scanner)
            // sanitize colony attributes
            Parsing.sanitizeColony(c);
            // parsed record to colony list
            assert(c.name, `No name for colony #${c.id}`);
            colonyList.push(c);
        }

        async function _parseFleetsFromScan(scanner) {
            const fleets = [];
            const fleetsTable = document.querySelectorAll('body > div > div > table')[0];
            if (!fleetsTable) return;
            const rows = Array.from(fleetsTable.querySelectorAll('tbody > tr'));
            let rownum = 3; // skip header rows etc
            while (rownum < rows.length) {
                // find first row of the fleet info
                const row1 = rows[rownum];
                const sig_text = Parsing.textContent(row1?.querySelector('td:first-of-type'));
                if (!sig_text || !sig_text.startsWith('Bogey EM Signature')) {
                    rownum += 1;
                    continue;
                }
                // first row found, set all up
                const row2 = rows[rownum + 1];
                const row3 = rows[rownum + 2];
                const row4 = rows[rownum + 3];
                rownum += 4;
                // first row = signature
                let f = {signature: sig_text.split(' ').pop(), ts: now, src: 'sc'};
                // second row
                const r2cols = Array.from(row2?.querySelectorAll(':scope > td'));
                const flink = r2cols[0].querySelector(':scope > a[href^="/fleet.php?"]');
                Parsing.parseInfoFromLink(flink, /tfleet=(\d+)/, f, 'id', 'name');
                f.faction = Parsing.textContent(r2cols[1]);
                //f.location = Parsing.textContent(r2cols[2]);
                const loclink = lastElement(r2cols[2].querySelectorAll("span.fakeLink"));
                Parsing.parseFleetLocationFromLink(f, loclink, scanner);
                f.speed = Parsing.textContent(r2cols[4]);
                // third row
                const r3cols = Array.from(row3?.querySelectorAll(':scope > td'));
                f.player = Parsing.textContent(r3cols[0]);
                f.relation = Parsing.textContent(r3cols[1]);
                f.ships = Parsing.textContent(r3cols[3]);
                f.tonnage = Parsing.textContent(r3cols[4]);
                // fourth row
                const r4cols = Array.from(row4?.querySelectorAll(':scope > td'));
                f.roster = Array.from(r4cols[0].querySelectorAll('div'))?.map(x => Parsing.textContent(x.textContent)).join(',');
                // add to fleets
                if (f.id && f.name) {
                    await enrichFleetLocation(f);
                    Parsing.sanitizeFleet(f);
                    fleets.push(f);
                } else {
                    xerror('Unabled to parse fleet id and/or name', f);
                }
            }
            // save (create or update) fleets
            xdebug(`fleets to update: ${JSON.stringify(fleets)}`);
            const savedFleets = await bulkUpdate('fleet', fleets);
            xdebug(`Scanned and stored ${savedFleets} fleets`);
        }

        async function _parseColoniesFromScan(scanner) {
            const colonies = [];
            const coloniesTable = document.querySelectorAll('body > div > div > table')[1];
            if (coloniesTable) {
                coloniesTable.querySelectorAll('tbody > tr')?.forEach((row) => {
                    const clink = row.querySelector('a[href*="/fleet.php"][href*="tcolony="]');
                    if (clink) {
                        _parseColonyFromScan(clink, scanner, colonies);
                    }
                });
            }
            // save (create or update) colonies, delete ones that do not exist anymore
            await bulkUpdate('colony', colonies);
            xlog('Updated colonies at w#', scanner.world, colonies);
            await deleteMissingColonies(colonies, scanner.world);
        }

        let obj = null;
        // find obj (colony or fleet) for it's global coordinates first
        let oid = Parsing.parseColonyIdFromURL()
        if (oid) { // scan from colony?
            obj = await db.colony.get(oid);
            assert(obj.relation === Relation.MY);
        }
        if (!oid) { // scan from fleet?
            oid = Parsing.parseFleetIdFromURL();
            if (oid) {
                obj = await db.fleet.get(oid);
                assert(obj.relation === Relation.MY || obj.relation === Relation.Friend);
            }
        }
        assert(oid, 'Not colony nor fleet screen?');
        assert(obj, `Colony or fleet #${oid} not registered, yet?`)
        assert(obj && obj.x, `No coordinates for colony or fleet #${oid}, yet?`)
        // parse colonies on scanner
        if (obj?.world) { // colonies are only on world level!
            await _parseColoniesFromScan(obj);
        }
        // parse fleets on scanner
        await _parseFleetsFromScan(obj);
    }

    async function parseFuelBunker() {

        async function _parseFuelBunkerColonies(row) {
            const clink = row.querySelector('a[href*="/fleet.php?fleet="][href*="&tcolony="]');
            if (clink) {
                // starting row - parse colony id and name out of link
                colony = {ts: now, src: 'fb'};
                const parsed = Parsing.parseInfoFromLink(clink, /tcolony=(\d+)/, colony, 'id', 'name');
                assert(parsed, 'No colony info in link ' + clink.outerHTML);
                assert(colony.id);
                const stored = await db.colony.get(colony.id);
                if (stored && stored.x && !isOlderThan(stored.ts, now, 24 * 3600)) {
                    colony = null;
                    return; // already known and recent - skip (and don't even "touch")
                }
                // parse world
                const wlink = row.querySelector('a[href*="/fleet.php"][href*="tworld="]');
                assert(wlink);
                colony.world = parseInt(wlink.href.match(/tworld=(\d+)/)[1]);
                // parse system
                const slink = row.querySelector('a[href*="/fleet.php"][href*="tsystem="]');
                assert(slink);
                colony.system = parseInt(slink.href.match(/tsystem=(\d+)/)[1]);
            } else if (colony) {
                // second row - append info to record
                const plink = row.querySelector('a[href*="/message.php?player="]');
                assert(plink);
                colony.player = Parsing.textContent(plink); // add player info
                const s = await fetchSystemInfo(colony.system);
                copyXYZ(colony, s);
                Parsing.sanitizeColony(colony);
                await update('colony', colony);
                xlog("Updated colony", colony)
                colony = null;
            }
        }

        let colony = null;
        const rows = document.querySelectorAll("body > div > div > div > table > tbody > tr");
        if (rows) {
            for (const row of rows) {
                try {
                    await _parseFuelBunkerColonies(row);
                } catch (e) {
                    notify('ARCH - parseFuelBunker', e.message);
                    colony = null;
                }
            }
        }
    }

    async function parseRallyPoints() {
        const empiredb = !!document.URL.match(/empiredb=1/) ? 1 : 0;
        // parse lines with RP info
        const rpList = [];
        byId("midcolumn").querySelectorAll("tr > td > span.fakeLink:nth-child(1)")?.forEach((node) => {
            const m = node.getAttribute("onclick").match(XYZ_URL_REGEX);
            if (!m) return;
            const columns = node.parentNode.parentNode.querySelectorAll("td");
            const titles = columns[0].querySelector("span").title.trim().split(/\s+/);
            const rawId = columns[6].querySelector('a[href*="edit="]')?.href.match(/edit=(\d+)/)[1];
            const comment = Parsing.textContent(columns[5]);
            const rp = {
                id: `#${empiredb}.${rawId}`,
                name: Parsing.textContent(node),
                x: parseInt(m[1]),
                y: parseInt(m[2]),
                z: parseInt(m[3]),
                relation: titles[0][0].toLowerCase(),
                type: titles[1][0].toUpperCase(),
                comment: comment && comment.length ? comment : null,
                ts: now,
                src: `rp.${empiredb}`,
            };
            Parsing.fixUndefined(rp);
            rpList.push(rp);
        });
        // save (create, update, delete) parsed items
        const saved = await bulkSave('rp', rpList);
        const deleted = await deleteMissingRPs(rpList, empiredb)
        storeTimestamp(empiredb === 1 ? StoredTimestamps.RallyPointsEmpire : StoredTimestamps.RallyPointsMy, now);
        xlog(`Stored/deleted RPs: ${saved}/${deleted}`);
    }

    async function parseSensorNet() {
        const empiredb = !!document.URL.match(/empiredb=1/) ? 1 : 0;

        async function _parseSensorRecord(node, signatures) {
            const divs = node.querySelectorAll(':scope > div');
            // first row
            const divs0 = divs[0].querySelectorAll(':scope > div');
            const sig = {src: `sn.${empiredb}`, id: lastWordOf(Parsing.textContent(divs0[0]))};
            assert(sig.id);
            sig.ts = parseInt(divs0[1].getAttribute("gametime")) * 1000;
            // second row
            const divs1 = divs[1].querySelectorAll(':scope > div');
            const divs10 = divs1[0].querySelectorAll(':scope > div');
            sig.name = Parsing.textContent(divs10[0].querySelectorAll(':scope > div')[1]);
            sig.player = Parsing.textContent(divs10[1].querySelectorAll(':scope > div')[1]);
            sig.faction = Parsing.textContent(divs10[2].querySelectorAll(':scope > div')[1]);
            sig.relation = Parsing.textContent(divs10[3].querySelectorAll(':scope > div')[1]);
            // third row
            const divs11 = divs1[1].querySelectorAll(':scope > div');
            const divs110 = divs11[0].querySelectorAll(':scope > div');
            sig.ships = Parsing.textContent(divs110[0].querySelectorAll(':scope > div')[1]);
            sig.tonnage = Parsing.textContent(divs110[1].querySelectorAll(':scope > div')[1]);
            sig.speed = firstWordOf(Parsing.textContent(divs110[3].querySelectorAll(':scope > div')[1]));
            const divs111 = divs11[1].querySelectorAll(':scope > div');
            const loclink = lastElement(divs111[0].querySelectorAll("span.fakeLink")) ?? Parsing.textContent(lastElement(divs111[0].querySelectorAll("div")));
            // fourth row
            sig.roster = Array.from(divs[2].querySelectorAll(':scope > div')).map(x => Parsing.textContent(x)).join(",");
            // process the data
            if (sig.id && sig.name) {
                if (loclink) {
                    if (typeof loclink === 'string') {  // location is string, presumably colony name
                        const c = await findColonyByName(loclink);
                        if (c) {
                            safeCopy(sig, ['location', 'colony', 'world', 'system', 'x', 'y', 'z'], c, ['name', 'id', 'world', 'system', 'x', 'y', 'z']);
                        } else {
                            xerror(`Colony not found by name: ${loclink}`);
                        }
                    } else {
                        Parsing.parseFleetLocationFromLink(sig, loclink);
                    }
                }
                await enrichFleetLocation(sig);
                Parsing.sanitizeSignature(sig)
                signatures.push(sig);
            } else {
                xerror('Unabled to parse signature and/or name', sig);
            }
        }

        const signatures = [];
        const records = byId("midcolumn").querySelectorAll('div > div > div[id^="scan"]');
        if (records) {
            for (const node of records) {
                await _parseSensorRecord(node, signatures);
            }
        }

        // save (create or update) fleets
        xdebug(`signatures to update: ${JSON.stringify(signatures)}`);
        const saved = await bulkUpdate('signature', signatures);
        storeTimestamp(empiredb === 1 ? StoredTimestamps.SensorNetEmpire : StoredTimestamps.SensorNetMy, now);
        xlog(`Stored ${saved} signatures`);
    }

    // --- Menu --------------------------------------------------------------------

    const menu = (label, fn) =>
        typeof GM_registerMenuCommand === 'function' && GM_registerMenuCommand(label, fn);

    const Menu = {
        confirm: function () {
            return confirm('Are you sure?');
        },
        dump: async function (type) {
            const arr = await db.table(type).toArray();
            console.group(`Dump ${type} (${arr.length})`);
            console.table(arr);
            console.groupEnd();
        },
        dumpAll: async function () {
            for (const t of Object.keys(ENTITY_DEFS)) {
                await Menu.dump(t);
            }
        },
        clearAll: async function () {
            for (const t of Object.keys(ENTITY_DEFS)) {
                await Menu.deleteAll(t);
            }
        },
        deleteAll: async function (type) {
            await db.table(type).clear();
            notify(`Cleared all "${type}" records`);
        }
    }

    // DUMPS
    menu('Dump: systems', () => Menu.dump('system'));
    menu('Dump: worlds', () => Menu.dump('world'));
    menu('Dump: colonies', () => Menu.dump('colony'));
    menu('Dump: fleets', () => Menu.dump('fleet'));
    menu('Dump: rallypoints', () => Menu.dump('rp'));
    menu('Dump: wormholes', () => Menu.dump('wh'));
    menu('Dump: ALL', () => Menu.dumpAll());

    // CLEARS
    menu('Clear: systems', () => Menu.confirm() && Menu.deleteAll('system'));
    menu('Clear: worlds', () => Menu.confirm() && Menu.deleteAll('world'));
    menu('Clear: colonies', () => Menu.confirm() && Menu.deleteAll('colony'));
    menu('Clear: fleets', () => Menu.confirm() && Menu.deleteAll('fleet'));
    menu('Clear: rallypoints', () => Menu.confirm() && Menu.deleteAll('rp'));
    menu('Clear: wormholes', () => Menu.confirm() && Menu.deleteAll('wh'));
    menu('Clear: ALL', () => Menu.confirm() && Menu.clearAll());

    // --- Global dispatch -----------------------------------------------------

    (async () => {
        try {
            const urlstr = document.URL;
            xdebug(`In DEBUG mode for url=${urlstr}`);
            if (urlstr.match(/atmoburn\.com\/overview\.php\?view=2/i)) {
                xlog(`Fleet Overview: ${urlstr}`);
                setTimeout(safeAsync(parseMyFleetsOverview), 100);
            } else if (urlstr.match(/atmoburn\.com\/fleet\.php/i) || urlstr.match(/atmoburn\.com\/fleet\//i)) {
                xlog(`Fleet: ${urlstr}`);
                setTimeout(safeAsync(parseFleetScreen), 500);
                setTimeout(PureParser.parseColonyList, 600);
                setTimeout(PureParser.parseFleetList, 600);
            } else if (urlstr.match(/atmoburn\.com\/view_colony\.php/i)) {
                xlog(`Colony: ${urlstr}`);
                setTimeout(safeAsync(parseColonyScreen), 500);
                setTimeout(PureParser.parseColonyList, 600);
                setTimeout(PureParser.parseFleetList, 600);
            } else if (urlstr.match(/atmoburn\.com\/known_universe\.php/i)) {
                xlog(`Known Universe: ${urlstr}`);
                setTimeout(safeAsync(parseKnownUniverse), 200);
            } else if (urlstr.match(/atmoburn\.com\/extras\/scan.php/i)) {
                xlog(`Scan: ${urlstr}`);
                setTimeout(safeAsync(parseScan), 500);
            } else if (urlstr.match(/atmoburn\.com\/extras\/fleet_refuel_info.php/i)) {
                xlog(`Fuel Bunker: ${urlstr}`);
                setTimeout(safeAsync(parseFuelBunker), 500);
            } else if (urlstr.match(/atmoburn\.com\/rally_points\.php/i)) {
                xlog(`RP: ${urlstr}`);
                setTimeout(safeAsync(parseRallyPoints), 100);
            } else if (urlstr.match(/atmoburn\.com\/sensor_net\.php/i)) {
                xlog(`Sensor Net: ${urlstr}`);
                setTimeout(safeAsync(parseSensorNet), 200);
            }
        } catch (e) {
            notify('ARCH', e.message);
        }
    })();

})();
