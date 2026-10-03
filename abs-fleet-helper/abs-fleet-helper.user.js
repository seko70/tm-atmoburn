// ==UserScript==
// @name           AtmoBurn Services - Fleet Helper
// @namespace      sk.seko
// @description    Adds some controls to fleet navigation screen (relative to current position, specify direction and distance etc)
// @updateURL      https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-fleet-helper/abs-fleet-helper.user.js
// @downloadURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-fleet-helper/abs-fleet-helper.user.js
// @homepageURL    https://github.com/seko70/tm-atmoburn/blob/main/abs-fleet-helper/README.md
// @license        MIT
// @match          https://*.atmoburn.com/fleet.php*
// @match          https://*.atmoburn.com/fleet/*
// @grant          none
// @version        5.1.0
// ==/UserScript==

// version 1.0 - init
// version 1.1 - fix for UI changes
// version 1.2 - added directional move (custom h.direction, distance and z variance)
// version 1.3 - added "(fleet command)" link to fleet global coordinates; works best with "WF Fleet Command Helper"
// version 1.4 - fixed @include after server protocol change from http to https
// version 2.0 - support to "new" WF (WF2)
// version 2.1 - systems in "Near Systems" now have color, and calculate vertical direction as well
// version 2.2 - fixed GM_xmlhttpRequest vs GM.xmlHttpRequest incompatibility for some *monkey implementations
// version 3.0 - atmoburn
// version 4.0 - atmoburn changed
// version 4.0.1 - fixed "local targets"; fixed Up and Down distances
// version 4.0.2 - esversion set to 11
// version 4.1.0 - small fixes; added "Entrance (global)"
// version 5.1.0 - z-axis change for direct movement now accepts angle in "degrees" (-90 to 90), not "z difference"

/* jshint esversion: 11 */
/* jshint node: true */

"use strict";

// regex pattern to match and capture x,y,z coordinates (plain text)
const XYZ_REGEX = /^\s*(-*\d+)[,\s]+(-*\d+)[,\s]+(-*\d+)/;

let mCoordinates;
let fleetInfo; // x, y, z
let xyzNode;
let xyzposNode;
let localTarget;
let globalTarget;
let targetTable;
let targetTableContent;

function xlog(msg) {
    console.log(`FH: ${msg}`);
}

function xerror(msg, error) {
    console.error(`FH: ${msg}`, error);
}

function byId(ele) {
    return document.getElementById(ele);
}

function fixDistance(d) {
    return d ? Number(d.trim().replace(/[mM]$/, '000000')) : d;
}

function deg2rad(angle) {
    return angle / 57.29577951308232; // angle / Math.PI * 180
}

function parseXYZ(s) {
    const m = s.match(XYZ_REGEX);
    return m ? {'x': parseInt(m[1]), 'y': parseInt(m[2]), 'z': parseInt(m[3])} : null;
}

function select_changed() {
    const val = byId("wfsCtrl").value;
    switch (val) {
        case "": { // label; do nothing
            hide_target_table(1);
            break;
        }
        case "entrance": { // set coordinates to x,y,z-1 global
            hide_target_table(1);
            xyzNode.value = `${fleetInfo.x},${fleetInfo.y},${fleetInfo.z}`;
            xyzposNode.value = "global";
            break;
        }
        case "1up": { // set coordinates to x,y,z+1 global
            hide_target_table(1);
            xyzNode.value = `${fleetInfo.x},${fleetInfo.y},${fleetInfo.z + 1}`;
            xyzposNode.value = "global";
            break;
        }
        case "1down": { // set coordinates to x,y,z-1 global
            hide_target_table(1);
            xyzNode.value = `${fleetInfo.x},${fleetInfo.y},${fleetInfo.z - 1}`;
            xyzposNode.value = "global";
            break;
        }
        case "dm": { // directional movement
            hide_target_table(1);
            let clock = null;
            while (!clock || clock.trim() === '') {
                clock = prompt("o'Horizontal direction (clock, 1-12, like 3, or 3.5, etc):", "12");
                if (clock === null) return;
            }
            let distance = null;
            while (!distance) {
                distance = prompt("Distance in km/mkm (like 5000000 or 5m):", "");
                if (distance === null) return;
            }
            distance = fixDistance(distance);
            let vdeg = null;
            while (vdeg == null) {
                vdeg = prompt("o'Vertical direction (degrees, -90 to 90):", "0");
                if (vdeg === null) return;
            }
            const hangle = clock_to_angle_rad(clock.trim());
            const vangle = deg2rad(vdeg);
            const x = fleetInfo.x + Math.round(distance * Math.cos(vangle) * Math.cos(hangle) / 4000);
            const y = fleetInfo.y + Math.round(distance * Math.cos(vangle) * Math.sin(hangle) / 4000);
            const z = fleetInfo.z + Math.round(distance * Math.sin(vangle) / 4000);
            xyzNode.value = `${x},${y},${z}`;
            break;
        }
        default: {
            hide_target_table(1);
            if (val.startsWith("net|")) {
                const vals = val.split('|');
                const x = fleetInfo.x + parseInt(vals[1]);
                const y = fleetInfo.y + parseInt(vals[2]);
                const z = fleetInfo.z + parseInt(vals[3]);
                xyzNode.value = `${x},${y},${z}`;
            } else {
                alert("Unhandled option: " + val);
            }
            break;
        }
    }
    byId("wfsCtrl").value = "";
}

function hide_target_table(onoff) {
    targetTable.style.display = onoff ? "none" : "";
}

function create_target_table() {
    const table = document.createElement("div");
    table.setAttribute("class", "fullwidth padding5 tbborder light");
    table.setAttribute("align", "left");
    table.setAttribute("colspan", "2");
    table.setAttribute("id", "wfsTable");
    table.style.display = "none";
    const tt = document.createElement('table');
    tt.setAttribute('id', 'wfsTableContent');
    tt.setAttribute('class', "margintop width100 box");
    tt.setAttribute('width', '80%');
    table.appendChild(tt);
    mCoordinates.parentNode.appendChild(table);
    targetTable = table;
    targetTableContent = tt;
}

/*
function create_option_net(parent, name, dx, dy, dz) {
    const opt = document.createElement("option");
    opt.setAttribute("value", "net|" + dx + "|" + dy + "|" + dz);
    opt.appendChild(document.createTextNode(name));
    parent.appendChild(opt);
}
 */

function clock_to_angle_rad(hour) {
    return deg2rad(360.0 * ((3 - hour + 48) % 12) / 12.0);
}

/*
function create_option_net_polar(parent, name, hour, distance) {
    const angle = clock_to_angle_rad(hour);
    const dx = Math.round(distance * Math.cos(angle) / 4000);
    const dy = Math.round(distance * Math.sin(angle) / 4000);
    create_option_net(parent, name, dx, dy, 0);
}
 */

function parseFleetInfo() {
    const p = byId("navData").querySelector("div#positionRight > div > a");
    if (p && p.textContent) {
        return parseXYZ(p.textContent);
    }
    return null;
}

function createUI() {
    // already done
    if (byId("wfsCtrl")) {
        return;
    }
    // initialize global variables
    xyzposNode = byId("xyzpos");
    localTarget = byId("mLocalTargets").querySelector("option");
    globalTarget = byId("missionSelectionGlobal");
    // something is wrong, quit
    if (!xyzposNode || !globalTarget) {
        xerror("No xyzposNode or globalTarget");
        return;
    }
    // get coordinates and fleet ID
    fleetInfo = parseFleetInfo();
    if (!fleetInfo) {
        xerror("No fleet info");
        return;
    }

    // create combo
    const sel = document.createElement("select");
    sel.setAttribute("class", "darkselect");
    sel.setAttribute("id", "wfsCtrl");
    sel.addEventListener("change", select_changed, false);
    // opt0
    const opt0 = document.createElement("option");
    opt0.setAttribute("value", "");
    opt0.appendChild(document.createTextNode("Select..."));
    sel.appendChild(opt0);
    // move 1 up
    if (localTarget) {
        const opt1 = document.createElement("option");
        opt1.setAttribute("value", "1up");
        opt1.appendChild(document.createTextNode("Above"));
        sel.appendChild(opt1);
    }
    // move 1 down
    if (localTarget) {
        const opt2 = document.createElement("option");
        opt2.setAttribute("value", "1down");
        opt2.appendChild(document.createTextNode("Below"));
        sel.appendChild(opt2);
    }
    // move to specified horizontal direction and distance, and optionally vertical direction
    if (globalTarget) {
        const opt3 = document.createElement("option");
        opt3.setAttribute("value", "dm");
        opt3.appendChild(document.createTextNode("Direct"));
        sel.appendChild(opt3);
    }

    /*
    const optg1 = document.createElement("optgroup");
    const dist = 3000000;
    const distStr = Math.round(dist / 1000000).toString() + "mkm";
    optg1.setAttribute("label", "Scanner network 8+2");
    create_option_net(optg1, distStr + " Up", 0, 0, Math.round(dist / 4000));
    create_option_net(optg1, distStr + " Down", 0, 0, -Math.round(dist / 4000));
    create_option_net_polar(optg1, distStr + " 01'o", 1, dist);
    create_option_net_polar(optg1, distStr + " 02'o", 2, dist);
    create_option_net_polar(optg1, distStr + " 03'o", 3, dist);
    create_option_net_polar(optg1, distStr + " 04'o", 4, dist);
    create_option_net_polar(optg1, distStr + " 05'o", 5, dist);
    create_option_net_polar(optg1, distStr + " 06'o", 6, dist);
    create_option_net_polar(optg1, distStr + " 07'o", 7, dist);
    create_option_net_polar(optg1, distStr + " 08'o", 8, dist);
    create_option_net_polar(optg1, distStr + " 09'o", 9, dist);
    create_option_net_polar(optg1, distStr + " 10'o", 10, dist);
    create_option_net_polar(optg1, distStr + " 11'o", 11, dist);
    create_option_net_polar(optg1, distStr + " 12'o", 12, dist);
    sel.appendChild(optg1);
     */

    xyzposNode.parentNode.insertBefore(sel, xyzposNode.nextSibling.nextSibling);

    // create target table (hidden)
    create_target_table();
}

function startFleetHelper() {
    xyzNode = byId("xyz");
    if (xyzNode) {
        mCoordinates = xyzNode.parentNode.parentNode;
        createUI();
        //xlog("Initialized");
    } else {
        xerror("NOT Initialized");
    }
}

setTimeout(startFleetHelper, 500);