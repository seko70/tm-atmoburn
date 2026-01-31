// ==UserScript==
// @name         Eliminate Empty Space Above Menus
// @namespace    sk.seko
// @description  Eliminates the empty space above the fleet and colony menus (original by Mario)
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-eliminate-empty-space-above-menus/abs-eliminate-empty-space-above-menus.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-eliminate-empty-space-above-menus/abs-eliminate-empty-space-above-menus.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-eliminate-empty-space-above-menus/README.md
// @license      MIT
// @match        https://*.atmoburn.com/*
// @version      1.2
// @grant        none
// ==/UserScript==

const el = document.getElementsByClassName("sidecolumn");
if (el && el.length) {
    Array.from(el).forEach(sidemenu => {if (sidemenu) sidemenu.style.marginTop = "0px";});
}
