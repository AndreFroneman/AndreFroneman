# HOLLOW CORDON

*Marrow Falls is sealed. You are inside.*

Hollow Cordon is an original 2D side-view zombie survival shooter. It's built for grim atmosphere and weighty, physical combat. After the Pale Fever outbreak, the military sealed the river city of Marrow Falls behind **Cordon Directive 9**. You play one of four survivors trapped on the wrong side of the line. You fight through hospitals, precincts, steelworks, farms, subway tunnels and the checkpoint where it all went wrong.

- **10 maps**, each with its own lighting, weather, layout and story notes, including three long bunker levels
- **30 weapons**: melee, pistols and revolvers, SMGs, pump/double/semi/auto shotguns, assault, battle and sniper rifles, and machine guns
- **7 weapon attachments** you fit at the workbench: suppressor, weapon light, laser, red-dot, 4× scope, extended magazine and foregrip
- **10 infected types** with distinct looks, movement, health and behaviour
- **Location-based damage and heavy gore**: dismemberment, head bursts, gutting, intestines, gibs, persistent blood, and ragdoll corpses you can keep shooting
- **5 modes**: a seven-chapter story **Campaign**, **Blackout** (fight your way out of a pitch-dark bunker), endless **Survival** (with save & continue), **Sandbox**, and a full visual **Map Creator**
- **Keyboard & mouse, gamepad or touch**: remappable keys, a standard controller layout with twin-stick aiming and full menu navigation, and on-screen twin-stick touch controls on phones and tablets
- **Runs everywhere**: in the browser, as an installable web app, as a desktop app (Windows, macOS, Linux) and as an **Android app**

All art and audio are generated procedurally at runtime, so the game ships no image or sound files.

### What's new in Version 2
- **Blackout mode:** three long bunker levels in near-total darkness. Your flashlight is weak and runs on a battery; sometimes the only way to see is to fire and look while the muzzle flash lights the corridor.
- **Weapon attachments:** suppressors, weapon lights, laser sights, red-dot and 4× optics, extended magazines and foregrips, each shown on the gun model and changing its stats.
- **Six new guns,** including a suppressed pistol and SMG, a pistol with a built-in light, a carbine, a tactical shotgun and a DMR.
- **Window climbing fixed:** climbing through a window is a smooth three-part climb that always lands on a floor. If there's nowhere to land on the far side, you get no prompt instead of being teleported.
- The desktop build is named **Version 2**: `Hollow-Cordon-Version-2.exe` (portable) and `Hollow-Cordon-Version-2-Setup.exe` (installer).
- **Mobile version:** the game plays on phones and tablets, in the browser or as the Android app `Hollow-Cordon-Version-2-Android.apk`, with twin-stick touch controls and a phone-sized layout (see *Phones & tablets* below).

---

## Launching the game

The game is plain HTML5 + JavaScript. It needs **no install, no dependencies and no build step**. You can run it as a desktop app, on a phone or tablet (Android app or browser), as an installed web app, or straight from the folder.

> **Get the files first.** Until the pull request is merged, the game lives on the branch `claude/gracious-brahmagupta-57j7xi`, not on `main`. Clone that branch, or use GitHub's **Code → Download ZIP** while viewing it, and run everything from the `hollow-cordon` folder inside it.
> ```bash
> git clone -b claude/gracious-brahmagupta-57j7xi https://github.com/AndreFroneman/AndreFroneman.git
> ```

### Desktop app (Windows, macOS, Linux)
`hollow-cordon/desktop/` wraps the game in a standalone Electron window:
- It has its own icon and fullscreen with **F11** or **Alt+Enter**.
- Saves live in the app's own profile.
- It never touches the network.

The window is locked down: the page is sandboxed without Node access, every permission request is denied, pop-ups and navigation away from the bundled files are blocked, and all outbound requests are cancelled.

- **Ready-made builds:** the **Hollow Cordon desktop app** GitHub Actions workflow builds the following on every pull request and push to `main`:
  - Windows: an installer `Hollow-Cordon-Version-2-Setup.exe` and a portable `Hollow-Cordon-Version-2.exe`
  - macOS: a universal `.dmg`
  - Linux: an `.AppImage`

  Open the run in the repository's **Actions** tab and download the file for your system from **Artifacts**. The builds are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on first launch: choose *More info → Run anyway* on Windows, or right-click → *Open* on macOS.
- **Build or run it yourself** (needs Node.js 18+):
  ```bash
  cd hollow-cordon/desktop
  npm install
  npm start            # run the app
  npm run dist         # build an installer for this OS into desktop/dist/
  ```

### Phones & tablets
The game detects a touch screen and switches to **touch controls** automatically. Play in landscape; in portrait it asks you to turn the phone.

- **Android app:** install `Hollow-Cordon-Version-2-Android.apk`.
  - Get it from the **Hollow Cordon Android app** workflow run's **Artifacts** in the repository's **Actions** tab, or build it yourself (below).
  - Open the file on the phone, and allow your browser or file manager to install unknown apps when Android asks.
  - The app runs fullscreen and landscape, keeps the screen on, and works offline.
  - The page is locked down with a content security policy: it can only load its own bundled files and makes no network requests.
  - The APK is debug-signed. To install a build made on a different machine over an older one, uninstall the old one first; that also clears saves.
- **iPhone, iPad and any phone browser:** open the game's web address (option B or a static host such as GitHub Pages).
  - Tap once to start; on Android the game goes fullscreen.
  - On iPhone, use Safari's **Share → Add to Home Screen** to get a fullscreen, offline app icon.
- **Phones get lighter defaults** the first time they run: low-quality lighting, no film grain, lower particle, gib and corpse limits, slightly zoomed-in camera, and fewer rendered pixels on high-DPI screens. Change any of them in **Settings**.
- **Build the Android app yourself** (needs JDK 21 and the Android SDK, with `ANDROID_HOME` set):
  ```bash
  cd hollow-cordon/mobile
  npm install
  npm run apk          # → android/app/build/outputs/apk/debug/app-debug.apk
  ```
  `npm run sync` copies the game into the Capacitor project without building; open `mobile/android` in Android Studio to run it on a device or emulator.

### Install it as a web app (PWA)
Serve the folder (option B below) or host it on any static web host, such as GitHub Pages. Chrome and Edge then show **⤓ Install app** on the main menu and in the address bar. The installed game opens in its own fullscreen window, gets a Start-menu, Dock or launcher icon, and works **offline**: a service worker caches every file on first load.

### Option A — just open it
Double-click `hollow-cordon/index.html`, or drag it into a desktop browser (Chrome, Edge or Firefox). That's all it takes.

### Option B — serve it locally
Settings, best scores and custom maps are saved more reliably when the game is served from `localhost`. Serving it this way also enables the installable web app.

```bash
cd hollow-cordon
python3 -m http.server 8000
```

…or, without Python, use the bundled zero-dependency Node server:

```bash
cd hollow-cordon
node tools/serve.mjs 8000
```

On Windows, use `py -m http.server 8000` or `python -m http.server 8000` if `python3` isn't found. Keep that terminal open while you play, and run the command **inside the `hollow-cordon` folder**: started anywhere else, `localhost` shows a file listing or a 404. With option B, open **http://localhost:8000**. Either way, **click once** to begin. The click is required to unlock browser audio, and the game then synthesises its sound bank in a few seconds. Headphones are recommended.

> Content warning: extreme graphic violence and gore. You can lower or disable it under **Settings → Gore & performance**.

### Engine choice
The repository had no game engine or game project, so I built Hollow Cordon on **vanilla JavaScript + HTML5 Canvas 2D + the Web Audio API**:
- It runs anywhere a browser does, with zero setup and no dependencies.
- I wrote the physics and rendering specifically for this game: verlet ragdolls, decal layers, a light map and skeletal characters.
- Generating every asset in code means all art and audio are original, so there are no third-party licences to manage.

---

## Controls

All actions can be remapped in **Settings → Controls** (keyboard keys or mouse buttons).

| Action | Default |
|---|---|
| Move | **A / D** (or arrow keys) |
| Aim | **Mouse** |
| Attack / fire | **Left mouse** |
| Steady aim / look further (scoped rifles zoom out) | **Right mouse** |
| Reload | **R** |
| Switch weapon | **1–8** (one slot per weapon class; press again to cycle) or **mouse wheel** · **Q** previous weapon |
| Interact (doors, vault through broken windows, board up, repair barricades, read notes) | **E** (hold **E** to board up a door or window) |
| Jump | **Space** |
| Climb ladders / take stairs up | **W** |
| Crouch / climb down / drop through platforms | **S** (S + Space drops through one-way floors) |
| Sprint (lowers the weapon to low ready; firing raises it again) | **Shift** |
| Quick melee kick (knocks infected down) | **V** |
| Throw grenade | **G** |
| Flashlight | **F** |
| Medkit | **H** |
| Shop (Survival, between waves) · start next wave | **B** · **N** |
| Sandbox tools panel | **Tab** |
| Pause | **Esc** |

### Touch (phones & tablets)
| Action | Touch |
|---|---|
| Move | Drag anywhere on the left side; the stick appears under your thumb |
| Sprint | Push the move stick past its ring |
| Ladders & stairs / crouch & drop through | Move stick up / down |
| Aim | Drag on the right side (with gentle aim assist) |
| Fire | Push the aim stick past half-way. Held, it keeps firing, including semi-auto, pump and bolt guns |
| Steady aim (look further) | **AIM** (toggle) |
| Jump · interact (hold for objectives) · reload · quick melee | **JUMP** · **USE** · **RELOAD** · **MELEE** |
| Next weapon | **SWAP**, or tap the weapon readout at the top right |
| Flashlight · grenade · medkit | **LIGHT** · **GREN** · **MED** |
| Shop · start wave / move out · sandbox tools | **SHOP** · **GO** · **TOOLS** (shown when available) |
| Pause | **II** (top right) |

**Settings → Touch controls** has Auto/On/Off, control opacity, vibration, and the fullscreen/landscape lock. In touch mode the HUD moves to the top edge so your thumbs don't cover it, and prompts name the touch buttons, for example "[USE] Open door".

### Gamepad
Any standard-mapping controller (Xbox, PlayStation, most generic pads) works in Chrome, Edge and Firefox. Connect it and press a button. Prompts switch to pad glyphs while it's in use, and moving the mouse switches back. The layout is fixed, and it's also listed on the Controls screen.

| Action | Pad |
|---|---|
| Move · climb ladders / stairs · crouch | **Left stick** |
| Aim (with gentle aim assist) | **Right stick** |
| Fire / attack · steady aim | **RT** · **LT** |
| Jump (stick ↓ + A drops through floors) | **A** |
| Quick melee · break free when pinned | **B** |
| Reload · interact (hold to board up / work machinery) | **X** · **Y** |
| Previous / next weapon · last weapon | **LB / RB** · **R3** |
| Sprint | **L3** |
| Flashlight · start next wave / move out | **D-pad ↑** · **D-pad ↓** |
| Medkit · grenade | **D-pad ←** · **D-pad →** |
| Shop / sandbox tools · pause | **View** · **Menu** |
| Menus | **D-pad / left stick** to move, **A** select, **B** back, **←/→** adjusts sliders |

Hits, explosions and heavy recoil trigger rumble where the browser supports it.

---

## Game modes

### Campaign — *The Long Way Out*
Seven chapters take one survivor across all seven locations, from a hospital ward to the gates of Checkpoint Sable:
- Each chapter opens with a **briefing** and closes with a **debrief**, and the final chapter ends with an **epilogue**.
- Objectives are marked in the world, and an arrow at the screen edge shows the distance when the target is off-screen.
- Infected trickle in all the time and surge during holdouts.
- You get a short preparation window with the supply cache before each chapter.
- **Weapons, ammo, supplies and cash carry over** between chapters. If you die, you retry the chapter with the gear you brought into it.
- Progress is saved automatically. **Continue** resumes the next chapter, and finished chapters can be replayed from the chapter list.

| # | Chapter | Location | Objectives |
|---|---|---|---|
| 1 | Night Shift | St. Halloran Memorial | Recover three antiviral cases across both floors, then escape through the ambulance bay |
| 2 | Kessler Avenue | Kessler Avenue | Reach the pharmacy, hold it through two waves, climb to the apartment roof |
| 3 | Precinct 9 | Precinct 9 | Reach the armory, restart the motor-pool generator, hold out while the radio warms up, check the radio upstairs |
| 4 | The Water | Varga Steelworks | Get up to the control room, take the water test results, kill the brute breaking into the yard, escape |
| 5 | Line 4 | Line 4 Tunnels | Restart the corridor generator, survive while the flood doors cycle, reach the east bore |
| 6 | Hollins Farm | Hollins Farm | Find three fuel cans for the truck, survive until dawn |
| 7 | Hollow Cordon | Checkpoint Sable | Reach the command post, transmit the Varga files, hold the line (a brute breaks through), reach the landing zone |

The objective types are collect, reach, hold-to-work (hold **E** / **Y** at a machine), timed survival with a surge, wave defence, and boss kills.

### Blackout — *Continuity Site 7*
Fight your way out of a Cold War continuity bunker under Marrow Falls after its power has failed. There are three long, two-storey levels, each 7,200–8,000 units wide. Pick **BLACKOUT** on the main menu.
- **It is dark.** The only light comes from failing red emergency lamps, the occasional green supply light, and whatever you bring.
- **Your flashlight is weak.** It has a short, dim beam and runs on a **battery** that drains while it is on (**F** toggles it). Below 25% it flickers, and at 0% it dies.
- **Muzzle flash is light.** In Blackout every unsuppressed shot lights the room for a split second at more than twice the normal radius, so you sometimes fire just to see what is coming.
- **Batteries** are hidden around each level, sometimes dropped by infected (about 1 in 9), and sold in supply lockers.
- **Weapon lights** are brighter and reach twice as far, but drain the battery faster.
- **Suppressors** keep you quiet, but they also kill the flash you would see by.
- **Green-lit supply lockers** (**E**) open the shop and the weapon workbench mid-level.
- **Blast doors** seal each sector until you finish the objective that releases them, and some objectives restore power to a section's lights. Infected only spawn inside your sealed sector, while dormant infected wait in the dark ahead.
- **Gear, cash and battery carry over** between levels. If you die, you restart the level with what you brought in.

| # | Level | Objectives |
|---|---|---|
| 1 | Quarantine Block | Find two fuses, reset door circuit A, reach the security checkpoint, override the checkpoint PLC while the klaxon sounds, reach the freight lift, hold out until it arrives |
| 2 | Barracks | Reach the armory, recover two duty officers' keycards, cycle Bulkhead B, kill the brute in the generator hall, restart generator 3, climb the ventilation stack |
| 3 | Surface Gate | Reach continuity command, bypass the gate interlock at the SCADA terminal, recover two override keys, arm the gate bulkhead, hold the ramp for 90 seconds while the surface gate opens (a brute breaks through), run for daylight |

The bunker maps also work in Survival and Sandbox. There, the blast doors start open and the power is on.

### Survival
Survive endless, escalating waves. Kills, headshots and dismemberments earn cash and score. Between waves you can open the **Supply Cache** shop for weapons, ammo, armour, medkits, planks and grenades. Infected drop ammo, cash, medkits and planks. Best scores are saved per map.

**Save & continue:** the run is saved at every wave break, including wave, cash, score, stats and your full loadout. **Survival → Continue** picks it up from that break on the same map, survivor and difficulty. Dying ends the run and clears the save.

Difficulty rises through **enemy mix and behaviour**, not just numbers:
- Crawlers join from wave 2 and runners from wave 3.
- Riot officers arrive from wave 4.
- Bloaters, burners, and a brute every third wave, arrive from waves 5–6.
- Shriekers that buff and summon arrive from wave 6.
- Leapers come from wave 7 and fallen soldiers from wave 8.

From wave 4, runner packs appear. From wave 5, infected attack from both flanks. Health and speed keep scaling after that. Each map biases the mix: Precinct 9 favours riot officers, Checkpoint Sable favours soldiers, the tunnels favour crawlers, and the steelworks favours bloaters and burners.

### Sandbox
Choose the map, survivor, loadout (any of the 30 weapons), allowed infected types, auto-spawn rate, max alive, starting count, difficulty, infinite ammo, god mode, and whether the infected always know where you are. Press **Tab** in game for live tools:
- **Spawn and remove:** spawn any infected type or prop at the cursor; remove individual infected, corpses or props.
- **Effects:** trigger explosions, start fires, or spawn a horde.
- **Clean-up:** kill all, clear corpses, or clear blood.
- **Toggles:** slow motion, freeze AI, god mode, infinite ammo, auto-spawn.
- **Loadout:** give all weapons, or refill and heal.
- **Weapon workbench:** fit any attachment for free.

### Map Creator
Open it with **MAP CREATOR** from the main menu.
- **Palette:**
  - **Structure:** solid blocks by material, one-way platforms, back walls, stairs, ladders, doors (including metal and locked), breakable windows, barricades, and one-click wall-with-door / wall-with-window storeys.
  - **Props:** all 32 props.
  - **Decor:** 39 decor and storytelling pieces.
  - **Lights:** bulbs, fluorescents, flickering, street and flood shafts, emergency pulses, fire glow, and hazardous or decorative fires.
  - **Gameplay:** player spawn, infected spawns, vent spawns, pre-placed infected of any type, pickups and story notes.
- **Tools:**
  - Select, move, resize (handles), place (click, or click-drag to size blocks, walls and platforms), pan and delete.
  - **Grid snapping** (8/16/32/64 px, **G** toggles free placement), rotate (**R**), flip (**F**), box-select, Shift multi-select, Alt-drag duplicate, Ctrl+C/V/D, arrow-key nudge.
  - **Undo/redo** (Ctrl+Z / Ctrl+Y) and z-order.
- **Map and lighting settings:**
  - Name, theme/backdrop, size, horizon.
  - Ambient colour and level, with Night / Moonlit / Pitch-black / Dusk presets.
  - Fog density and colour, weather, reverb and ambience loop.
  - Per-light radius, colour, intensity, flicker, light shaft, and confine-to-room.
- **WYSIWYG preview:** the editor renders through the real engine, and **Lights (L)** previews in-game lighting, fog and ambience.
- **Instant playtest (P):** opens the map in sandbox with all weapons. Use **Esc → Back to editor** to return with your edits intact.
- **Save / Open:** maps are stored in browser storage and appear in the Survival and Sandbox map lists. Built-in maps open as editable copies.
- **Export / Import:** move maps between machines as `.hcmap.json` files.

---

## Content

### Survivors
| Survivor | Background | Perk |
|---|---|---|
| Ilya Brandt | Ex-army rifleman | 20% faster reloads, 15% less rifle/MG recoil |
| Dana Okoro | Precinct 9 patrol officer | +25% pistol/revolver damage, tighter pistol spread |
| Tomas Reyes | Steelworks electrician | Boards and barricades 50% tougher, +20% melee damage |
| Wren Hale | Trauma nurse | Medkits heal 60% more; slowly regenerates to 50 HP |

### Weapons (30)
Each weapon has its own damage, pellet count, spread and aim spread, bloom, recoil (aim climb, gun kick-back, camera shake), fire rate, fire mode, magazine, reload time and type, penetration power, range falloff, impact force, dismemberment and gib multipliers, movement weight, noise radius, synthesised gunshot and procedurally drawn model.

Weapons animate their reloads: magazines drop out and are re-seated by the support hand, shotguns load shell by shell, revolvers and the double-barrel dump their empties, and pumps and bolts cycle between shots. Every shot ejects a casing and throws muzzle flash, smoke and light.

**Gun models** are drawn by a material-aware renderer:
- Each part is shaded as blued or polished steel, polymer, wood, rubber, painted metal, brass or optic glass.
- Parts cast soft contact shadows onto each other.
- Every gun gets the details it needs: slide serrations, ejection ports with a case in the chamber, picatinny rails, vented handguards, pins and screws, checkered grips, triggers in looped trigger guards, muzzle crowns and magazine ridges.
- Some guns also get safety levers, slide stops and charging handles, knurled scope turrets, side-saddle shell carriers, and worn bluing on the edges.
- Rifles and shotguns carry a sling that hangs with gravity at any aim angle.
- Melee weapons get honed edges, rust and grip tape.

| Slot | Weapon | Class | Damage | Mode | RPM | Mag | Ammo | Penetration | Unlocks | Price |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Cane Machete | melee (blade) | 55 | — | — | — | — | — | — | start |
| 1 | Nailed Bat | melee (blunt) | 46 | — | — | — | — | — | — | $200 |
| 1 | Fire Axe | melee (heavy blade, decapitates) | 95 | — | — | — | — | — | wave 2 | $500 |
| 1 | Sledgehammer | melee (heavy blunt, crushes skulls) | 120 | — | — | — | — | — | wave 3 | $700 |
| 2 | Warden 9 | pistol | 30 | semi | 420 | 15 | 9mm | 14 | — | start |
| 2 | Keeper .45 | pistol | 42 | semi | 330 | 8 | .45 ACP | 13 | — | $450 |
| 2 | Magistrate .357 | revolver | 70 | semi | 200 | 6 | .357 Mag | 26 | wave 2 | $900 |
| 2 | Bastion .500 | revolver | 145 | semi | 120 | 5 | .500 S&W | 48 | wave 5 | $1800 |
| 2 | Wraith 9 SD | pistol (integral suppressor) | 24 | semi | 440 | 12 | 9mm | 12 | wave 2 | $650 |
| 2 | Lantern .45 Compact | pistol (integral light) | 40 | semi | 340 | 10 | .45 ACP | 13 | — | $550 |
| 3 | Vex-9 SMG | SMG | 24 | auto | 800 | 30 | 9mm | 14 | — | $900 |
| 3 | Ratchet .45 | machine pistol | 28 | auto | 950 | 25 | .45 ACP | 12 | — | $700 |
| 3 | Kestrel PDW | SMG | 22 | auto | 900 | 50 | 9mm | 18 | wave 4 | $1500 |
| 3 | Nightjar SD | SMG (integral suppressor) | 22 | auto | 800 | 30 | 9mm | 14 | wave 3 | $1700 |
| 4 | Parish 12 Pump | pump shotgun | 9×17 | pump | 75 | 6 | 12 gauge | 6 | — | $600 |
| 4 | Breaker Double | break-action shotgun | 10×20 | semi | 420 | 2 | 12 gauge | 6 | — | $400 |
| 4 | Thresher Semi-12 | semi-auto shotgun | 8×15 | semi | 220 | 8 | 12 gauge | 6 | wave 4 | $1600 |
| 4 | Mauler Auto-12 | automatic shotgun | 8×13 | auto | 300 | 20 | 12 gauge | 5 | wave 8 | $3600 |
| 4 | Cerberus Tactical 12 | box-fed semi-auto shotgun | 15×8 | semi | 260 | 8 | 12 gauge | 6 | wave 5 | $2600 |
| 5 | Kolba-74 | assault rifle | 36 | auto | 620 | 30 | 7.62x39 | 40 | wave 2 | $1400 |
| 5 | C7 Carbine | assault rifle | 30 | auto | 760 | 30 | 5.56mm | 34 | wave 3 | $1700 |
| 5 | Spindle Bullpup | assault rifle | 32 | 3-round burst | 900 | 30 | 5.56mm | 34 | wave 5 | $2200 |
| 5 | Halberd 5.56 Carbine | assault carbine | 32 | auto | 780 | 30 | 5.56mm | 34 | wave 4 | $2400 |
| 6 | Graver .308 | battle rifle | 58 | auto | 560 | 20 | .308 Win | 70 | wave 6 | $2800 |
| 6 | Longshank DMR | marksman rifle (scoped) | 92 | semi | 280 | 10 | .308 Win | 90 | wave 6 | $3000 |
| 6 | Specter 7.62 DMR | marksman rifle | 80 | semi | 300 | 15 | .308 Win | 60 | wave 6 | $3600 |
| 7 | Pale Horse .338 | bolt-action sniper (scoped) | 230 | bolt | 60 | 5 | .338 Lapua | 180 | wave 7 | $4200 |
| 7 | Ironwake .50 | anti-materiel rifle (scoped) | 520 | semi | 90 | 5 | .50 BMG | 460 | wave 9 | $6500 |
| 8 | Brushfire LMG | light machine gun | 30 | auto | 820 | 100 | 5.56mm | 34 | wave 7 | $4400 |
| 8 | Grinder GPMG | general-purpose MG | 46 | auto | 650 | 100 | 7.62 belt | 55 | wave 9 | $5500 |

Plus **frag grenades** (G).

### Attachments
Open the **weapon workbench** from the Supply Cache (Survival, Campaign prep, Blackout supply lockers) or from the Sandbox panel. Pick a gun, buy an attachment once, then fit or remove it freely. Each attachment is drawn on the gun model and changes its stats.

| Attachment | Slot | Price | Effect |
|---|---|---|---|
| Suppressor | muzzle | $450 | Noise radius ×0.3, muzzle flash ×0.28, quieter suppressed gunshot; −6% damage, −8% range |
| Weapon light | rail | $300 | A long, bright beam along the barrel (toggled with **F**); drains the battery faster in Blackout |
| Laser sight | rail | $350 | A red beam and dot where the round goes; 30% tighter hip fire |
| Red-dot sight | optic | $400 | 25% tighter aimed fire |
| 4× scope | optic | $650 | Aims much further down range; aimed spread halved |
| Extended magazine | mag | $500 | +50% rounds per magazine; reloads 15% slower |
| Vertical foregrip | grip | $300 | 25% less recoil, 20% less bloom; the support hand moves to the grip |

Each gun only offers the slots that fit it:
- Revolvers and the double-barrel take nothing.
- Pistols take no optics.
- Shotguns and machine guns take no suppressor.
- Guns with a built-in scope take no optic.
- The Wraith and Nightjar are already suppressed, and the Lantern already has a light.

Attachments are saved with your loadout.

**Penetration:** each bullet carries penetration power. Bodies, wood (doors, crates, wooden walls, barricades), thin metal and plaster each consume some of it. Glass shatters; concrete, brick, rock and vehicles stop rounds. Rifles punch through wooden farmhouse walls and through lines of infected, while pistol rounds stop in the first body.

### Infected (10)
| Type | Appearance & behaviour |
|---|---|
| **Walker** | Patients, staff, civilians, workers. Slow, reaching, relentless. Bashes doors, climbs through windows. |
| **Runner** | Freshly turned. Sprints, screams on sight, lunges, jumps obstacles. |
| **Crawler** | Legless torso dragging itself along the ground, low and hard to hit. Emerges from vents. |
| **Riot Officer** | Visored helmet and body armour spark and absorb rounds until shot away (high-penetration rounds and heavy melee bypass). |
| **Fallen Soldier** | Helmet and plate carrier, moves at a jog. |
| **Brute** | Huge and tumour-swollen. Charges and knocks you flying, smashes barricades in a few blows, ignores small-arms stagger. |
| **Bloater** | Pustule-covered. Bursts into caustic bile when killed, which hurts you and nearby infected. |
| **Shrieker** | Emaciated. Keeps its distance, then screams: alerts and enrages nearby infected (speed and damage buff) and summons more. |
| **Leaper** | Long-limbed and stalks low. Pounces from several metres and **pins you to the ground**, mauling until you break free: mash melee, jump, fire or interact (**B** on a pad). Leaps high obstacles and gaps. |
| **Burner** | Varga furnace crew in scorched hazmat gear with a fuel tank on its back. Torso hits puncture the tank, and the burner then rushes you at almost double speed, trailing fire, until it burns down. The tank always explodes when it dies, so put it down at range; aiming for the head or legs avoids lighting it first. |

**Location-based damage:** heads, torsos, upper and lower arms, thighs and shins all have their own hitboxes and damage multipliers.
- **Headshots:** headshots deal heavy damage. Shotguns at close range, snipers, sledgehammers and overkill **burst the head**, scattering brain, skull, eyes and teeth and leaving a spurting neck. Axe kills decapitate.
- **Damaged arms:** damaged arms weaken attacks, and with no arms left the infected can only bite.
- **Damaged legs:** damaged legs cause a limp, and a lost leg turns the infected into a **crawler**.
- **Hit reactions:** big hits stagger infected, and shotgun blasts, kicks and explosions knock them down so they have to get back up.
- **Severed limbs:** limbs come off as physics pieces.
- **Corpses:** corpses are verlet ragdolls that remain shootable. They can be dismembered, have their heads popped or be gutted, spilling physics-simulated intestines, and they pool blood.

**Characters & animation:**
- **Locomotion:** walking and running use a foot-planted gait. Feet stay on the ground through each stance and swing forward on a lift arc, and IK solves the knees, so there's no foot sliding. Sprints have a flight phase. Each infected type has its own gait: shamble, jog, stomp, waddle, prowl or sprint. Footsteps play on the heel strike.
- **Ladders:** climbing is hand over hand on the ladder's actual rungs, with your weapon slung on your back.
- **Melee:** swings are keyframed per weapon. One-handed blades cut diagonally, the bat and the heavy weapons use two hands, and every swing has anticipation, torso drive, a step in and a follow-through. The kick chambers, extends and retracts. The infected rear back and lunge into their swipes.
- **Weapon handling:**
  - The firing hand wraps the pistol grip with the index finger on the trigger and the thumb along the frame.
  - The support hand cradles the handguard, or cups the firing hand on pistols, and stays visible on the weapon.
  - Long guns are shouldered with a cheek weld: the head drops to the stock and the rifle rises until its sights sit under the eye.
  - Standing shooters take a staggered, soft-kneed stance and lean into the gun.
  - Over-long stocks and fore-ends are kept within the arm's reach.
- **Models:**
  - Soft-blended shoulders, elbows and knees, cloth creases, rim lighting, and detailed faces and hair.
  - Garment construction: zips with pulls, plackets, flapped pockets, seams, cuffs, unit patches and back pockets.
  - Gear: vest webbing, a shoulder radio, a police back panel, hi-vis reflective strips, a full backpack with bedroll and harness, a belt pouch, and boots with lace hooks and heels.
  - The infected get blood runs, exposed ribs and threads hanging from torn clothing.

**AI:**
- **Senses:** sight depends on light, flashlight, crouching and facing; hearing responds to gunshots, sprinting, doors and glass.
- **Obstacles:** infected climb onto or vault over cars, crates and sandbags. They bash doors, windows, barricades and furniture, and climb through broken windows.
- **Navigation:** a route planner over stairs, ladders and fire escapes checks walls and floor continuity, so infected find their way between floors, catwalks, lofts and roofs.
- **Gap jumping:** runners, leapers and soldiers jump gaps of up to about 150 px on the same level. Slower types walk around, or drop through and re-route.
- **Furniture:** infected climb off furniture they can't get past, or wreck it. Pushing a cabinet against a door slows them down but won't trap them.

### Maps (10)
| Map | Setting |
|---|---|
| **St. Halloran Memorial** | Abandoned hospital: two floors, stairwell, morgue, isolation ward, roof hatch, fire escapes, ambulance bay, rain. |
| **Kessler Avenue** | City streets: police roadblock, looted pharmacy, burning wrecks, a crashed bus, a three-storey apartment block with an exterior fire escape. |
| **Precinct 9** | Police station: lobby, bullpen, holding cells, a half-emptied armory (supplies inside), motor pool, offices and the chief's office. |
| **Varga Steelworks** | Industrial factory: a cavernous hall with two catwalk tiers, ladders, a roaring furnace, containers, gas cylinders and a raised control room. |
| **Hollins Farm** | Rural farm: moonlit corn rows, a wooden two-storey farmhouse (rounds go through the walls), a fuel-cluttered yard, a barn with a hay loft. |
| **Line 4 Tunnels** | Underground: a dead station platform, a maintenance corridor, pitch-black track tunnels and a derailed subway car. |
| **Checkpoint Sable** | Military checkpoint: refugee queue, HESCO line, razor wire, a floodlit watchtower, the container command post and an overrun camp. |
| **Site 7: Quarantine Block** | Bunker, level 1: isolation cells, a dead med bay, an observation gallery, decontamination, a lab, a security checkpoint and the freight lift. |
| **Site 7: Barracks** | Bunker, level 2: a mess hall, barracks, an armory loft, a double-height generator hall with catwalks, power control and the ventilation stack. |
| **Site 7: Surface Gate** | Bunker, level 1 (top): comms, continuity command and its SCADA terminal, a vehicle bay, a fuel store and the long ramp to the surface blast gate. |

Every map has:
- **Doors:** open and close with E, bash them, board them up.
- **Breakable windows** you can climb through once the glass is gone. The prompt only appears when there's floor to land on.
- **Movable and destructible props.**
- **Explosive fuel drums and propane tanks:** shoot them once and they may start leaking fire before they blow, which triggers chain reactions.
- **Placed supplies.**
- **Environmental storytelling:** graffiti, posters, bodies, blood trails, and readable notes and logs that tell the story of the cordon.

---

## Settings & performance
- **Gore:**
  - Gore level: Off, Low, Medium, High or Extreme.
  - Dismemberment and head bursts on or off.
  - Persistent blood stains on or off.
- **Limits:** corpse, particle, gib and shell-casing limits. Old corpses fade out, and the rest are capped.
- **Video:** lighting quality, fog and light shafts, film grain, screen shake, camera zoom, FPS counter.
- **Audio:** master, effects and ambience volume.
- **Gameplay:** auto-reload.

If a machine struggles in very heavy fights, lower the particle and corpse limits, set lighting to Low, or turn off fog and film grain.

---

## Testing
A headless browser smoke test boots the game and:
- plays Survival on every map, firing weapons at spawned infected;
- runs Sandbox with explosions;
- exercises the UI flows: setup screens, shop purchase, key remapping, death → game over → restart, and editor → playtest → back to editor;
- plays the **whole campaign**: new campaign → briefing → every objective of all seven chapters (collect, reach, hold, survive, waves, boss) → chapter complete → ending, and checks that the save and loadout carry over; it also covers death → Retry Chapter;
- saves a Survival run at a wave break, then **continues** it from the menu;
- drives the menus and gameplay with a **virtual gamepad**: focus navigation, A/B, stick movement and aim, RT fire, LB/RB switch, A jump, Menu pause;
- plays **all of Blackout** from the main menu. It checks the dark level start, the supply locker shop (batteries and the workbench) and battery drain, drives every objective in all three levels, checks that each blast door opens and that the save and loadout carry over, and confirms the bunker maps play open and powered in Survival;
- buys and fits **attachments**, checks their stat changes and integral attachments, and checks that they survive a save round-trip;
- runs a **window-climb regression**: every open window on four maps, from both sides. Each climb must be continuous (no teleport), cross to the far side and land on a floor. Windows with nowhere to land must not offer the climb;
- plays on an emulated **phone** (Pixel 7, landscape) with real multi-touch:
  - It checks that touch mode and the lighter phone defaults switch on, and taps through the menus into Survival.
  - It moves with the left thumb while aiming and firing with the right thumb, and the held semi-auto pistol must keep firing.
  - It checks that nothing is still held after release, then presses jump, swap, use on a door and pause.
  - It toggles the flashlight in Blackout and checks the portrait "turn your phone" prompt.

It fails on any JavaScript error. The last argument picks a scenario (`all`, `survival`, `sandbox`, `ui`, `campaign`, `gamepad`, `blackout`, `attachments`, `windows` or `touch`).

```bash
cd hollow-cordon
python3 -m http.server 8000 &
npm install --no-save playwright   # if Playwright isn't already available
node tools/smoke-test.mjs http://localhost:8000/ /tmp/shots all
```

---

## Project structure
```
hollow-cordon/
  index.html, css/style.css
  js/core/      util (math/geometry), settings & key bindings, input, procedural audio synth
  js/render/    textures, character sprite baker, decor painter, lighting, scene (sky/parallax/fog/weather/post)
  js/game/      body (skeleton/IK/hitboxes), weapons, world (grid/raycasts/decals), fx (particles/gibs/ropes),
                ragdoll & gore, props (doors/windows/barricades/physics props), combat (ballistics/explosions/melee),
                actor (character controller & poses), zombie (types/AI/damage), player, game, modes,
                campaign (chapters, objectives, loadout & save), blackout (bunker levels, battery, lockers, blast doors)
  js/maps/      map library + builder helpers, 10 built-in maps (bunker.js holds the three Site 7 levels), custom map storage
  js/ui/        HUD, menus & overlays, touch controls
  js/editor/    map creator
  icons/        app icons (generated)        manifest.webmanifest, sw.js   installable offline web app
  desktop/      Electron desktop app (main.js, electron-builder config in package.json)
  mobile/       Android app: Capacitor 8 project (capacitor.config.json, scripts/copy-web.mjs, android/)
  tools/        smoke-test.mjs (Playwright), serve.mjs (static server)
.github/workflows/desktop.yml   builds the Windows / macOS / Linux desktop apps
.github/workflows/android.yml   builds the Android .apk
```

---

## Finished vs. planned

**Finished:** everything described above is implemented and playable:
- 5 modes, including the seven-chapter campaign with its briefings, objectives and ending, and the three-level Blackout escape;
- 10 maps, 30 weapons plus grenades, 7 attachments, and 10 infected types, including the leaper's pin and the Burner;
- the gore system, the map creator, and settings;
- Survival save & continue;
- remappable keyboard and mouse controls, plus full gamepad support;
- menus, HUD, and the pause and restart flow.

**Known limitations:**
- The gamepad and touch layouts are fixed; only keyboard and mouse bindings can be remapped.
- The map creator is built for a mouse and keyboard. On a touch screen it asks before opening.
- In Sandbox, an armed tool takes taps on the game view; disarm it to get the sticks back.
- There's no iOS app build; on iPhone and iPad, play in Safari or add it to the home screen.
- Physics props are axis-aligned boxes. Rotating a prop in the editor is visual only, and solid blocks rotate in 90° steps by swapping width and height.
- Slow infected (walkers, burners, brutes) don't jump gaps. On a custom map where two areas are linked only by a gap, they drop through and re-route if they can; add stairs, a ladder or a plank if there's no other way round.
- The campaign and Blackout have one save slot each, and Survival keeps one saved run.
- Desktop builds are unsigned (see the first-launch warnings above), and the Android APK is debug-signed. Neither updates itself; download a newer build to update.
- All audio is synthesised. It is distinctive but not photorealistic.

**Ideas for future work:** co-op, more campaign chapters and maps, and a remappable gamepad layout.

---

## Assets & licensing
Every texture, character, weapon, prop, decor piece, background and sound effect is **generated procedurally in code at runtime**. The game uses no external images, sprites, fonts or audio files, and no third-party libraries. All names, characters, locations and story are original. The game draws on the general atmosphere and feel of classic side-view zombie shooters but recreates none of them.
