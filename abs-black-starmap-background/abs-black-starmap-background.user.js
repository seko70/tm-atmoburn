// ==UserScript==
// @name         Black Starmap Background
// @namespace    sk.seko
// @description  Changes background image to a black one in WarFacts/Atmoburn Starmap; original by guardian
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-black-starmap-background/abs-tag-manager.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-black-starmap-background/abs-tag-manager.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-black-starmap-background/README.md
// @license      MIT
// @match        https://*.atmoburn.com/extras/view_universe.php*
// @version      2.0.2
// @grant        none
// ==/UserScript==

document.getElementById("starMapContainer")?.style.backgroundImage = "none";
document.body.style.backgroundColor="#000000";
