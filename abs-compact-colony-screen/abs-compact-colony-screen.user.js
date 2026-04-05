// ==UserScript==
// @name         AtmoBurn Services - Compact Colony Screen
// @namespace    sk.seko
// @description  Hides various unnecessary (usually) controls from Colony screen - rename buttons, "Established Capital" title etc
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-compact-colony-screen/abs-compact-colony-screen.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-compact-colony-screen/abs-compact-colony-screen.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-compact-colony-screen/README.md
// @license      MIT
// @match        https://*.atmoburn.com/*.php?colony=*
// @version      0.0.1
// @grant        none
// ==/UserScript==

const midcolumn = document.getElementById('midcolumn')
if (midcolumn) {

		const renameDiv = midcolumn.querySelector(':scope > div.rename');
		if (renameDiv) renameDiv.remove();

		const toptitle = midcolumn.querySelector(':scope > div.toptitle.home');
		if (toptitle) toptitle.remove();

}
