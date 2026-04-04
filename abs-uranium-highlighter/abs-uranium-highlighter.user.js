// ==UserScript==
// @name        AtmoBurn Services - Uranium Highlighter
// @namespace   sk.seko
// @license     MIT
// @description For Trade Outposts screens/views highlights all Uranium lines with value "too small" (two levels - alert/warning)
// @updateURL   https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-uranium-highlighter/abs-uranium-highlighter.user.js
// @downloadURL https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-uranium-highlighter/abs-uranium-highlighter.user.js
// @homepageURL https://github.com/seko70/tm-atmoburn/blob/main/abs-uranium-highlighter/README.md
// @match       https://*.atmoburn.com/overview.php?view=15
// @match       https://*.atmoburn.com/outpostsetup.php?fleet=*&station=*
// @version     1.0.0
// @grant       none
// ==/UserScript==

(function () {
    'use strict';

    const ALERT_LIMIT = 300;
    const ALERT_BG_COLOR = 'red';
    const WARNING_LIMIT = 1200;
    const WARNING_BG_COLOR = '#ab8f09';

    function hiliteOutpostsOverview() {
        const mid = document.getElementById('midcolumn');
        if (!mid) return;
        mid.querySelectorAll('table > tbody > tr > td > div').forEach(div => {
            const spans = div.querySelectorAll('span');
            if (spans.length >= 2) {
                if (spans[0].textContent.trim() === 'Uranium') {
                    const lastSpan = spans[spans.length - 1];
                    const units = parseInt(lastSpan.textContent.trim().replace(/,/g, ''));
                    if (units < ALERT_LIMIT) {
                        div.style.backgroundColor = ALERT_BG_COLOR;
                    } else if (units < WARNING_LIMIT) {
                        div.style.backgroundColor = WARNING_BG_COLOR;
                    }
                }
            }
        });
    }

    function hiliteOutpostSetup() {
        const mid = document.getElementById('midcolumn');
        if (!mid) return;
        const cell = [...mid.querySelectorAll("td")].find(td => td.textContent.includes("Uranium"));
        if (!cell) return;
        const units = parseInt(cell.textContent.replaceAll(/\D/g, ''));
        if (units < ALERT_LIMIT) {
            cell.style.backgroundColor = ALERT_BG_COLOR;
        } else if (units < WARNING_LIMIT) {
            cell.style.backgroundColor = WARNING_BG_COLOR;
        }
    }

    try {
        const urlstr = document.URL;
        if (urlstr.match(/atmoburn\.com\/overview\.php\?view=15/i)) {
            hiliteOutpostsOverview();
        } else if (urlstr.match(/atmoburn\.com\/outpostsetup\.php/i)) {
            hiliteOutpostSetup();
        }
    } catch (e) {
        console.error('abs-uranium-highlighter: error', e);
    }

})();
