# EMBERLINE — a round-based tactical FPS (make.fun threejs-fps-01)

Five attackers ("Ember", you + 4 bots) against five defenders ("Wardens", 5 bots)
in the Cinder Quay container yard at dusk. Plant the spark charge at site A or
site B — or drop the whole enemy team. First to 5 round wins, max 9 rounds.
Money between rounds buys weapons; accuracy beats speed.

## How to play

Open `game/index.html` in a desktop browser (or `node serve.ts`, then
http://localhost:8080). Single-player vs bots; no network requests, no build step.

| Key | Action |
| --- | --- |
| Click **Start match** | open the buy phase |
| **W A S D** | move · **Mouse** look (pointer lock) · **Space** jump · **Ctrl/C** crouch |
| **Click** | fire · **R** reload · **Right-click** | aim (Vantage DMR zooms) |
| **1 / 2 / 3** | Kestrel P9 / Longspur-7 / Vantage DMR |
| **B** | buy menu (buy phase) |
| **E** (hold) | plant / defuse the spark charge (inside a site) |
| **G** | throw a spark grenade |

## Economy

Start $800. Kill +$300, round win +$3,250, round loss +$1,900, plant +$300.
Kestrel P9 free · Longspur-7 rifle $2,700 · Vantage DMR $4,750 · Kevlar vest $650 ·
spark grenade $300 (max 2). Buy phase 15 s, round 100 s, fuse 35 s, defuse 5 s.

## The game

- **Map**: a 44×34 m container yard, two bomb sites, three lanes, crates and
  gantries for cover. A waypoint graph drives the bot routes.
- **Bots**: patrol, hold sites, see (field of view + line of sight), hear
  gunshots (26 m), engage in bursts with reaction delay and aim error, strafe,
  plant and defuse. The bomb carrier's team-mates escort; the enemy grabs a
  dropped charge.
- **Gunplay**: hit zones (head shots deal more), recoil and spread that punish
  firing on the move, burst fire, ammo and reserve, fixed 60 Hz simulation
  separate from rendering.
- **Rounds**: elimination or objective (plant → detonation, or defuse); the
  match ends at 5 round wins or after 9 rounds.

## Layout

- `game/` — the game: `index.html` (single import map for three.js) and
  `src/` modules (map, physics, player, bots, weapons, grenade, rounds, HUD,
  particles, audio, input). `game/vendor/three/` is three.js 0.187.0,
  byte-for-byte from the kit. All art and sounds are original/procedural.
- `screenshots/` — 4 real renders of the game's own code (cover first).
- `main.ts` — copies `game/` + `screenshots/` to `/output` and writes
  `/output/dossier.json` (`MAKEFUN_OUTPUT_DIR=out node main.ts` to test locally).
- `serve.ts` — static server for local play. `vendor/makefun-threejs.ts` —
  unchanged kit copy. `LICENSE` — MIT.

Rewritten from the design spec in a fresh post-opening session so every line
of game code is this session's own writing. Play-tested headlessly (Playwright
+ SwiftShader WebGL2): menu → buy → deploy → live combat → round end → next
round all verified, plus a grenade throw and a spark plant attempt.
