// ==UserScript==
// @name         AtmoBurn Services - Blueprints Colorizer
// @namespace    sk.seko
// @license      MIT
// @version      0.12.3
// @description  Parses and highlights best/worst/most effective blueprints (per attribute)
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-blueprint-colorizer/abs-blueprint-colorizer.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-blueprint-colorizer/abs-blueprint-colorizer.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-blueprint-colorizer/README.md
// @match      	 https://*.atmoburn.com/blueprints.php?*type=*&subtype=*
// @run-at       document-end
// @grant        none
// ==/UserScript==

/* jshint esversion: 11 */
/* jshint node: true */


(function () {
        'use strict';

        const COLOR = {
            C_BEST: '#22dd00',
            C_GOOD: '#008800',
            C_MID: '#f0f032',
            C_BAD: '#cc7700',
            C_WORST: '#aa0000',
            C_NORES: '#57440f',
            C_HYBRID: '#033545',
            C_WORSEBP1: '#cc0000',
            C_WORSEBP2: '#ff8500',
        }

        const BADGE = {
            FIRST: {icon: '🥇', title: 'best'},
            SECOND: {icon: '🥈', title: 'second-best'},
            //THIRD: {icon: '🥉️', title: 'third-best'},
            LAST: {icon: '🔻', title: 'worst'},
            //DELETE: {icon: '💀', title: 'delete'},
            EFFECTIVE: {icon: '👍', title: 'most-effective'},
            INEFFECTIVE: {icon: '👎🏽', title: 'least-effective'}
        }

        // Attribute types; n=name, r=reverse (less is better if true), c=computed (true/false), s=special (true/false)
        const ATTR = {
            // explicit attributes
            CAPACITY: {n: 'capacity'},
            QUALITY: {n: 'quality/effectiveness'},
            COSTPW: {n: 'cost-per-worker', r: true},
            GUNS: {n: 'guns'},
            BATTERIES: {n: 'batteries'},
            FIGHTERS: {n: 'fighters'},
            TRANSPORT: {n: 'transport'},
            COLONISTS: {n: 'colonists'},
            SCANNER: {n: 'scanner'},
            LAYOUT: {n: 'layout'},
            ENGINES: {n: 'engines'},
            MASS: {n: 'mass', r: true},
            MPE: {n: 'mass-per-engine', r: true},
            POWER: {n: 'power'},
            ENDURANCE: {n: 'endurance'},
            POWERPM: {n: 'power-per-mass'},
            DAMAGE: {n: 'damage'},
            FIRERATE: {n: 'fire-rate'},
            DAMAGEPM: {n: 'damage-per-mass'},
            DAMAGEPC: {n: 'damage-per-cost'},
            IMPACT: {n: 'impact/dispersal'},
            STABILITY: {n: 'stability'},
            STABILITYPM: {n: 'stability-per-mass'},
            STABILITYPC: {n: 'stability-per-cost'},
            PERSONNEL: {n: 'personnel', r: true},
            PRIMARYDMG: {n: 'primary-dmg'},
            PRIMARYRATE: {n: 'primary-rate'},
            SUPPORTBAT: {n: 'support-bat'},
            SUPPORTDMG: {n: 'support-dmg'},
            SUPPORTRATE: {n: 'support-rate'},
            PRICE: {n: 'price', r: true},
            // computed attributes
            CPQ: {n: 'cost-per-worker-and-quality', r: true, c: true},
            PPG: {n: 'price-per-gun', r: true, c: true},
            SPM: {n: 'scanner-per-mass', c: true},
            GPM: {n: 'guns-per-mass', c: true},
            TCPM: {n: 'transport-capacity-per-mass', c: true},
            CCPM: {n: 'colonists-capacity-per-mass', c: true},
            LPM: {n: 'layout-per-mass', c: true},
            EPM: {n: 'endurance-per-mass', c: true},
            PDPS: {n: 'primary-damage-per-second', c: true},
            SDPS: {n: 'support-damage-per-second', c: true},
            PDPC: {n: 'primary-damage-per-cost', c: true},
            SDPC: {n: 'support-damage-per-cost', c: true},
            // special attributes (boolean)
            NORES: {n: 'no-resources', s: true},
            HYBRID: {n: 'is-hybrid', s: true},
            TITLE: {n: 'bp-title', s: true},
        }

// --- helpers ---

        // simple helper, for shorter expressions
        function byId(ele) {
            return document.getElementById(ele);
        }

        // round to 2 decimal points
        function round2(x) {
            return Math.round(100 * x) / 100;
        }

        // compute ratio of two (numerical) values; can be inifinity, or negative, or zero!
        function safeRatio2(attr1, attr2, coef = 1.0) {
            return attr2.val !== 0.0 ? (attr1.val * coef) / attr2.val : Infinity;
        }

        // custom exception for handling missing elements/records/attributes - will be ignored
        class NoElementError extends Error {
            constructor(attr) {
                super(attr.n);
                this.name = 'NoElementError';
            }
        }

        // check caught exepction - ignore (and log) NoElementError, otherwise rethrow
        function ignoreNoElementError(ex) {
            if (ex instanceof NoElementError) {
                console.warn("Ignored:" + ex.message); // log, but ignore
            } else {
                throw ex; // do not swallow other errors
            }
        }

        // safely parse integer from string, ignore commas etc
        function safeNumber(s) {
            return s ? Number(s.trim().replace(/[^\d,.+-].*$/, "").replace(/,/g, '')) : null;
        }

        function getElementsByExactText(elements, text) {
            if (!elements) return null;
            return typeof (text) === 'string'
                ? Array.from(elements).filter(e => e.textContent?.trim() === text)
                : Array.from(elements).filter(e => text.includes(e.textContent?.trim()));
        }

        function getBlueprintRows() {
            return byId('midcolumn').querySelectorAll('form > div > div[id] > div:nth-of-type(2) > div');
        }

        function getTablePrompts(row) {
            return row.querySelectorAll(':scope > div:first-of-type > table > tbody > tr > td:first-of-type');
        }

        function getBlueprintType(row) {
            return row.querySelector(':scope > div:first-of-type > div:nth-of-type(2)')
        }

        function getResourceTablePrompts(row) {
            return row.querySelectorAll(':scope > div:nth-of-type(2) > table > tbody > tr > td:first-of-type');
        }

        function parseResourceTableAttribute(attr, resourcePromptElements) {
            if (!resourcePromptElements) throw new NoElementError(attr);
            return parseBlueprintAttribute(attr, resourcePromptElements, "Price:");
        }

        function isNoRes(resourcePromptElements) {
            if (!resourcePromptElements) throw new NoElementError(ATTR.NORES);
            const isNores = resourcePromptElements.length < 2;
            if (!isNores) return null; // ignore if not set
            const el = resourcePromptElements[0]?.parentNode?.parentNode?.parentNode;
            return {attr: ATTR.NORES, val: isNores, el: el};
        }

        function isHybrid(bpTypeElement) {
            if (!bpTypeElement) throw new NoElementError(ATTR.TITLE);
            const el = bpTypeElement.querySelector(':scope > div:first-of-type');
            const isHybrid = el && el.textContent?.trim().includes(' / ');
            if (!isHybrid) return null; // ignore if not set
            return {attr: ATTR.TITLE, val: isHybrid, el: el.parentNode.parentNode};
        }

        function parseTitle(row) {
            let titleEl = row.querySelector(':scope > div:first-of-type > div:first-of-type')
            if (!titleEl) throw new NoElementError(ATTR.TITLE);
            titleEl = titleEl.querySelector(':scope > a') || titleEl;
            const title = titleEl.textContent?.trim();
            return {attr: ATTR.TITLE, val: title, el: titleEl};
        }

        function parseBlueprintAttribute(attr, promptElements, promptStr) {
            const elements = getElementsByExactText(promptElements, promptStr);
            if (!elements || elements.length < 1) throw new NoElementError(attr);
            const valElement = elements[0]?.nextElementSibling;
            if (!valElement) throw new NoElementError(attr);
            return {attr: attr, val: safeNumber(valElement.textContent), el: valElement};
        }

        function computedAttribute(attr, baseAttr, value) {
            if (!baseAttr || !baseAttr.el) throw new NoElementError(attr);
            if (value === null || value === undefined || isNaN(value)) throw new NoElementError(attr);
            return {attr: attr, val: value, el: baseAttr.el}
        }

        function colorizeBackground(el, color, title = null) {
            if (el && color) el.style.backgroundColor = color;
            if (el && title) el.title = el.title ? `${el.title};   ${title}` : title;
        }

        function colorizeForeground(el, color, title, badge) {
            if (el && color) el.style.color = color;
            if (el && title) el.title = el.title ? `${el.title}\n${title}` : title;
            if (el && badge) el.textContent += ` ${badge}`;
        }

        function isSpecial(x) {
            return x === null || !!x.attr.s;
        }

        function findQualityColor(p) {
            if (p >= 0.95) return COLOR.C_BEST;
            if (p >= 0.80) return COLOR.C_GOOD;
            if (p >= 0.20) return COLOR.C_MID;
            if (p >= 0.05) return COLOR.C_BAD;
            return COLOR.C_WORST;
        }

        function colorizeProperty(attr, val, el, extremes) {
            if (extremes.best === extremes.worst) return; // do not colorize if the are all equal
            const p = 1.0 - (Math.abs((val - extremes.best) / (extremes.best - extremes.worst)));
            let color = attr.c ? null : findQualityColor(p);
            let badge = null;
            let tooltip = `${attr.n}: ${round2(val)}`;
            const percentageOfTop = Math.round(p * 100);
            if (val === extremes.best) {
                badge = attr.c ? BADGE.EFFECTIVE : BADGE.FIRST;
            } else if (!attr.c && val === extremes.second) {
                badge = BADGE.SECOND;
            } else if (val === extremes.worst) {
                badge = attr.c ? BADGE.INEFFECTIVE : BADGE.LAST;
            }
            if (badge) {
                tooltip = `${tooltip} (${percentageOfTop}% of top = ${badge.title})`;
            } else {
                tooltip = `${tooltip} (${percentageOfTop}% of top)`;
            }
            colorizeForeground(el, color, tooltip, badge ? badge.icon : null);
        }

        function findExtremes(bpList, attrKey, lessIsBetter) {
            const values = bpList.map(item => item[attrKey]?.val).filter(v => v != null);
            if (values.length === 0) {
                return {best: null, worst: null};
            }
            let best, second, worst;
            if (lessIsBetter) {
                best = Math.min(...values);
                second = Math.min(...values.filter(v => v > best));
                worst = Math.max(...values);
            } else {
                best = Math.max(...values);
                second = Math.max(...values.filter(v => v < best));
                worst = Math.min(...values);
            }
            return {best: best, second: second, worst: worst};
        }

        function evaluateBlueprints(bpList) {
            if (!bpList || bpList.length < 2) return [];
            const extremes = {};
            const first = bpList[0];
            for (const [attrKey, attrValue] of Object.entries(first)) {
                if (isSpecial(attrValue)) continue;
                extremes[attrKey] = findExtremes(bpList, attrKey, attrValue.attr.r === true);
            }
            return extremes;
        }

        function colorizeBP(bp, extremes) {
            for (const [attrKey, attrValue] of Object.entries(bp)) {
                if (isSpecial(attrValue)) continue;
                colorizeProperty(attrValue.attr, attrValue.val, attrValue.el, extremes[attrKey]);
            }
            if (bp.nores?.val) {
                colorizeBackground(bp.nores.el, COLOR.C_NORES, "No-resource blueprint!");
            }
            if (bp.hybrid?.val) {
                colorizeBackground(bp.hybrid.el, COLOR.C_HYBRID, "Hybrid blueprint!");
            }
        }

        // compare bp1 vs bp2 values; return null (if none is worse) or [worse, better] tuple; smallerValues and smallerValues are vector of values to comapre
        function getWorseOf(bp1, bp2, values1, values2) {
            if (bp1.hybrid?.val || bp2.hybrid?.val) return null; // we do not compare hybrids, yet
            if (bp1.nores?.val || bp2.nores?.val) return null; // we do not compare NO RES blueprints, yet
            const bp1worse = values1.every((value, index) => value <= values2[index]);
            const bp2worse = values2.every((value, index) => value <= values1[index]);
            if (bp1worse && bp2worse) return bp1.price?.val > bp2.price?.val ? [bp1, bp2] : [bp2, bp1]; // if equal, more expensive is worse
            if (bp1worse) return [bp1, bp2];
            if (bp2worse) return [bp2, bp1];
            return null; // not comaparable in general
        }

        function getWorseFacility(bp1, bp2) {
            return getWorseOf(bp1, bp2,
                [bp1.capacity?.val, bp1.quality?.val, bp2.costpw?.val],
                [bp2.capacity?.val, bp2.quality?.val, bp1.costpw?.val]
            );
        }

        function parseFacilityBlueprint(row) {
            const promptElements = getTablePrompts(row);
            const resourcePromptElements = getResourceTablePrompts(row);
            const capacity = parseBlueprintAttribute(ATTR.CAPACITY, promptElements, "Capacity:");
            const quality = parseBlueprintAttribute(ATTR.QUALITY, promptElements, ["Quality:", "Effectiveness:"]);
            const costpw = parseBlueprintAttribute(ATTR.COSTPW, promptElements, "Cost per worker:");
            const price = parseResourceTableAttribute(ATTR.PRICE, resourcePromptElements);
            const cpq = computedAttribute(ATTR.CPQ, costpw, safeRatio2(costpw, quality, 100));
            return {capacity, quality, costpw, price, cpq};
        }

        function getWorseHull(bp1, bp2) {
            return getWorseOf(bp1, bp2,
                [bp1.guns?.val, bp1.batteries?.val, bp1.transport?.val, bp1.colonists?.val, bp1.scanner?.val, bp1.layout?.val, bp1.engines?.val, bp2.mpe?.val],
                [bp2.guns?.val, bp2.batteries?.val, bp2.transport?.val, bp2.colonists?.val, bp2.scanner?.val, bp2.layout?.val, bp2.engines?.val, bp1.mpe?.val]
            );
        }

        function parseHullBlueprint(row) {
            const promptElements = getTablePrompts(row);
            const resourcePromptElements = getResourceTablePrompts(row);
            const guns = parseBlueprintAttribute(ATTR.GUNS, promptElements, "Forward Gun Cluster:");
            const batteries = parseBlueprintAttribute(ATTR.BATTERIES, promptElements, "Gun Battery Mounts:");
            const fighters = parseBlueprintAttribute(ATTR.FIGHTERS, promptElements, "Fighter Capacity:");
            const transport = parseBlueprintAttribute(ATTR.TRANSPORT, promptElements, "Transport Capacity:");
            const colonists = parseBlueprintAttribute(ATTR.COLONISTS, promptElements, "Colonists Capacity:");
            const scanner = parseBlueprintAttribute(ATTR.SCANNER, promptElements, "Scanner Level:");
            const layout = parseBlueprintAttribute(ATTR.LAYOUT, promptElements, "Layout Capacity:");
            const engines = parseBlueprintAttribute(ATTR.ENGINES, promptElements, "Engines:");
            const mass = parseBlueprintAttribute(ATTR.MASS, promptElements, "Hull Mass:");
            const price = parseResourceTableAttribute(ATTR.PRICE, resourcePromptElements);
            const ppg = computedAttribute(ATTR.PPG, guns, safeRatio2(price, guns));
            const gpm = computedAttribute(ATTR.GPM, guns, safeRatio2(guns, mass, 1000));
            const spm = computedAttribute(ATTR.SPM, scanner, safeRatio2(scanner, mass, 1000));
            const tcpm = computedAttribute(ATTR.TCPM, transport, safeRatio2(transport, mass));
            const ccpm = computedAttribute(ATTR.CCPM, colonists, safeRatio2(colonists, mass));
            const lpm = computedAttribute(ATTR.LPM, layout, safeRatio2(layout, mass));
            const mpe = computedAttribute(ATTR.MPE, mass, safeRatio2(mass, engines));
            return {guns, batteries, fighters, transport, colonists, scanner, layout, engines, price, ppg, gpm, spm, tcpm, ccpm, lpm, mpe}
        }

        function getWorseWeapon(bp1, bp2) {
            return getWorseOf(bp1, bp2,
                [bp1.damage?.val, bp1.firerate?.val, bp2.mass?.val],
                [bp2.damage?.val, bp2.firerate?.val, bp1.mass?.val]
            );
        }

        function parseWeaponBlueprint(row) {
            const promptElements = getTablePrompts(row);
            const resourcePromptElements = getResourceTablePrompts(row);
            const damage = parseBlueprintAttribute(ATTR.DAMAGE, promptElements, "Damage Factor:");
            const firerate = parseBlueprintAttribute(ATTR.FIRERATE, promptElements, "Fire Rate:");
            const mass = parseBlueprintAttribute(ATTR.MASS, promptElements, "Mass:");
            const damagepm = parseBlueprintAttribute(ATTR.DAMAGEPM, promptElements, "Damage per Mass:");
            const damagepc = parseBlueprintAttribute(ATTR.DAMAGEPC, promptElements, "Damage per Cost:");
            const price = parseResourceTableAttribute(ATTR.PRICE, resourcePromptElements);
            return {damage, firerate, mass, damagepm, damagepc, price};
        }

        function getWorseProtection(bp1, bp2) {
            return getWorseOf(bp1, bp2,
                [bp1.impact?.val, bp1.stability?.val, bp2.mass?.val],
                [bp2.impact?.val, bp2.stability?.val, bp1.mass?.val]
            );
        }

        function parseProtectionBlueprint(row) {
            const promptElements = getTablePrompts(row);
            const resourcePromptElements = getResourceTablePrompts(row);
            const impact = parseBlueprintAttribute(ATTR.IMPACT, promptElements, ["Impact Rating:", "Dispersal Rating:"]);
            const stability = parseBlueprintAttribute(ATTR.STABILITY, promptElements, "Stability:");
            const mass = parseBlueprintAttribute(ATTR.MASS, promptElements, "Mass:");
            const stabilitypm = parseBlueprintAttribute(ATTR.STABILITYPM, promptElements, "Stability per Mass:");
            const stabilitypc = parseBlueprintAttribute(ATTR.STABILITYPC, promptElements, "Stability per Cost:");
            const price = parseResourceTableAttribute(ATTR.PRICE, resourcePromptElements);
            return {impact, stability, mass, stabilitypm, stabilitypc, price};
        }

        function getWorsePropulsion(bp1, bp2, ignorePrice = true) {
            return getWorseOf(bp1, bp2,
                [bp1.power?.val, bp1.endurance?.val, bp2.mass?.val],
                [bp2.power?.val, bp2.endurance?.val, bp1.mass?.val]
            );
        }

        function parsePropulsionBlueprint(row) {
            const promptElements = getTablePrompts(row);
            const resourcePromptElements = getResourceTablePrompts(row);
            const power = parseBlueprintAttribute(ATTR.POWER, promptElements, ["Power:", "Travel Power:"]);
            const endurance = parseBlueprintAttribute(ATTR.ENDURANCE, promptElements, "Endurance:");
            const mass = parseBlueprintAttribute(ATTR.MASS, promptElements, "Mass:");
            const powerpm = parseBlueprintAttribute(ATTR.POWERPM, promptElements, ["Power per Mass:", "Travel Power per Mass:"]);
            const price = parseResourceTableAttribute(ATTR.PRICE, resourcePromptElements);
            const epm = computedAttribute(ATTR.EPM, endurance, safeRatio2(endurance, mass));
            return {power, endurance, mass, powerpm, price, epm};
        }

        function getWorsePlanetary(bp1, bp2, ignorePrice = true) {
            return getWorseOf(bp1, bp2,
                [bp1.personnel?.val, bp1.primarydmg?.val, bp1.primaryrate?.val, bp1.supportbat?.val, bp1.supportdmg?.val, bp1.supportrate?.val],
                [bp2.personnel?.val, bp2.primarydmg?.val, bp2.primaryrate?.val, bp2.supportbat?.val, bp2.supportdmg?.val, bp2.supportrate?.val]
            );
        }

        function parsePlanetaryBlueprint(row) {
            const promptElements = getTablePrompts(row);
            const resourcePromptElements = getResourceTablePrompts(row);
            const personnel = parseBlueprintAttribute(ATTR.PERSONNEL, promptElements, "Personnel:");
            const primarydmg = parseBlueprintAttribute(ATTR.PRIMARYDMG, promptElements, "Primary Weapon Damage:");
            const primaryrate = parseBlueprintAttribute(ATTR.PRIMARYRATE, promptElements, "Primary Fire Rate:");
            const supportbat = parseBlueprintAttribute(ATTR.SUPPORTBAT, promptElements, "Support Batteries:");
            const supportdmg = parseBlueprintAttribute(ATTR.SUPPORTDMG, promptElements, "Support Weapon Damage:");
            const supportrate = parseBlueprintAttribute(ATTR.SUPPORTRATE, promptElements, "Support Fire Rate:");
            const price = parseResourceTableAttribute(ATTR.PRICE, resourcePromptElements);
            const pdps = computedAttribute(ATTR.PDPS, primarydmg, primarydmg.val * primaryrate.val);
            const sdps = computedAttribute(ATTR.SDPS, supportdmg, supportdmg.val * supportrate.val);
            const pdpc = computedAttribute(ATTR.PDPC, primarydmg, safeRatio2(pdps, price, 1_000_000));
            const sdpc = computedAttribute(ATTR.SDPC, supportdmg, safeRatio2(sdps, price, 1_000_000));
            return {personnel, primarydmg, primaryrate, supportbat, supportdmg, supportrate, price, pdps, sdps, pdpc, sdpc};
        }

        function parseGenericBlueprint(row) {
            const resourcePromptElements = getResourceTablePrompts(row);
            const bpTypeElement = getBlueprintType(row);
            const nores = isNoRes(resourcePromptElements);
            const hybrid = isHybrid(bpTypeElement);
            const title = parseTitle(row);
            return {nores, hybrid, title};
        }

        function colorizeWorseBlueprint(worstRegister, worsebp, betterbp) {
            console.log("colorizeWorseBlueprint - worse/better: ", worsebp, betterbp);
            if (worsebp.price.val < betterbp.price.val) {
                if (!worstRegister.has(worsebp.title.val)) { // ignore if already have better BP
                    colorizeForeground(worsebp.title.el, COLOR.C_WORSEBP2, `This BP is worse than ${betterbp.title.val}, but has lower price (resources not compared)`);
                }
            } else {
                colorizeForeground(worsebp.title.el, COLOR.C_WORSEBP1, `This BP is worse than ${betterbp.title.val} (resources not compared)`);
                worstRegister.add(worsebp.title.val);
            }
        }

        function colorizeBlueprints(parseFn, worseFn) {
            const allRows = getBlueprintRows();
            if (!allRows || allRows.length === 0) return;
            const bpList = [];
            for (const row of allRows) {
                try {
                    bpList.push({...parseFn(row), ...parseGenericBlueprint(row)});
                } catch (e) {
                    ignoreNoElementError(e);
                }
            }
            const extremes = evaluateBlueprints(bpList);
            for (const bp of bpList) {
                colorizeBP(bp, extremes);
            }
            if (worseFn && bpList.length > 1) {
                const worstRegister = new Set();
                for (let i = 0; i < bpList.length; i += 1) {
                    for (let j = i + 1; j < bpList.length; j += 1) {
                        const result = worseFn(bpList[i], bpList[j]);
                        if (!result) continue;
                        colorizeWorseBlueprint(worstRegister, ...result);
                    }
                }
            }
        }

        const urlstr = document.URL;
        if (urlstr.match(/type=[123]&subtype=/i)) {
            colorizeBlueprints(parseFacilityBlueprint, getWorseFacility);
        } else if (urlstr.match(/type=4&subtype=/i)) {
            colorizeBlueprints(parseHullBlueprint, getWorseHull);
        } else if (urlstr.match(/type=5&subtype=/i)) {
            colorizeBlueprints(parseWeaponBlueprint, getWorseWeapon);
        } else if (urlstr.match(/type=6&subtype=/i)) {
            colorizeBlueprints(parseProtectionBlueprint, getWorseProtection);
        } else if (urlstr.match(/type=7&subtype=/i)) {
            colorizeBlueprints(parsePropulsionBlueprint, getWorsePropulsion);
        } else if (urlstr.match(/type=8&subtype=/i)) {
            colorizeBlueprints(parsePlanetaryBlueprint, getWorsePlanetary);
        }

    }
)();
