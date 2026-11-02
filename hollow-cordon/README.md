# HOLLOW CORDON

*Marrow Falls is sealed. You are inside.*

Hollow Cordon is an original 2D side-view zombie survival shooter. It's built for grim atmosphere and weighty, physical combat. After the Pale Fever outbreak, the military sealed the river city of Marrow Falls behind **Cordon Directive 9**. You play one of four survivors trapped on the wrong side of the line. You fight through hospitals, precincts, steelworks, farms, subway tunnels and the checkpoint where it all went wrong.

- **7 maps**, each with its own lighting, weather, layout and story notes
- **24 weapons**: melee, pistols and revolvers, SMGs, pump/double/semi/auto shotguns, assault, battle and sniper rifles, and machine guns
- **9 infected types** with distinct looks, movement, health and behaviour
- **Location-based damage and heavy gore**: dismemberment, head bursts, gutting, intestines, gibs, persistent blood, and ragdoll corpses you can keep shooting
- **3 modes**: Survival, Sandbox, and a full visual **Map Creator**

All art and audio are generated procedurally at runtime, so the game ships no image or sound files.

---

## Launching the game

The game is plain HTML5 + JavaScript. It needs **no install, no dependencies and no build step**.

**Option A — just open it:** double-click `hollow-cordon/index.html`, or drag it into a desktop browser (Chrome, Edge or Firefox). That's all it takes.

**Option B — serve it locally (recommended):** settings, best scores and custom maps are saved more reliably when served from `localhost`.

```bash
cd hollow-cordon
python3 -m http.server 8000
```

…or, without Python, use the bundled zero-dependency Node server:

```bash
cd hollow-cordon
node tools/serve.mjs 8000
```

With option B, open **http://localhost:8000**. Either way, **click once** to begin. The click is required to unlock browser audio, and the game then synthesises its sound bank in a few seconds. Headphones are recommended.

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
| Sprint | **Shift** |
| Quick melee kick (knocks infected down) | **V** |
| Throw grenade | **G** |
| Flashlight | **F** |
| Medkit | **H** |
| Shop (Survival, between waves) · start next wave | **B** · **N** |
| Sandbox tools panel | **Tab** |
| Pause | **Esc** |

---

## Game modes

### Survival
Survive endless, escalating waves. Kills, headshots and dismemberments earn cash and score. Between waves you can open the **Supply Cache** shop for weapons, ammo, armour, medkits, planks and grenades. Infected drop ammo, cash, medkits and planks. Best scores are saved per map.

Difficulty rises through **enemy mix and behaviour**, not just numbers:
- Crawlers join from wave 2 and runners from wave 3.
- Riot officers arrive from wave 4.
- Bloaters, and a brute every third wave, arrive from waves 5–6.
- Shriekers that buff and summon arrive from wave 6.
- Leapers come from wave 7 and fallen soldiers from wave 8.

From wave 4, runner packs appear. From wave 5, infected attack from both flanks. Health and speed keep scaling after that. Each map biases the mix: Precinct 9 favours riot officers, Checkpoint Sable favours soldiers, and the tunnels favour crawlers.

### Sandbox
Choose the map, survivor, loadout (any of the 24 weapons), allowed infected types, auto-spawn rate, max alive, starting count, difficulty, infinite ammo, god mode, and whether the infected always know where you are. Press **Tab** in game for live tools:
- **Spawn and remove:** spawn any infected type or prop at the cursor; remove individual infected, corpses or props.
- **Effects:** trigger explosions, start fires, or spawn a horde.
- **Clean-up:** kill all, clear corpses, or clear blood.
- **Toggles:** slow motion, freeze AI, god mode, infinite ammo, auto-spawn.
- **Loadout:** give all weapons, or refill and heal.

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

### Weapons (24)
Each weapon has its own damage, pellet count, spread and aim spread, bloom, recoil (aim climb, gun kick-back, camera shake), fire rate, fire mode, magazine, reload time and type, penetration power, range falloff, impact force, dismemberment and gib multipliers, movement weight, noise radius, synthesised gunshot and procedurally drawn model.

Weapons animate their reloads: magazines drop out and are re-seated by the support hand, shotguns load shell by shell, revolvers and the double-barrel dump their empties, and pumps and bolts cycle between shots. Every shot ejects a casing and throws muzzle flash, smoke and light.

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
| 3 | Vex-9 SMG | SMG | 24 | auto | 800 | 30 | 9mm | 14 | — | $900 |
| 3 | Ratchet .45 | machine pistol | 28 | auto | 950 | 25 | .45 ACP | 12 | — | $700 |
| 3 | Kestrel PDW | SMG | 22 | auto | 900 | 50 | 9mm | 18 | wave 4 | $1500 |
| 4 | Parish 12 Pump | pump shotgun | 9×17 | pump | 75 | 6 | 12 gauge | 6 | — | $600 |
| 4 | Breaker Double | break-action shotgun | 10×20 | semi | 420 | 2 | 12 gauge | 6 | — | $400 |
| 4 | Thresher Semi-12 | semi-auto shotgun | 8×15 | semi | 220 | 8 | 12 gauge | 6 | wave 4 | $1600 |
| 4 | Mauler Auto-12 | automatic shotgun | 8×13 | auto | 300 | 20 | 12 gauge | 5 | wave 8 | $3600 |
| 5 | Kolba-74 | assault rifle | 36 | auto | 620 | 30 | 7.62x39 | 40 | wave 2 | $1400 |
| 5 | C7 Carbine | assault rifle | 30 | auto | 760 | 30 | 5.56mm | 34 | wave 3 | $1700 |
| 5 | Spindle Bullpup | assault rifle | 32 | 3-round burst | 900 | 30 | 5.56mm | 34 | wave 5 | $2200 |
| 6 | Graver .308 | battle rifle | 58 | auto | 560 | 20 | .308 Win | 70 | wave 6 | $2800 |
| 6 | Longshank DMR | marksman rifle (scoped) | 92 | semi | 280 | 10 | .308 Win | 90 | wave 6 | $3000 |
| 7 | Pale Horse .338 | bolt-action sniper (scoped) | 230 | bolt | 60 | 5 | .338 Lapua | 180 | wave 7 | $4200 |
| 7 | Ironwake .50 | anti-materiel rifle (scoped) | 520 | semi | 90 | 5 | .50 BMG | 460 | wave 9 | $6500 |
| 8 | Brushfire LMG | light machine gun | 30 | auto | 820 | 100 | 5.56mm | 34 | wave 7 | $4400 |
| 8 | Grinder GPMG | general-purpose MG | 46 | auto | 650 | 100 | 7.62 belt | 55 | wave 9 | $5500 |

Plus **frag grenades** (G).

**Penetration:** each bullet carries penetration power. Bodies, wood (doors, crates, wooden walls, barricades), thin metal and plaster each consume some of it. Glass shatters; concrete, brick, rock and vehicles stop rounds. Rifles punch through wooden farmhouse walls and through lines of infected, while pistol rounds stop in the first body.

### Infected (9)
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
| **Leaper** | Long-limbed and stalks low. Pounces from several metres and leaps high obstacles. |

**Location-based damage:** heads, torsos, upper and lower arms, thighs and shins all have their own hitboxes and damage multipliers.
- **Headshots:** headshots deal heavy damage. Shotguns at close range, snipers, sledgehammers and overkill **burst the head**, scattering brain, skull, eyes and teeth and leaving a spurting neck. Axe kills decapitate.
- **Damaged arms:** damaged arms weaken attacks, and with no arms left the infected can only bite.
- **Damaged legs:** damaged legs cause a limp, and a lost leg turns the infected into a **crawler**.
- **Hit reactions:** big hits stagger infected, and shotgun blasts, kicks and explosions knock them down so they have to get back up.
- **Severed limbs:** limbs come off as physics pieces.
- **Corpses:** corpses are verlet ragdolls that remain shootable. They can be dismembered, have their heads popped or be gutted, spilling physics-simulated intestines, and they pool blood.

**AI:**
- **Senses:** sight depends on light, flashlight, crouching and facing; hearing responds to gunshots, sprinting, doors and glass.
- **Obstacles:** infected climb onto or vault over cars, crates and sandbags. They bash doors, windows, barricades and furniture, and climb through broken windows.
- **Navigation:** a route planner over stairs, ladders and fire escapes checks walls and floor continuity, so infected find their way between floors, catwalks, lofts and roofs.

### Maps (7)
| Map | Setting |
|---|---|
| **St. Halloran Memorial** | Abandoned hospital: two floors, stairwell, morgue, isolation ward, roof hatch, fire escapes, ambulance bay, rain. |
| **Kessler Avenue** | City streets: police roadblock, looted pharmacy, burning wrecks, a crashed bus, a three-storey apartment block with an exterior fire escape. |
| **Precinct 9** | Police station: lobby, bullpen, holding cells, a half-emptied armory (supplies inside), motor pool, offices and the chief's office. |
| **Varga Steelworks** | Industrial factory: a cavernous hall with two catwalk tiers, ladders, a roaring furnace, containers, gas cylinders and a raised control room. |
| **Hollins Farm** | Rural farm: moonlit corn rows, a wooden two-storey farmhouse (rounds go through the walls), a fuel-cluttered yard, a barn with a hay loft. |
| **Line 4 Tunnels** | Underground: a dead station platform, a maintenance corridor, pitch-black track tunnels and a derailed subway car. |
| **Checkpoint Sable** | Military checkpoint: refugee queue, HESCO line, razor wire, a floodlit watchtower, the container command post and an overrun camp. |

Every map has:
- **Doors:** open and close with E, bash them, board them up.
- **Breakable windows.**
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
- exercises the UI flows: setup screens, shop purchase, key remapping, death → game over → restart, and editor → playtest → back to editor.

It fails on any JavaScript error.

```bash
cd hollow-cordon
python3 -m http.server 8000 &
npm install --no-save playwright   # if Playwright isn't already available
node tools/smoke-test.mjs http://localhost:8000/ /tmp/shots
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
                actor (character controller & poses), zombie (types/AI/damage), player, game, modes
  js/maps/      map library + builder helpers, 7 built-in maps, custom map storage
  js/ui/        HUD, menus & overlays
  js/editor/    map creator
  tools/        smoke-test.mjs (Playwright), serve.mjs (static server)
```

---

## Finished vs. planned

**Finished:** everything described above is implemented and playable. That covers the 3 modes, 7 maps, 24 weapons plus grenades, 9 infected types, the gore system, the map creator, settings, remappable controls, menus, HUD, and the pause and restart flow.

**Known limitations:**
- Keyboard and mouse only: there is no gamepad or touch support, and the game targets desktop browsers.
- Physics props are axis-aligned boxes. Rotating a prop in the editor is visual only, and solid blocks rotate in 90° steps by swapping width and height.
- Infected route between floors over stairs, ladders and fire escapes. A custom map that can only be crossed by jumping over a gap may leave them stuck; add a ladder or stairs.
- The leaper's pounce deals a heavy hit and knockback but does not pin the player.
- There are no saved Survival runs; only best scores persist.
- All audio is synthesised. It is distinctive but not photorealistic.

**Ideas for future work:** gamepad support, a short story campaign with objectives linking the seven locations, co-op, and more infected variants (such as a burning or hazmat type) and maps.

---

## Assets & licensing
Every texture, character, weapon, prop, decor piece, background and sound effect is **generated procedurally in code at runtime**. The game uses no external images, sprites, fonts or audio files, and no third-party libraries. All names, characters, locations and story are original. The game draws on the general atmosphere and feel of classic side-view zombie shooters but recreates none of them.
