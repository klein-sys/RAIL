# Cyber-Rail Defender · Calculus Protocol

A five-sector browser game for MATH 101 Differential Calculus. Use one-sided limits to repair the railway and trigonometric derivatives to time plasma shots.

## Run locally

Use Node.js 22.18 or later. From the repository root, run:

```sh
npm ci
npm run dev
```

Open the local URL Vite prints and select **Launch mission**. To try it on a phone, run `npm run dev -- --host` on a trusted local network and open Vite’s printed **Network** URL on a phone connected to that network.

For offline play, run `npm run build` and open `dist/index.html` in a modern browser. The file bundles the game, styles, and font.

## Controls

| Action | Keyboard | Touch or mouse |
| --- | --- | --- |
| Adjust right-hand shift `k` | **W/S** or **↑/↓** | Right-hand shift slider or **+/−** |
| Adjust bridge node `f(c)` | **A/D** or **←/→** | Bridge node slider or **+/−** |
| Weld the joint | **Enter** | **Engage track weld** |
| Switch ammo | **Tab**, then **Enter** on the ammo button | Tap an ammo button or use the phone’s combat bar |
| Fire | **Space** | **Fire plasma pulse** or **Fire** in the phone’s combat bar |

**Movement.** Match the two one-sided limits, set the bridge node to their common value, then weld before the train reaches the boundary. An unsealed crossing costs 36 hull.

**Combat.** Use Kinetic Piercer when the magnitude of the angular velocity meets the armor threshold. Switch to Stasis Sniper for phase shields and fire when `|θ′| < 0.25 rad/s`. The game samples the derivative and ammo at launch and applies damage when the pulse reaches the drone. A surviving Harvester costs 24 hull at the sector exit.

Reach the terminus with hull remaining and at least three Harvesters down to unlock procedural patrol.

## Presentation mode

Open **Math & Rubric Inspector** for live worked examples. Choose **1×**, **0.25×**, or **Pause**, or freeze the turret at **t = π/2**. The chosen speed stays active when you close the inspector.

## Project layout and checks

- [Calculus engine](src/engine/calculusEngine.ts) evaluates the track formulas, continuity conditions, turret derivatives, and shot power.
- [Mission engine](src/engine/mission.ts) handles sector progression, hull damage, and projectile impact.
- [Canvas renderer](src/render.ts) draws the track, train, projectiles, and oscilloscope.

The tangent level repeats a bounded sweep from −1.9 to 1.9 radians and uses a reachable armor threshold of 2.45 rad/s.

Run `npm test` for the math and mission tests, `npm run check` for strict TypeScript checking, and `npm run build` to regenerate the offline game.
