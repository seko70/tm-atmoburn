# AtmoBurn Services - AWACS
This is Tampermonkey (https://www.tampermonkey.net/) script for Atmoburn game (https://www.atmoburn.com/).

## What it does
UI for abs-archivist - display nearest fleets, colonies, rally points, wormholes etc in various contexts; uses data produced by abs-archivist.
> [!NOTE]
> You need **abs-archivist** script to create/collect the data!

## How to install
- You should have Tampermonkey (https://www.tampermonkey.net/) or equivalent
- Open `abs-awacs.user.js` file and go "Raw" in your browser - Tampermonkey should offer you "Install" button - and thats it.

## How to use
- Open colony or fleet screen.
- Click on [AWACS] in the top menu - all presentable records are ... presented.
  - Note "Reference point" in the top left corner - it's a base (coordinates) for distance and direction info; it can be changed, or changes automaticall when appropriate
- Use filterig buttons - by "Relation" and/or by "Type", for example:
  - Press button to show/hide specific records
  - Press CTRL-button to show ONLY this specific records
- Use header text filters to filter by name, player, ...
- Use sorting arrow in some headers to sort
- Records actions:
  - Press "compass" icon 🧭 (if present) to open detail screen (your fleet, or your colony)
  - Press "laynch" icon 🚀️ (if present) to move your fleet to selected record (colony, enemy fleet...)
  - Press "pointing hand" icon 👆 (if present) to make it reference point
- In general, there are tooltips with details and/or explanation what it is or what id does
- More to come... see TODO list.

## How it is implemented
- No remote calls, no screen parsing - just UI for data (already) stored in you local (browser) IndexedDB called "AtmoBurnServicesDB".
- Uses 3rd party "Tabulator" library (https://tabulator.info/)

## Status
> [!WARNING]
> This is still under development. Beware!

## Known bugs
- When you change / reload your parent page, AWACS window is non-functional, in general. At least I can it can be detected (document.opener?) and reset

## TODO list
- Add column "Shortest path" with optimal path using Wormholes (pre-calculated, Dijkstra/A-Star algorithm)
- Add column "Shortest warp path" with optimal path using known refuel points for your fleet (with know range/maximal range), also using Wormholes
- Export current table to xls/csv/spreadsheet
- Colorize Distance (background?) by out-of-range (red), in maximal-range (orange), in-range (green)
- Implement upper-right "Last update: __updateInfo__" - should be timestamp(s) of your last visit of Rally Points page, Fleet/Colony overview page etc
- Maybe a decent coloring (backgroud) by record type for better owerview
- Add button/action for "map" (show on map)
- Show RP comment as well (as tooltip, or searchable column)
- Navigate to RP when clicked (RP page, not map - this is different action)

## Screenshots
Example1 - all records (colonies, fleets, rally points, wormholes...) - by default, sorted by distance from reference point (in this case, one of my fleets):
![Example screenshot](doc/Screenshot1.png)

Example2 - only my colonies (note that rows - and some columns as well - are hidden automatically):
![Example screenshot](doc/Screenshot2.png)