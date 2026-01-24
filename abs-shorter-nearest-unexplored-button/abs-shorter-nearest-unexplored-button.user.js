// ==UserScript==
// @name           AtmoBurn Services - Shorter "Nearest unexplored system" Button
// @namespace      sk.seko
// @description    Make button "Nearest unexplored system" shorter and yellow.
// @updateURL      https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-shorter-nearest-unexplored-button/abs-shorter-nearest-unexplored-button.user.js
// @downloadURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-shorter-nearest-unexplored-button/abs-shorter-nearest-unexplored-button.user.js
// @homepageURL    https://github.com/seko70/tm-atmoburn/blob/main/abs-shorter-nearest-unexplored-button/README.md
// @license        MIT
// @match          https://*.atmoburn.com/fleet.php*
// @match          https://*.atmoburn.com/fleet/*
// @grant          none
// @version        1.0.1
// ==/UserScript==

const nearestEl = document.getElementById("exploreNearest");
if (nearestEl) {
	nearestEl.setAttribute("value", "Nearest");
	nearestEl.style.color = 'Yellow';
	nearestEl.title = "This is shorter name for 'Nearest unexplored system' button";
}
