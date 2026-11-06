# Revision manual validation packet

Status: **NOT RUN** on physical Android, with TalkBack, or with recruited novices.
This is a self-contained follow-up protocol authored after the PR #38 review;
it does not claim to reproduce the unavailable specialist synthesis verbatim.
An owner supplies the device, participants and consent. Record observations,
including failures and incomplete tasks, before changing these statuses.

## Build identity and preparation

Use the production build from the PR head or merged commit being evaluated.
Record that exact SHA, rather than just a branch name. Run in an isolated
checkout with Node from `.nvmrc` and a disposable test origin/profile.

```powershell
$validationSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the checkout' }
$validationSha
node --version
npm ci --include=dev
```

Check each command's result before continuing:

```powershell
npm run build:web
npm run verify:web:runtime
npm run verify:pwa
```

The artifact is `.vercel/output/static`. Use `build:web`, which excludes test
mutators, for human sessions. Record browser/OS versions, device model, viewport,
display/text settings, network state and whether the app is installed. A Vercel
preview marked Ready is a deployment observation; separately record whether the
tester could open that exact build. Do not establish a new public host as part
of this packet without the owner's distribution/asset-clearance decision.

For local Android testing, connect the owner's USB-debugging device. In a
separate terminal, serve the already-built artifact:

```powershell
node scripts/browser-regression.mjs --serve-only 8081
```

In the other terminal:

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
```

Open `http://localhost:8081/` in Android Chrome. The loopback URL supports
service workers through the USB forwarding. Confirm `window.isSecureContext`
and a controlling service worker in remote Chrome DevTools before the PWA
cases. If either is absent, record the failed prerequisite and its cause.
Use the same origin and port throughout. At cleanup, stop the owned server
with Ctrl+C and run `adb reverse --remove tcp:8081`.

Disposable save files in [manual-fixtures](manual-fixtures/) support owner-led
checks without a full campaign. `field-and-battle.json` has a living lead,
fainted reserve and Phoenix Ash; `epilogue-owed.json` already contains the trial
rewards and an undelivered ending. Import them through the real Lantern menu.
Keep fixtures out of the unguided novice sessions. Never use personal campaigns
for replacement, storage-fault or import checks.

## Physical Android checks

Record PASS, FAIL or BLOCKED, the build SHA, steps and observed result for each.
An unexplained crash, lost progress, unauthorized save write or duplicate
transaction is a failure requiring investigation.

| Case | Procedure | Expected evidence |
|---|---|---|
| Install and cold launch | Install from Chrome's app menu, close the app, launch from its icon. | Correct title/icon; production build opens without a browser error. |
| Genuine offline launch | First wait for Available offline. Stop the desktop server or disconnect USB, then enable airplane mode and cold-launch the installed app. | Game/assets load; Save, close and Continue retain a disposable campaign. USB forwarding must not provide a hidden live server during this check. |
| Writer ownership | Keep window A open. Open the same origin in window B and try Save and a valid Import there. | B reports read-only; its live campaign and every durable slot remain unchanged. A can still save/import. After closing A and reloading B, B can save. Capture before/after slot bytes through remote DevTools if available. |
| Replacement consent | With a saved campaign, activate New Game, cancel by the safe button and Escape/back where available, reload, Continue. Then explicitly confirm replacement on disposable data. | Cancellation preserves the campaign. Confirmed new play saves through normal backup rotation. |
| Shop and termination | Buy once, sell once, then close immediately and Continue. Try an unaffordable purchase. | One item/price change per accepted activation; completed transactions survive reopening; rejected purchases change nothing. |
| Battle controls | Check portrait plus 844x390, 667x375 and 568x320 emulation, and both real device orientations. Open every submenu and scroll it with a thumb. | All six applicable commands, Back and enabled switch/item choices can be fully exposed and activated; no clipping behind adjacent regions. Record actual device dimensions separately from emulation. |
| Turn and status feedback | Resolve a turn and a win/loss. Inspect the ordered recap; scroll it if needed. Observe an applied status until it clears. | Recap is visible, preserves order, and leaves actions usable. Current status is readable. |
| Item scope | Import the field fixture. Inspect battle Item, then use the field Pack on the fainted reserve. | Battle excludes Phoenix Ash; field use consumes one Ash, revives only the chosen reserve at half HP. |
| Ending continuity | Import the owed-ending fixture. Cancel the epilogue, Save, reload and Continue; then finish it and reload again. | It is replayed until delivered. Crowns and Thorn Sigils do not increase on presentation. A delivered epilogue stays delivered. |
| Input and settings | Hold a direction while entering a dialog, release and dismiss it. Toggle Sound, reload and inspect it again. | No phantom movement; the sound preference survives reload. Check D-pad centers and diagonal boundaries on the actual display. |
| Framing and readability | Open/close overlays near the top of a map. Check bright/dark scenes and enlarged system text. | Record any disruptive camera jump, illegible decision text, occlusion or loss of usable controls. Do not convert lack of complaint into a universal perception claim. |

### Controlled update and failed-save case

This uses two artifact revisions with identical application code: A is the
production build above; B changes only an HTML marker and the generated worker.
It tests the actual installed service-worker/update path on the device.

1. On build A, save disposable progress. Use remote Chrome DevTools at
   `chrome://inspect/#devices` and enable Preserve log.
2. Install this reversible fault in that disposable page's console:

   ```javascript
   window.validationOriginalSetItem = Storage.prototype.setItem;
   Storage.prototype.setItem = function (key, value) {
     if (key.startsWith("reliquary.save.")) {
       throw new DOMException("Validation quota fault", "QuotaExceededError");
     }
     return window.validationOriginalSetItem.call(this, key, value);
   };
   ```

3. Walk to a new position and open the inn's Rest offer. Record live position,
   inventory and the original durable JSON. Keep the offer uncommitted.
4. Stop the desktop server. In the checkout's PowerShell terminal, mark B:

   ```powershell
   $validationIndex = '.vercel/output/static/index.html'
   $validationHtml = Get-Content -LiteralPath $validationIndex -Raw
   $validationMarker = '<meta name="manual-validation-update" content="B">'
   Set-Content -LiteralPath $validationIndex -Value ($validationHtml.Replace('<head>', '<head>' + $validationMarker)) -Encoding utf8 -NoNewline
   node scripts/build-pwa.mjs
   ```

5. After that command succeeds, restart the same server. Request an update in
   the device console:

   ```javascript
   await (await navigator.serviceWorker.getRegistration()).update();
   ```

6. Wait for activation, briefly hide/restore the app, and confirm that the
   consequential offer remains open without reloading. Cancel the offer.
   The failed required save must now pause the update: visible persistent
   feedback, no reload, live state intact and old durable bytes unchanged.
7. Restore storage with
   `Storage.prototype.setItem = window.validationOriginalSetItem`, delete the
   temporary property, and wait for retry. Observe one reload in the preserved
   navigation log. Confirm the B marker in DevTools, then Continue and compare
   restored progress with the recorded live state.
8. Record the result. Rebuild with `npm run build:web` afterward to remove the
   marker from generated artifacts. The marker/fault are fixtures, not changes
   to production source and not an asset-clearance or release approval.

## TalkBack route and product-scope decision

Enable TalkBack on the device and record its version/settings. Starting at the
title, use spoken labels and screen-reader gestures to Continue, open Lantern,
inspect Party/Lore, inspect Reliquary states, change Sound, select a shop row,
buy/sell, and cancel an offer. Record each spoken name, selected state, focus
return, missing announcement and any task that required sighted help.

Then attempt to locate an NPC, navigate to an exit and identify nearby world
objects without visual assistance. **Full nonvisual world traversal is not
established.** If the canvas world provides insufficient information, record
that limitation and the blocked tasks. The owner must decide whether the
product promises full nonvisual play and scope the required route/navigation
work; a passing menu check cannot close S15.

## Five-novice unguided study

The owner recruits five people unfamiliar with this build, obtains consent to
observe, and separately asks permission for any recording. Use anonymous IDs
P01-P05; keep consent/contact records outside the repository. Explain that the
software is being tested and that participants can stop. Ask them to think
aloud. Do not explain controls, map directions, terminology or winning tactics.
Use the same production SHA and a fresh disposable profile/origin for each.
Allow about 35 minutes and record tasks left incomplete when time expires.

Read these intent cards one at a time; they do not prescribe UI operations:

1. Begin a journey and find out what your character is trying to do.
2. Obtain your first companion. Explain what you expect the final choice to do.
3. Find an encounter and resolve it. Explain what each side did in the last turn.
4. Find how you would restore a hurt companion. Use an item if one is needed;
   otherwise explain your choice without forcing a no-effect use.
5. Find a merchant, buy something affordable, and sell one owned item.
6. Find your collection and your companion's progress; explain the displayed
   states and Lore. Find how to turn sound off.
7. Preserve your journey, leave and return to it. Decide against replacing it
   with a new journey and keep the saved campaign.

Mark each task independent, assisted, unsuccessful or not attempted. If a
participant requests help, record the point and exact assistance before
continuing; the task is no longer independent. Do not seed saves or move the
character through developer tools during this study. Record stalls, mistaken
expectations, repeated actions and the player's own explanation of outcomes.

Afterward ask: What was your goal? What happened in the last battle? Which
choices felt permanent? What did Lore and the collection states mean? Where
did you feel uncertain or lose progress? Ask about Phoenix Ash, Cael or camera
movement only if the participant encountered them, and record that exposure.

Any observed data loss, unintended replacement, duplicate purchase/sale or
unrecoverable task blocker reopens the corresponding finding. Repeated opening
or battle misunderstandings require a design investigation. Five sessions
provide observations for this build, not a population-level usability claim.

## Result form

```text
Session/device or anonymous participant ID:
Build SHA / artifact origin / production runtime gate result:
Date / device / Android / Chrome / TalkBack versions:
Orientation, viewport, display/text size, install and network state:
Case or task:
Prerequisites met:
Exact steps and expected result:
Observed result / PASS, FAIL, BLOCKED or task disposition:
Assistance, exposure, interruption or reason not attempted:
Save bytes or state before/after (disposable data only):
Screenshot/log reference and timestamp:
Related S-ID / follow-up owner:
```

Store the completed anonymized forms and exact-build evidence together. Keep
raw participant recordings/private consent material out of public PR artifacts.
