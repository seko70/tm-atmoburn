# AtmoBurn Services - Black Starmap Background
This is Tampermonkey (https://www.tampermonkey.net/) script for Atmoburn game (https://www.atmoburn.com/).

## What it does
For Trade Outposts screens/views highlights all Uranium lines with value "too small" (two levels - alert/warning)

## How to install
- You should have Tampermonkey (https://www.tampermonkey.net/) or equivalent
- Open `abs-uranium-highlighter.user.js` file and go "Raw" in your browser - Tampermonkey should offer you "Install" button - and thats it.

## How to use
Open Trade Outposts screen or Manage Outpost screen (on Trade station) and you should see red or orange background for lines with Uranium under the limit.
For limits, see script constats, currently:
```
    const ALERT_LIMIT = 300;
    const WARNING_LIMIT = 1200;
```