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
// @version        5.0.1
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

/* jshint esversion: 11 */
/* jshint node: true */

(function () {
    'use strict';

    const globalRegex = /^\s*(-*\d+)[,\s]+(-*\d+)[,\s]+(-*\d+)/;
    const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

    function parse_xyz(s) {
        return s.match(globalRegex);
    }

    function rad2deg(angle) {
        return angle * 57.29577951308232; // angle / Math.PI * 180
    }

    // convert horizontal direction in degrees to arrow
    function arrowFromDeg(deg) {
        if (deg == null) return '-';
        // normalize to <0, 360)
        deg = ((deg % 360) + 360) % 360;
        // nearest sector (add half-sector = 22.5° then floor)
        const idx = Math.floor((deg + 22.5) / 45) % 8;
        return arrows[idx];
    }

    // convert horizontal direction in degrees to compas direction (S,N,E,W,...)
    function compassFromDeg(deg) {
        if (deg == null) return '-';
        return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
    }

    // return horizontal direction in degrees (0-180), 0 is "north"
    function horizontalDeg(p1, p2) {
        const dx = p2[1] - p1[1];
        const dy = p2[2] - p1[2];
        if (dx === 0 && dy === 0) return null; // no direction
        const deg = rad2deg(Math.atan2(dx, dy));
        return Math.round(deg < 0 ? deg + 360 : deg);
    }

    // return vertical direction, in degrees (-90,90)
    function verticalDeg(p1, p2) {
        const dz = p2[3] - p1[3];
        if (dz === 0) return 0;
        const dx = p2[1] - p1[1];
        const dy = p2[2] - p1[2];
        const dxy = Math.round(Math.sqrt(dx * dx + dy * dy));
        if (dxy === 0) return dz > 0 ? 90 : -90;
        let vert = Math.round(rad2deg(Math.atan2(dz, dxy)));
        if (vert < -90) {
            vert = -180 - vert;
        } else if (vert > 90) {
            vert = 180 - vert;
        }
        return vert;
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
        const h = horizontalDeg(t1, t2);
        const v = verticalDeg(t1, t2);
        const elem = document.createElement('span');
        const bs = "&nbsp;&nbsp;&nbsp;"; // big HTML space
        const tooltip = `Horizontal: ${h == null ? '-' : h}º\nVertical: ${v}º`;
        const dir = (h != null) ? `${arrowFromDeg(h)} (${compassFromDeg(h)})` : (v > 0) ? '(UP)' : (v < 0) ? '(DOWN)' : '-';
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
