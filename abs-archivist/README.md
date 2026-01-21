# AtmoBurn Services - Tag Manager
This is Tampermonkey (https://www.tampermonkey.net/) script for Atmoburn game (https://www.atmoburn.com/).

## What it does
Parses and stores various entities while browsing AtmoBurn:
 - colonies (yours, or scanned)
 - fleets (yours, or scanned)
 - rally points
 - and more

See also `abs-awacs.user.js` script for in-game UI.

## How to install
- You should have Tampermonkey (https://www.tampermonkey.net/) or equivalent
- Open `abs-archivist.user.js` file and go "Raw" in your browser - Tampermonkey should offer you "Install" button - and thats it.

## How to use
This script works in background - it has not in-game UI.

But you can see some actions for this script in Tampermonkey menu (while on "active" page, for instance colony or fleet screen).
(TBD - explain menu items, like "Dump fleets" sounds dangerous - but it isn't; and "Clear colonies" etc)

Primary usage for this script is using the data it collects/generates ... in other scripts.
The data are stored in browser's IndexedDB, and the name is "AtmoBurnServicesDB".

> [!TIP]
> For browsing the data, querying, and even editing I use **Kahuna** - https://chromewebstore.google.com/detail/kahuna/ilafpdbgcaodnkdklgemggjamhpdjile
> Also I use for **backup/restore** my data (in JSON format), since deleting browsing history and various system cleaners tend to delete IndexedDB as well - sometimes.

## How it works / how it is implemented
When you open a page or dialog, it may be parsed/webscrapped, and data are stored locally (browser's IndexedDB).
Sometimes, when global coordinates are not displayed (and not known already), API call is made to get global coordinates by systemId or worldId.
Received data is stored/cached in DB as well (trying to be nice to server) and never againe requested from server.

> [!NOTE]
> This script does not make other queries except API calls mentioned above. 

What information it parses/stores:
- Colonies (name, ID, global coordinates, system, world, pop, size, player, relation)
  - your colonies from Colony (detail) page
  - any colonies from "Scan" window (from fleet, or from colony)
  - any colonies from "Fuel Bunker" window
- Fleets (name, ID, signature, global coordinates, system, world, tonnage, ships, player, relation)
  - your fleets from Fleet (detail) page
  - your fleets from Fleet overview page
  - any fleets from "Scan" window (from fleet, or from colony)
  - any fleets from "Scan Network" page
- Signatures (same as Fleets, except ID) - stored separately if fleet ID is not known
- Rally points (name, ID, global coordinates, descripion, subtype, relation)
  - from Rally points DB page (your and empire)
- Wormholes (name, ID, system, global coordinates, target system, target coordinates)
    - from Wormholes search dialog in Intel/Known Universe menu

> [!WARNING]
> You may lose your data when your browser history/data get deleted. See "Backup/Restore" part elsewhere in this document.

## Status
> [!WARNING]
> This is still under development. Beware!

## Known bugs
- (TBD)

## TODO list
- Parse "side" menus - Fleet list / Colony list - in order do delete non-existing colonies/fleets; for now they are deleted only when "overview" page gets parsed
- Fix "signature" parsing and consolidate known/unknow fleets (mapping signature to fleet ID if known)
- Use Map3D db to get (and store) cheap info
  - global coordinates for system/world info (decrease API calls)
  - fleet info without opening/parsing Sensor Net or Scan screes
  - many more :-)
- Other fleets are not deleted, ever. Trying to formulate criteria/events for deleting the fleet (battle logs, expired after X days when not updated, etc) in general.
- Many more...
