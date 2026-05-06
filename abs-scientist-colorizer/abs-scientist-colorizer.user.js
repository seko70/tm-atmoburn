// ==UserScript==
// @name         AtmoBurn Services - Scientists Colorizer
// @namespace    sk.seko
// @license      MIT
// @version      1.1.0
// @description  Parses and highlights best skill for every scientis and top 5 scientists for all skills
// @updateURL    https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-scientist-colorizer/abs-scientist-colorizer.user.js
// @downloadURL  https://github.com/seko70/tm-atmoburn/raw/refs/heads/main/abs-scientist-colorizer/abs-scientist-colorizer.user.js
// @homepageURL  https://github.com/seko70/tm-atmoburn/blob/main/abs-scientist-colorizer/README.md
// @match      	 https://*.atmoburn.com/overview.php?view=13
// @match      	 https://*.atmoburn.com/scientists.php?colony=*
// @match      	 https://*.atmoburn.com/sci_research.php*
// @run-at       document-end
// @grant        none
// ==/UserScript==

/* jshint esversion: 11 */
/* jshint node: true */


(function () {
        'use strict';

        const COLOR = {
            C_GREY: '#333333',
            C_RED: '#cc0000',
            C_TOP: {
                0: '#33cc33',
                1: '#009900',
                2: '#336600',
                3: '#225500',
                4: '#1f4400'
            }
        }

        // simple helper, for shorter expressions
        function byId(ele) {
            return document.getElementById(ele);
        }

        // get top N highest values per column; example output:
        // [{ row: 2, col: 0, value: 98, rank: 0 },{ row: 5, col: 0, value: 91, rank: 1 },...]
        function getTopNPerColumn(valuesMatrix, topN = 5) {
            const result = [];
            const rowCount = valuesMatrix.length;
            const colCount = valuesMatrix[0]?.length ?? 0;
            for (let col = 0; col < colCount; col++) {
                const columnItems = [];
                for (let row = 0; row < rowCount; row++) {
                    const value = valuesMatrix[row][col];
                    if (typeof value === 'number' && !Number.isNaN(value)) {
                        columnItems.push({row, col, value});
                    }
                }
                // unique values in column, sorted from highest
                const topValues = [...new Set(columnItems.map(item => item.value))].sort((a, b) => b - a).slice(0, topN);
                // all cells with value in "top-N"
                for (const item of columnItems) {
                    const rank = topValues.indexOf(item.value); // 0 = highest, 1 = 2nd highest, ...
                    if (rank !== -1) {
                        result.push({row: item.row, col: item.col, value: item.value, rank: rank});
                    }
                }
            }
            return result;
        }

        function colorizeScientists() {
            const mid = byId("midcolumn");
            if (!mid) return;
            // find first "sci" row
            const firstSciRow = mid.querySelector('div[id^="sciRow"]:not(#sciRowBest)');
            // all scientist rows
            const rowElems = [...firstSciRow.parentNode.querySelectorAll(':scope > div[id^="sciRow"]')].filter(div => /^sciRow\d+$/.test(div.id));
            // all skill rows
            const rows = rowElems.map(row => [...row.children].filter(child => child.tagName === 'DIV')[1]).filter(Boolean);

            // create matrix of "elements" and adequate matrix of "values"
            const elementsMatrix = [];
            const valuesMatrix = [];
            for (const row of rows) {
                const elements = [...row.querySelectorAll(':scope > div')];
                elementsMatrix.push(elements);
                const values = elements.map(val => Number(val.textContent?.trim()));
                valuesMatrix.push(values);
            }

            // colorize best value skill (all best values) for the row (i.e. for the scientist)
            valuesMatrix.forEach((row, rowIndex) => {
                const maxValue = Math.max(...row.slice(1)); // ignore ING for best scientist skill
                const maxIndexes = row.map((value, index) => index > 0 && value === maxValue ? index : -1).filter(index => index !== -1);
                for (const i of maxIndexes) {
                    elementsMatrix[rowIndex][i].style.border = `1px solid ${COLOR.C_GREY}`;
                    //elementsMatrix[rowIndex][i].style.background = COLOR.C_GREY;
                }
            });

            // colorize top 5 best skill values for every skill
            const bestRows = new Set();
            const topCells = getTopNPerColumn(valuesMatrix, 5);
            topCells.forEach(({row, col, rank}) => {
                const el = elementsMatrix[row][col];
                if (el) {
                    el.style.color = COLOR.C_TOP[rank];
                    el.style.className = "bold";
                    //el.style.outline = '1px solid yellowgreen';
                    bestRows.add(row);
                }
            });

            // mark rows that are NOT in any top 5 skills
            rowElems.forEach((rowElem, index) => {
                if (!bestRows.has(index)) {
                    rowElem.querySelector(':scope > div:first-of-type > div:first-of-type > span').style.color = COLOR.C_RED;
                }
            });
        }

        colorizeScientists();
    }
)();
