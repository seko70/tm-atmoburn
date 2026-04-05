// ==UserScript==
// @name         Debug Research - avgImpact
// @namespace    sk.seko
// @version      1.0.0
// @description  Logs computed avgImpact values on research screen whenever reaserch goal is selected
// @match        https://*.atmoburn.com/sci_research.php
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
  const w = unsafeWindow;

  function patch() {
    const fn = w.setTeamSkills;
    if (typeof fn !== 'function') return false;
    if (fn.__tm_patched) return true;

    const src = fn.toString();

    let patchedSrc = src.replace(
      /\/\/console.log\(avgImpact\);/,
      (m, rhs) =>
				`const row = {label: byId('item').options[byId('item').selectedIndex].text + " / " + byId('focus').options[byId('focus').selectedIndex].text};\n` +
				`[...avgImpact]\n` +
				`  .sort((a, b) => a[0].localeCompare(b[0]))\n` +
				`  .forEach(([field, value]) => {\n` +
				`    row[field] = Number(value.toFixed(3));\n` +
				`  });\n` +
				`console.log(Object.keys(row).join(";"));\n` +
				`console.log(Object.values(row).join(";"));\n`
    );

    if (patchedSrc === src) {
      console.warn('[TM] Pattern not found - patch not applied.');
      return true;
    }

    // From "function setTeamSkills(" make anonymous "function("
    const anon = patchedSrc.replace(/^function\s+setTeamSkills\s*\(/, 'function(');

    // IMPORTANT: new Function runs non-strict
    const newFn = (new Function('return (' + anon + ');'))();

    newFn.__tm_patched = true;
    w.setTeamSkills = newFn;

    //console.log('[TM] setTeamSkills() patched. itemDefinitions will be logged for every call.');
    return true;
  }

  const t = setInterval(() => {
    if (patch()) clearInterval(t);
  }, 200);
})();