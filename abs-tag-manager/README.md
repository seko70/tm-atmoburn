# AtmoBurn Services - Tag Manager
This is Tampermonkey (https://www.tampermonkey.net/) script for Atmoburn game (https://www.atmoburn.com/).

## What it does
Simple colony and fleet tagging script. Just that. See example screenshot bellow.

## How to install
- You should have Tampermonkey (https://www.tampermonkey.net/) or equivalent
- Open `abs-tag-manager.user.js` file and go "Raw" in your browser - Tampermonkey should offer you "Install" button - and thats it.

## How to use
 1. Open colony or fleet screen.
 2. Use ALT-T for tag management
 3. Add/remove tag(s)
 4. Check your colony and/or fleet menu (left/right column) - your tags should be visible now.
 5. More to come... see TODO list.  

## How it is implemented
- No remote calls, just screen parsing (your colony/fleet ID), local storage (tags) and (of course) modifying current page (adding tags).
- This script uses only local (script) storage, i.e. GM_setValue/GM_getValue. Once installed, in your Tampermonkey menu / Storage tab you can see your data in JSON format. You can even edit it.
- You don't lose your data when your browser history/cookies get deleted. You may lose your data when you **unistall** the script (or browser).

## Status
> [!WARNING]
> This is still under development. Beware!

## Known bugs
- Tags are never removed from storage, ever

## TODO list
- Add icon to open Tag Manager, not only ALT-T
- Show tags in other contexts - colony/fleet overview, global targets etc
- Add filtering by tags - hide all NOT having the tag, hide all HAVING the tag
- More colors/custom colors, customize size/style for tags
- AUTOTAGS! Add criteria for autotagging, for example
  - when happines < 40 then add "Health" red tag
  - when iron < 10k then add "RES" red tag
  - when gold > 100k then add "RES" green tag
  - when fleet has less then 10% of max fuel then add "OOF" (out-of-fuel) tag
  - and remove tags as well when condition is not met

## Screenshots
As an example:
![Example screenshot](doc/Screenshot1.png)