// ==UserScript==
// @name           AtmoBurn Services - Show Fleet Direction
// @namespace      sk.seko
// @description    Displays horizontal (arrows) & vertical (degrees) fleet direction
// @updateURL      https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-fleet-direction/abs-fleet-direction.user.js
// @downloadURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-fleet-direction/abs-fleet-direction.user.js
// @homepageURL    https://github.com/seko70/tm-atmoburn/blob/main/abs-fleet-direction/README.md
// @license        MIT
// @match          https://*.atmoburn.com/fleet.php*
// @match          https://*.atmoburn.com/fleet/*
// @version        5.1.0
// @require        https://github.com/seko70/tm-atmoburn/raw/refs/tags/commons/abs-utils/v1.2.0/commons/abs-utils.js
// @grant          none
// ==/UserScript==

// Version 1.0 = Initial version
// Version 1.1 = fixed (removed) forgotten alert dialog
// Version 1.2 = Fixed @include after server protocol change from http to https
// Version 2.0 = Fixed for new WF (WF2); added vertical direction in degrees
// Version 3.0 = Atmoburn
// Version 3.1 = Fixed include
// Version 4.1 = Tweaks & fixes
// Version 4.1.1 = esversion set to 11
// Version 4.1.2 = small visual fix
// Version 4.2.0 = small formal changes
// Version 5.0.0 = Show (unicode) arrows instead of clock notation
// Version 5.1.0 = Added clock notation to compass as well

/* jshint esversion: 11 */
/* jshint node: true */

(function () {
    'use strict';

    const globalRegex = /^\s*(-*\d+)[,\s]+(-*\d+)[,\s]+(-*\d+)/;
    const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

    function parse_xyz(s) {
        return s.match(globalRegex);
    }

    function showIt() {
        if (ignoreNext) {
            ignoreNext = false;
            return;
        }
        const p2 = document.evaluate("//div[@id='missionPosition']//a/text()[contains(.,' global')]",
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (!p2 || !p2.textContent || p2.textContent.indexOf(" global") < 0) {
            return;
        }
        const p1 = document.evaluate("//div[@id='navData']//div[@id='positionRight']//a/text()[contains(.,' global')]",
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (!p1 || !p1.textContent || p1.textContent.indexOf(" global") < 0) {
            return;
        }
        const t1 = parse_xyz(p1.textContent);
        const t2 = parse_xyz(p2.textContent);
        const dirs = absDirections({x: t1[1], y: t1[2], z: t1[3]}, {x: t2[1], y: t2[2], z: t2[3]});
        //const h = horizontalDeg(t1, t2);
        //const v = verticalDeg(t1, t2);
        const bs = "&nbsp;&nbsp;&nbsp;"; // big HTML space
        const tooltip = `Horizontal: ${dirs.h == null ? '-' : dirs.h}º\nVertical: ${dirs.v}º`;
        const dir = (dirs.h != null) ? `${dirs.arrow} (${dirs.compass}, ${dirs.clock}°)` : (dirs.v > 0) ? '(UP)' : (dirs.v < 0) ? '(DOWN)' : '-';
        const elem = document.createElement('span');
        elem.innerHTML = `${bs}<span style="font-size: larger" title="${tooltip}">${dir}</span>`;
        elem.style.color = "yellow";
        elem.title = "Horizontal direction (in o'clock notation), and vertical direction (in degrees)";
        ignoreNext = true;
        eta.appendChild(elem);
    }

    let ignoreNext = false;
    const eta = document.getElementById('mEta');
    if (eta) {
        new MutationObserver(showIt).observe(eta, {attributes: false, childList: true, subtree: true});
        showIt();
    }

})();
