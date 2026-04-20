// ==UserScript==
// @name         AtmoBurn Services - Archivist
// @namespace    sk.seko
// @license      MIT
// @version      0.21.0
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
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/abs-utils/v1.2.2/commons/abs-utils.js
// @require      https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/atmoburn-service-db/v1.2.0/commons/atmoburn-service-db.js
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// ==/UserScript==

/* jshint esversion: 11 */
/* jshint node: true */

// @ts-check
// <reference types="dexie" />


(function () {
    'use strict';

    // refpoint; exported for use in other scripts as well
    unsafeWindow.refPoint = {x: 0, y: 0, z: 0, name: "Center-of-the-Universe", range: null, maxRange: null};

    // --- Dexie DB
    const db = window.sharedDB;

    const ENTITY_DEFS = { // allowed properties
        system: ['id', 'name', 'x', 'y', 'z', 'galaxy'],
        world: ['id', 'name', 'system', 'x', 'y', 'z'],
        colony: ['id', 'name', 'x', 'y', 'z', 'world', 'system', 'player', 'faction', 'relation', 'location', 'population', 'size', 'ts', 'src'],
        fleet: ['id', 'name', 'x', 'y', 'z', 'system', 'world', 'colony', 'player', 'faction', 'relation', 'signature', 'location', 'speed', 'ships', 'tonnage', 'roster', 'ts', 'src'],
        rp: ['id', 'name', 'x', 'y', 'z', 'relation', 'type', 'comment', 'ts', 'src'],
        wh: ['id', 'name', 'system', 'x', 'y', 'z', 'tsystem', 'tx', 'ty', 'tz', 'comment', 'ts', 'src'],
        signature: ['id', 'name', 'x', 'y', 'z', 'system', 'world', 'colony', 'player', 'faction', 'relation', 'location', 'speed', 'ships', 'tonnage', 'roster', 'ts', 'src'],
        outpost: ['id', 'name', 'x', 'y', 'z', 'system', 'world', 'colony', 'player', 'relation', 'location', 'ts', 'src'],
        relation: ['id', 'relation', `ts`, 'src'],
    };

    //const STATIC_DATA = ['world', 'system', 'colony', 'wh', 'rp']; // these data are not changed during the game

    const Relation = {
        MY: 'm',
        Friend: 'f',
        Neutral: 'n',
        Enemy: 'e',
    };

    const ScannerRelationMap = {
        'friend': Relation.Friend,
        'no contact': Relation.Neutral,
        'peace': Relation.Neutral,
    }

    const Source = {
        FLEET_OVERVIEW: 'fo',
        FLEET_LIST: 'fl',
        FLEET_SCAN: 'sf',
        FLEET_SCREEN: 'fs',
        COLONY_SCREEN: 'cs',
        COLONY_LIST: 'cl',
        COLONY_SCAN: 'sc',
        WORMHOLE_LIST: 'wl',
        FUEL_BUNKER: 'fb',
        RALLY_POINTS: 'rp',
        SENSOR_NET: 'sn',
    }

    // --- Various helpers

    // invisible, but harmless character; used to mark specific labels/names/tokens in html text
    const ZWSP = "\u200B";
    const ZWSP_RE = new RegExp(ZWSP + ".*$");
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

    function hash32(str) {
        let h = 0x811c9dc5; // FNV-ish start
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193); // 16777619
        }
        return h >>> 0; // unsigned 32-bit
    }

    function syntheticId(s, prefix = null) {
        const tmpId = hash32(s).toString(36).padStart(8, '0').slice(0, 8);
        return (prefix) ? `${prefix}${tmpId}` : tmpId;
    }

    // removes eventual tags (see abs-tag-manager)
    function stripTags(s) {
        return s ? s.replace(ZWSP_RE, "") : s;
    }

    function toHex(s) {
        return [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // simple helper, for shorter expressions
    function byId(ele) {
        return document.getElementById(ele);
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
            [r.name, r.fid, r.range, r.maxRange] = [useDefault(name, obj.name), fid, obj.range, obj.maxRange];
        } else {
            [r.x, r.y, r.z, r.name, r.fid] = [0, 0, 0, name ? name : "Center-Of-The-Universe", fid];
        }
    }

    // --- IndexedDB helpers -------------------------------------------------------

    const ADB = {
        // select only "registerd" attributes, return sanitized object
        _sanitize: function (type, data) {
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
        },
        // returns true only if new data are changed (ignores attributes not present in new data)
        _isShallowEqualForUpdate: function (type, oldData, newData) {
            //if (!STATIC_DATA.includes(type)) return false; // non-static entities should be always updated
            const ks = ENTITY_DEFS[type];
            for (const k of ks) {
                if (k === 'src') continue; // ignore management/debug/technical attributes - don't count it as a reason for update
                if (k === 'ts' && oldData.ts && newData.ts && !isOlderThan(oldData.ts, newData.ts, 4 * 3600)) continue; // timestamp is special
                if (newData[k] != null && !Object.is(oldData[k], newData[k])) {  // note: handles NaN correctly
                    xdebug('_isShallowEqualForUpdate', type, oldData.id, k, oldData[k], newData[k]);
                    if (k === 'name') {
                        xdebug("_isShallowEqualForUpdate name hex diff", toHex(oldData[k]), toHex(newData[k]));
                    }
                    return false;
                }
            }
            return true;
        },
        // stores object (update if overwrite == false)
        store: async function (type, data, overwrite = false) {
            const tbl = db.table(type);
            const obj = ADB._sanitize(type, data);
            const existingObj = overwrite ? null : await tbl.get(obj.id);
            if (existingObj) {
                if (ADB._isShallowEqualForUpdate(type, existingObj, obj)) {
                    return false;
                }
                xdebug("storing (update)", type, obj);
                await tbl.update(obj.id, obj);
            } else {
                xdebug("storing (put)", type, obj);
                await tbl.put(obj);
            }
            return true;
        },
        // same as 'store', but for array of objects
        bulkStore: async function (type, items, overwrite = false) {
            // optimize if empty
            if (!items || !items.length) {
                return 0;
            }
            // optimize if single element
            if (items.length === 1) {
                return await ADB.store(type, items[0], overwrite) ? 1 : 0;
            }
            // sanitize all items
            const sanitized = items.map(data => ADB._sanitize(type, data));
            // declare target table
            const table = db.table(type);
            // use bulkPut directly if appropriate..
            if (overwrite) {
                xdebug("storing (bulkPut)", type, sanitized);
                await table.bulkPut(sanitized);
                return sanitized.length;
            }
            // check for entities if they are already persisted
            const ids = sanitized.map(item => item.id);
            const existing = await table.bulkGet(ids);
            const toInsert = [];
            const toUpdate = [];
            for (let i = 0; i < sanitized.length; i += 1) {
                const obj = sanitized[i];
                const existingObj = existing[i];
                if (existingObj == null) { // not stored - put is needed
                    toInsert.push(obj);
                } else if (!ADB._isShallowEqualForUpdate(type, existingObj, obj)) {
                    const {id, ...changes} = obj; // skip id - we don't want to update primary key
                    toUpdate.push({key: id, changes});
                }
            }
            // insert new records
            if (toInsert.length > 0) {
                xdebug("storing (bulkPut)", type, toInsert);
                await table.bulkPut(toInsert);
            }
            // update existing records
            if (toUpdate.length > 0) {
                xdebug("storing (bulkUpdate)", type, toUpdate);
                await table.bulkUpdate(toUpdate);
            }
        }
    };

    function createColonyFromFleet(id, fleet) {
        const c = {id: id, ts: now};
        safeCopy(c, ['name', 'world', 'system', 'x', 'y', 'z'], fleet, ['colonyName', 'world', 'system', 'x', 'y', 'z']);
        Parsing.sanitizeColony(c);
        return c;
    }

    function createWorldFromFleet(id, fleet) {
        const w = {id: id};
        safeCopy(w, ['name', 'system', 'x', 'y', 'z'], fleet, ['worldName', 'system', 'x', 'y', 'z']);
        return w;
    }

    function createSystemFromFleet(id, fleet) {
        const s = {id: id};
        safeCopy(s, ['name', 'x', 'y', 'z'], fleet, ['systemdName', 'x', 'y', 'z']);
        return s;
    }

    async function deleteMissingColonies(colonyList, worldId) { // delete all colonies on world not on colonyList
        assert(!!worldId);
        const keepIds = new Set(colonyList.map(obj => obj.id));
        const idsToDelete = await db.colony.where('world').equals(worldId).filter(x => !keepIds.has(x.id)).primaryKeys();
        if (!idsToDelete || !idsToDelete.length) return 0;
        xdebug('Deleting missing colonies', idsToDelete);
        await db.colony.bulkDelete(idsToDelete);
        return idsToDelete.length;
    }

    async function deleteMyMissingColonies(colonyList) { // delete all my colonies not in the list
        const keepIds = new Set(colonyList.map(obj => obj.id));
        const idsToDelete = await db.colony.where('relation').equals(Relation.MY).filter(x => !keepIds.has(x.id)).primaryKeys();
        if (!idsToDelete || !idsToDelete.length) return 0;
        xdebug('Deleting my missing colonies', idsToDelete);
        await db.colony.bulkDelete(idsToDelete);
        return idsToDelete.length;
    }

    async function deleteMissingFleets(myFleetList) { // delete all my fleets not on the list
        const keepIds = new Set(myFleetList.map(obj => obj.id));
        const idsToDelete = await db.fleet.where('relation').equals(Relation.MY).filter(f => !keepIds.has(f.id)).primaryKeys();
        if (!idsToDelete || !idsToDelete.length) return 0;
        xdebug('Deleting missing fleets', idsToDelete);
        await db.fleet.bulkDelete(idsToDelete);
        return idsToDelete.length;
    }

    async function deleteMissingRPs(myRPList, empiredb) { // delete all rally points not on the list
        const keepIds = new Set(myRPList.map(obj => obj.id));
        const prefixToDelete = `#${empiredb}.`
        const idsToDelete = await db.rp.filter(r => r.id.startsWith(prefixToDelete) && !keepIds.has(r.id)).primaryKeys();
        if (!idsToDelete || !idsToDelete.length) return 0;
        xdebug('Deleting missing RPs', idsToDelete);
        await db.rp.bulkDelete(idsToDelete);
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
        let s = await db.system.get(sid);
        if (s) return s;
        const url = `${WF_BASE_URL}/API/?c=system&ID=${sid}`;
        const response = await fetch(url);
        if (!response.ok) {
            xerror(`Error fetching ${url}, status: ${response.status}`);
            return null;
        }
        s = await response.json();
        if (!s) {
            xerror(`fetchSystemInfo(id=${sid}) - no data; unexplored or empire explored?`);
            return null;
        }
        s = {id: s.ID, name: s.name, x: s.x, y: s.y, z: s.z, galaxy: s.galaxy};
        await ADB.store('system', s);
        return s;
    }

    async function fetchWorldInfo(wid) {
        let w = await db.world.get(wid);
        if (w) return w;
        const url = `${WF_BASE_URL}/API/?c=world&ID=${wid}`;
        const response = await fetch(url);
        //xdebug(`fetchWorldInfo(id=${wid}) fetch response`, response);
        if (!response.ok) {
            xerror(`Error fetching ${url}, status: ${response.status}`);
            return null;
        }
        w = await response.json();
        if (!w) {
            xerror(`fetchWorldInfo(id=${wid}) - no data; unexplored or empire explored?`);
            return null;
        }
        const s = await fetchSystemInfo(w.system);
        w = {id: w.ID, name: w.name, system: w.system, x: s.x, y: s.y, z: s.z};
        await ADB.store('world', w);
        return w;
    }

    // async job to clean duplicate signatures (heuristics ahead!)
    async function signatureCleanup() {

        async function _processSignature(sig) {
            // check for fleets with same signature first...
            let matchingFleet = await db.fleet.where('signature').equals(sig.id).first();
            if (!matchingFleet) {
                // ... and then check for fleets with same name, player and position
                matchingFleet = await db.fleet.where('name').equals(sig.name).filter(
                    f => f.player === sig.player && f.x === sig.x && f.y === sig.y && f.z === sig.z
                ).first();
            }
            if (matchingFleet) {
                if (isOlderThan(matchingFleet.ts, sig.ts, 3600)) {
                    safeCopy(matchingFleet, ['system', 'world', 'x', 'y', 'z', 'location'], sig);
                    await ADB.store('fleet', matchingFleet);
                }
                xdebug("Signature can be deleted - matching fleet(s) found", sig, matchingFleet)
                return true; // we don't need this signature anymore - there is a fleet recorded
            }
            return false;
        }

        // phase 1 - readonly scan, collecting IDs for delete
        const idsToDelete = [];
        const allSignatures = await db.signature.toArray();
        for (const sig of allSignatures) {
            const shouldDelete = await _processSignature(sig);
            if (shouldDelete) {
                idsToDelete.push(sig.id);
            }
        }
        // phase 2 - delete expired/duplicate signatures
        if (idsToDelete.length > 0) {
            await db.signature.bulkDelete(idsToDelete);
            console.info("signatureCleanup completed, deleted signatures: " + idsToDelete.length);
        }
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
            let colony = {id: cid, relation: Relation.MY, player: Parsing.parsePlayerName(), ts: now, src: Source.COLONY_SCREEN};
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
            colony.location = colony['worldName'] || colony['systemName'];
            // parse colony name
            colony.name = stripTags(Parsing.textContent(
                mid.querySelector('.pagetitle > div.flex_center') ?? mid.querySelector('.pagetitle')
            ));
            assert(colony.name, `No name found for colony #${cid}`);
            // pop and size
            const colonydropdown = mid.querySelectorAll('div.colonydropdown')
            colony.population = safeInteger(Parsing.getTextAfterPrefix(colonydropdown, 'Population:'));
            colony.size = safeInteger(Parsing.getTextAfterPrefix(colonydropdown, 'Size:'));
            return colony;
        },

        // Parse some fleet metadata from (current) fleet screen; ; we assume it is "my" fleet; returns fleet:
        // {id,name,player,relation,colony,colonyName,world,worldName,system,systemName}
        parseFleetScreen: function () {
            // parse fleet ID from URL
            const fid = Parsing.parseFleetIdFromURL();
            if (!fid) return; // No fleet ID in page URL means there is no info to parse
            // retrieve fleet info or create new one
            let fleet = {id: fid, ts: now, relation: Relation.MY, src: Source.FLEET_SCREEN};
            // find navigation data panel
            const navData = byId('navData');
            if (!navData) return;
            // parse fleet coordinates
            Parsing.parseFleetCoordinates(navData, fleet);
            // parse fleet location (colony, world, system) if present
            const leftData = navData.querySelector('div#positionLeft');
            leftData?.querySelectorAll('a[href]')?.forEach((link) => {
                if (Parsing.parseColonyInfoFromLink(link, fleet, 'colony', 'colonyName')) return;
                if (Parsing.parseWorldInfoFromLink(link, fleet, 'world', 'worldName')) return;
                Parsing.parseSystemInfoFromLink(link, fleet, 'system', 'systemName');
            });
            fleet.location = fleet['colonyName'] || fleet['worldName'] || fleet['systemName'];
            // check for confed/shared fleets
            const shared = Parsing.textContent(byId('midcolumn').querySelector('div.subtext'));
            if (shared && shared === 'Shared empire access') {
                fleet.relation = Relation.Friend;
                fleet.player = '(CONFED)';
            }
            // fleet name
            fleet.name = stripTags(Parsing.textContent(byId('pageHeadLine')));
            assert(fleet.name, `No name found for fleet #${fid}`);
            // ranges
            fleet.range = safeInteger(Parsing.textContent(byId('fleetRange')));
            fleet.maxRange = safeInteger(Parsing.textContent(byId('fleetMaxRange')));
            return fleet;
        },

        // Parse colony list form "Colonies" menu; returns list of {id,name,style}
        parseColonyList: function () {
            const colonylist = byId("colonylist");
            if (!colonylist) return null;
            const colonies = [];
            colonylist.querySelectorAll('a[href*="/view_colony.php?colony="]')?.forEach((node) => {
                const c = {ts: now, src: Source.COLONY_LIST};
                const parsedOK = Parsing.parseColonyInfoFromLink(node, c, 'id', 'name');
                assert(parsedOK, `Can't parse colony id/name from colony list node ${node?.outerHTML}`);
                c.style = node.getAttribute("style");
                colonies.push(c);
            });
            assert(colonies.length > 0, "No colonies in colony list?");
            return colonies;
        },

        // Parse fleet list form "Fleets" menu; returns list of {id,name,style}
        parseFleetList: function () {
            const fleetlist = byId("fleetlist");
            if (!fleetlist) return null;
            const fleets = [];
            fleetlist.querySelectorAll('a[href*="/fleet.php?fleet="]')?.forEach((node) => {
                const f = {ts: now, src: Source.FLEET_LIST};
                const parsedOK = Parsing.parseFleetInfoFromLink(node, f, 'id', 'name');
                assert(parsedOK, `Can't parse fleet id/name from colony list node ${node?.outerHTML}`);
                f.style = node.getAttribute("style");
                fleets.push(f);
            });
            assert(fleets.length > 0, "No fleets in fleet list?");
            return fleets;
        },

        // Parse fuel bunker (colonies and fleets)
        parseFuelBunker: function () {
            const objects = [];
            let obj = null;

            function _parseFuelBunkerRecords(row) {
                const links = row.querySelectorAll('a[href*="/fleet.php?fleet="]');
                if (links && links.length > 0) {
                    obj = {ts: now, src: Source.FUEL_BUNKER};
                    if (links.length === 3) {
                        // colony or world level barge/outpost, for example:
                        //   https://beta7.atmoburn.com/fleet.php?fleet=4636&tcolony=123
                        //   https://beta7.atmoburn.com/fleet.php?fleet=4636&tworld=123
                        const [olink, wlink, slink] = links;
                        if (Parsing.parseInfoFromLink(olink, /tcolony=(\d+)/, obj, 'id', 'name')) {
                            obj.type = "colony";
                        } else if (Parsing.parseInfoFromLink(olink, /tworld=(\d+)/, obj, 'id', 'name')) {
                            obj.id = syntheticId(`${obj.id}.${obj.name}`, 'w#');
                            obj.type = "outpost";
                        }
                        if (obj.id) {
                            Parsing.parseInfoFromLink(wlink, /tworld=(\d+)/, obj, 'world', 'worldName');
                            Parsing.parseInfoFromLink(slink, /tsystem=(\d+)/, obj, 'system', 'systemName');
                        }
                    } else if (links.length === 2) {
                        // system level outpost/barge, for example:
                        //   https://beta7.atmoburn.com/fleet.php?fleet=574&tsystem=165&x=0&y=40&z=10&tpos=local
                        const [olink, slink] = links;
                        if (Parsing.parseInfoFromLink(olink, /tsystem=(\d+)/, obj, 'id', 'name')) {
                            obj.id = syntheticId(`${obj.id}.${obj.name}`, 's#');
                            obj.type = "outpost";
                        }
                        if (obj.id) {
                            Parsing.parseInfoFromLink(slink, /tsystem=(\d+)/, obj, 'system', 'systemName');
                        }
                    } else if (links.length === 1) {
                        // global level outpost/barge, for example:
                        //   https://beta7.atmoburn.com/fleet.php?fleet=62&x=-4811&y=-4101&z=4492&tpos=global
                        const olink = links[0];
                        if (Parsing.parseGlobalInfoFromLink(olink, obj, 'x', 'y', 'z')) {
                            obj.name = stripTags(Parsing.textContent(olink));
                            obj.id = syntheticId(`${obj.x}.${obj.y}.${obj.z}.${obj.name}`, 'g#');
                            obj.type = "outpost";
                        }
                    }
                    if (!obj.id) {
                        obj = null;
                        xdebug('parseFuelBunker - unknown record type', row.outerHTML);
                    }
                } else if (obj) {
                    // second row - append info to record
                    const plink = row.querySelector('a[href*="/message.php?player="]');
                    assert(plink);
                    obj.player = Parsing.textContent(plink);
                    obj.location = obj['worldName'] || obj['systemName'];
                    objects.push(obj);
                    obj = null;
                }
            }

            const rows = document.querySelectorAll("body > div > div > div > table > tbody > tr");
            if (rows) {
                for (const row of rows) {
                    try {
                        _parseFuelBunkerRecords(row);
                    } catch (e) {
                        notify('ARCH - parseFuelBunker', e.message);
                        obj = null;
                    }
                }
            }
            return objects;
        }

    }


    // --- Parse helpers -----------------------------------------------------------

    const Parsing = {
        makeIdFromString: function (s) {
            return s?.toLowerCase().replace(/[^a-z0-9]/g, "");
        },
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
            if (!link) return false;
            const m = (link.href || link.getAttribute('onClick'))?.match(pattern);
            if (!m) return false;
            if (idAttr) obj[idAttr] = Number(m[1]);
            if (nameAttr) obj[nameAttr] = stripTags(Parsing.textContent(link));
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
            const ref = link.href || link.getAttribute('onClick');
            if (!ref) return false;
            if (ref.includes('tpos=') && !ref.includes('tpos=global')) return false;
            const m = ref.match(XYZ_URL_REGEX);
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
                obj.relation = obj.relation.trim().toLowerCase();
                obj.relation = ScannerRelationMap[obj.relation] ?? obj.relation[0];
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
        setDefaultsIfNotDefined: function (obj, defaults) {
            Object.assign(obj, Object.fromEntries(Object.entries(defaults).filter(([k]) => !(k in obj))));
        },
        sanitizeFleet: function (f) {
            f.name = useDefault(stripTags(f.name));
            Parsing.fixRelation(f);
            if (typeof f.speed != 'number') f.speed = safeInteger(f.speed);
            if (typeof f.ships != 'number') f.ships = safeInteger(f.ships);
            if (typeof f.tonnage != 'number') f.tonnage = safeFloat(f.tonnage);
            if (!f.roster || !f.roster.length || f.roster === '""') f.roster = null;
            Parsing.fixUndefined(f);
            Parsing.setDefaultsIfNotDefined(f, {colony: null, world: null, system: null, x: null, y: null, z: null});
        },
        sanitizeSignature: function (s) {
            Parsing.sanitizeFleet(s); // for now it is the same as fleet (except "signature" an "id" fields)
        },
        sanitizeOutpost: function (f) {
            f.name = useDefault(stripTags(f.name));
            Parsing.fixRelation(f);
            Parsing.fixUndefined(f);
            Parsing.setDefaultsIfNotDefined(f, {colony: null, world: null, system: null, x: null, y: null, z: null});
        },
        sanitizeColony: function (c) {
            c.name = useDefault(stripTags(c.name));
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

    async function parseWormholes() {

        async function _parseWormhole(row, wormholes) {
            const divs = row.querySelectorAll(':scope > div');
            assert(divs && [4, 6].includes(divs.length), 'Wormhole record unrecognized');
            // two variants of wormhole list exists
            const targetSystemColumnNumber = divs.length === 6 ? 3 : 2;
            // parse wormhole name
            const wh = {ts: now, src: Source.WORMHOLE_LIST, tsystem: null, tlocation: null};
            wh.name = useDefault(Parsing.textContent(divs[0]));
            // parse wormhole system
            Parsing.parseSystemInfoFromLink(divs[1], wh, 'system', 'location');
            assert(wh.system);
            const fromSystem = await fetchSystemInfo(wh.system);
            [wh.x, wh.y, wh.z] = [fromSystem.x, fromSystem.y, fromSystem.z];
            // parse wormhole target system
            Parsing.parseSystemInfoFromLink(divs[targetSystemColumnNumber], wh, 'tsystem', 'tlocation');
            assert(wh.tsystem);
            const toSystem = await fetchSystemInfo(wh.tsystem);
            [wh.tx, wh.ty, wh.tz] = [toSystem.x, toSystem.y, toSystem.z];
            // generate wormhole ID
            wh.id = `#${Parsing.makeIdFromString(wh.name.replace('Wormhole ', ''))}.${wh.system}`;
            wh.comment = `${wh.location} → ${wh.tlocation}`;
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

        await ADB.bulkStore('wh', wormholeList, true);
        storeTimestamp(empiredb === 1 ? StoredTimestamps.WormholesEmpire : StoredTimestamps.WormholesMy, now);
    }

    async function parseMyFleetsOverview() {

        async function _parseFleet(node, fleets) {
            assert(node != null);
            const f = {
                id: parseInt(node.href.match(/fleet=(\d+)/)[1]),
                name: useDefault(stripTags(Parsing.textContent(node))),
                player: Parsing.parsePlayerName(),
                relation: Relation.MY,
                ts: now,
                src: Source.FLEET_OVERVIEW,
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

        await ADB.bulkStore('fleet', fleets);
        storeTimestamp(StoredTimestamps.Fleets, now);
    }

    async function parseFleetScreen() {
        const fleet = PureParser.parseFleetScreen();
        if (!fleet) return; // quit quietly - no fleet info is available
        // cache colony, world and system coordinates - eventually
        if (fleet.colony) await ADB.store('colony', createColonyFromFleet(fleet.colony, fleet));
        if (fleet.world) await ADB.store('world', createWorldFromFleet(fleet.world, fleet));
        if (fleet.system) await ADB.store('system', createSystemFromFleet(fleet.system, fleet));
        // sanitize and store
        Parsing.sanitizeFleet(fleet);
        setRefPoint(fleet, fleet.id);
        await ADB.store('fleet', fleet);
    }

    async function parseColonyScreen() {
        const colony = PureParser.parseColonyScreen();
        if (!colony) return; // quit quietly - no colony info is available
        // determine global coordinates
        const s = await fetchSystemInfo(colony.system);
        assert(s, `Can't fetch system #${colony.system}`);
        [colony.x, colony.y, colony.z] = [s.x, s.y, s.z];
        // sanitize and store
        Parsing.sanitizeColony(colony);
        setRefPoint(colony);
        await ADB.store('colony', colony);
    }

    async function parseSideLists() {
        try {
            const myColonies = PureParser.parseColonyList();
            await deleteMyMissingColonies(myColonies);
            await ADB.bulkStore('colony', myColonies);
        } catch (err) {
            notify('Error while parsing/processing side colony list', err);
        }
        try {
            const myFleets = PureParser.parseFleetList();
            await deleteMissingFleets(myFleets);
        } catch (err) {
            notify('Error while parsing/processing side fleet list', err);
        }
    }

    async function parseScan() {

        function _parseColonyFromScan(clink, scanner, colonyList) {
            const c = {ts: now, src: Source.COLONY_SCAN};
            const parsed = Parsing.parseInfoFromLink(clink, /tcolony=(\d+)/, c, 'id', 'name');
            assert(parsed, 'No colony info in link ' + clink.outerHTML);
            const row = clink.parentElement.parentElement;
            const cols = Array.from(row?.querySelectorAll(':scope > td'));
            c.player = Parsing.textContent(cols[1]); // player name
            c.faction = Parsing.textContent(cols[2]); // player faction
            c.relation = Parsing.textContent(cols[3]); // player relation
            c.population = safeInteger(Parsing.textContent(cols[4])); // colony population
            c.size = safeInteger(Parsing.textContent(cols[5])); // colony size
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
                let f = {signature: sig_text.split(' ').pop(), ts: now, src: Source.FLEET_SCAN};
                // second row
                const r2cols = Array.from(row2?.querySelectorAll(':scope > td'));
                const flink = r2cols[0].querySelector(':scope > a[href^="/fleet.php?"]');
                Parsing.parseInfoFromLink(flink, /tfleet=(\d+)/, f, 'id', 'name');
                f.faction = Parsing.textContent(r2cols[1]);
                const loclink = last(r2cols[2].querySelectorAll("span.fakeLink"));
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
                f.roster = Array.from(r4cols[0].querySelectorAll('div'))?.map(x => Parsing.textContent(x)).join(', ');
                // add to fleets
                if (f.id && f.name) {
                    await enrichFleetLocation(f);
                    Parsing.sanitizeFleet(f);
                    fleets.push(f);
                } else {
                    xerror('Unabled to parse fleet id and/or name', f);
                }
            }

            await ADB.bulkStore('fleet', fleets);
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

            await ADB.bulkStore('colony', colonies);
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
        const objects = PureParser.parseFuelBunker();
        const colonies = [];
        const outposts = [];
        for (const obj of objects) {
            if (obj.player === Parsing.parsePlayerName()) continue; // skip my colonies and fleets
            if (obj.system) {
                const s = await fetchSystemInfo(obj.system);
                copyXYZ(obj, s);
            }
            if (obj.type === 'colony') {
                Parsing.sanitizeColony(obj);
                colonies.push(obj);
            } else if (obj.type === 'outpost') {
                Parsing.sanitizeOutpost(obj);
                outposts.push(obj);
            } else {
                xerror('parseFuelBunker - unknown record type', obj);
            }
        }
        await ADB.bulkStore('colony', colonies);
        await ADB.bulkStore('outpost', outposts);
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
                src: `${Source.RALLY_POINTS}.${empiredb}`,
            };
            Parsing.fixUndefined(rp);
            rpList.push(rp);
        });

        await ADB.bulkStore('rp', rpList, true);
        await deleteMissingRPs(rpList, empiredb)
        storeTimestamp(empiredb === 1 ? StoredTimestamps.RallyPointsEmpire : StoredTimestamps.RallyPointsMy, now);
    }

    async function parseSensorNet() {
        const empiredb = !!document.URL.match(/empiredb=1/) ? 1 : 0;

        async function _parseSensorRecord(node, signatures) {
            const divs = node.querySelectorAll(':scope > div');
            // first row
            const divs0 = divs[0].querySelectorAll(':scope > div');
            const sig = {id: lastWordOf(Parsing.textContent(divs0[0])), src: `${Source.SENSOR_NET}.${empiredb}`};
            assert(sig.id);
            sig.ts = parseInt(divs0[1].getAttribute("gametime")) * 1000;
            const coords = divs0[2]?.querySelector(':scope > button')?.getAttribute('onclick')?.match(/"(.*)"/)[1]
            if (coords) Parsing.parseXYZ(coords, sig);
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
            sig.location = Parsing.textContent(last(divs111[0].querySelectorAll("div")));
            // fourth row
            sig.roster = Array.from(divs[2].querySelectorAll(':scope > div')).map(x => Parsing.textContent(x)).join(",");
            // process the data
            if (sig.id && sig.name) {
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

        await ADB.bulkStore('signature', signatures);
        storeTimestamp(empiredb === 1 ? StoredTimestamps.SensorNetEmpire : StoredTimestamps.SensorNetMy, now);
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
            //xdebug(`Processing url=${urlstr}`);
            if (urlstr.match(/atmoburn\.com\/overview\.php\?view=2/i)) {
                xlog(`Fleet Overview: ${urlstr}`);
                setTimeout(safeAsync(parseMyFleetsOverview), 100);
                setTimeout(safeAsync(signatureCleanup), 1000);
            } else if (urlstr.match(/atmoburn\.com\/fleet\.php/i) || urlstr.match(/atmoburn\.com\/fleet\//i)) {
                xlog(`Fleet: ${urlstr}`);
                setTimeout(safeAsync(parseFleetScreen), 500);
                setTimeout(safeAsync(parseSideLists), 600);
            } else if (urlstr.match(/atmoburn\.com\/view_colony\.php/i)) {
                xlog(`Colony: ${urlstr}`);
                setTimeout(safeAsync(parseColonyScreen), 500);
                setTimeout(safeAsync(parseSideLists), 600);
            } else if (urlstr.match(/atmoburn\.com\/known_universe\.php/i)) {
                xlog(`Known Universe: ${urlstr}`);
                setTimeout(safeAsync(parseWormholes), 200);
            } else if (urlstr.match(/atmoburn\.com\/extras\/scan.php/i)) {
                xlog(`Scan: ${urlstr}`);
                setTimeout(safeAsync(parseScan), 500);
                setTimeout(safeAsync(signatureCleanup), 1000);
            } else if (urlstr.match(/atmoburn\.com\/extras\/fleet_refuel_info.php/i)) {
                xlog(`Fuel Bunker: ${urlstr}`);
                setTimeout(safeAsync(parseFuelBunker), 500);
            } else if (urlstr.match(/atmoburn\.com\/rally_points\.php/i)) {
                xlog(`RP: ${urlstr}`);
                setTimeout(safeAsync(parseRallyPoints), 100);
            } else if (urlstr.match(/atmoburn\.com\/sensor_net\.php/i)) {
                xlog(`Sensor Net: ${urlstr}`);
                setTimeout(safeAsync(parseSensorNet), 200);
                setTimeout(safeAsync(signatureCleanup), 1000);
            }
        } catch (e) {
            notify('ARCH', e.message);
        }
    })();

})();
