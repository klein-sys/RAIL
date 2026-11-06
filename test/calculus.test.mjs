import assert from 'node:assert/strict';
import test from 'node:test';
import {
  continuity, proceduralRail, rails, sampleWave, shot, waves,
} from '../src/engine/calculusEngine.ts';
import {
  advance, BOUNDARY_TIME, createMission, fire, loadSector, PULSE_FLIGHT, SECTOR_TIME, trainX, weld,
} from '../src/engine/mission.ts';

test('all campaign tracks require the intended shift and node', () => {
  const solutions = [[4, 7], [0, 8], [-4, 2], [3, 11], [2.5, 13.5]];
  for (const [i, rail] of rails.entries()) {
    const [shift, node] = solutions[i];
    assert.equal(continuity(rail, rail.initialK, rail.initialNode).continuous, false);
    assert.equal(continuity(rail, shift, null).kind, 'hole');
    assert.equal(continuity(rail, shift, node).kind, 'continuous');
  }
  assert.equal(continuity(rails[0], 0, 7).kind, 'jump');
  assert.equal(continuity(rails[1], 12, 8).continuous, true);
});

test('procedural tracks stay solvable with the half-step controls', () => {
  for (const c of [0, 0.26, 0.51, 0.99]) {
    for (const kind of [0.1, 0.9]) {
      for (const right of [0.1, 0.6, 0.9]) {
        const draws = [c, kind, right, right];
        const rail = proceduralRail(() => draws.shift());
        const node = rail.left.at(rail.c);
        const k = node - rail.right.at(rail.c);
        assert.ok(k >= -12 && k <= 12 && Number.isInteger(2 * k));
        assert.ok(node >= -6 && node <= 22 && Number.isInteger(2 * node));
        assert.equal(continuity(rail, k, node).continuous, true);
      }
    }
  }
});

test('all symbolic derivatives agree with finite differences in the sweep', () => {
  for (const wave of waves) {
    for (const t of [0, 0.4, 1, Math.PI / 2]) {
      const h = 1e-5;
      assert.ok(Math.abs((wave.theta(t + h) - wave.theta(t - h)) / (2 * h) - wave.rate(t)) < 1e-8);
    }
  }
  const tangent = waves[3];
  assert.ok(Number.isFinite(sampleWave(tangent, 9e6).rate));
  assert.ok(tangent.rate(tangent.start) > 2.45);
});

test('fire gates kinetic and stasis shots independently of the track', () => {
  assert.equal(shot('kinetic', 'armor', 0).damage, 0);
  assert.equal(shot('kinetic', 'armor', -4).damage, 48);
  assert.equal(shot('kinetic', 'phase', 5).damage, 0);
  assert.equal(shot('stasis', 'phase', 0.25).damage, 0);
  assert.equal(shot('stasis', 'phase', 0.249).damage, 55);
  assert.equal(shot('stasis', 'armor', 0).damage, 0);
  const game = createMission();
  game.status = 'active';
  game.waveTime = 0;
  assert.equal(fire(game), true);
  advance(game, PULSE_FLIGHT);
  assert.equal(game.enemy, 0);
  assert.equal(game.welded, false);
  advance(game, BOUNDARY_TIME - game.time);
  assert.equal(game.hull, 64);
});

test('the five-sector campaign can be completed with a full hull', () => {
  const game = createMission();
  game.status = 'active';
  for (let i = 0; i < rails.length; i++) {
    assert.equal(game.sector, i);
    game.node = game.rail.left.at(game.rail.c);
    game.k = game.rail.adjustable ? game.node - game.rail.right.at(game.rail.c) : 0;
    const before = game.enemy;
    assert.equal(weld(game), true);
    assert.equal(game.enemy, before);
    game.ammo = game.shield === 'phase' ? 'stasis' : 'kinetic';
    const offset = game.wave.tangent ? 0 : i === 2 ? 2.2 : 0;
    for (let j = 0; j < 2 && game.enemy > 0; j++) {
      game.waveTime = offset;
      assert.equal(fire(game), true);
      advance(game, 0.7);
    }
    assert.equal(game.enemy, 0);
    advance(game, BOUNDARY_TIME - game.time);
    assert.equal(trainX(game), game.rail.c);
    assert.equal(game.hull, 100);
    advance(game, SECTOR_TIME - game.time);
  }
  assert.equal(game.status, 'victory');
  assert.equal(game.destroyed, 5);
  loadSector(game, rails.length, () => 0.3);
  assert.equal(game.rail.topic, 'Procedural track');
});

test('presentation clock freezes and slows both live systems', () => {
  const game = createMission();
  game.status = 'active';
  const phase = game.waveTime;
  game.speed = 0;
  advance(game, 10);
  assert.equal(game.waveTime, phase);
  assert.equal(trainX(game), 0);
  game.speed = 0.25;
  advance(game, 4);
  assert.equal(game.time, 1);
  assert.equal(game.waveTime, phase + 1);
});

test('a pulse damages the shield only when it reaches the drone', () => {
  const game = createMission();
  game.status = 'active';
  game.waveTime = 0;
  const startingShield = game.enemy;

  assert.equal(fire(game), true);
  assert.equal(game.enemy, startingShield, 'a drone stays visible during flight');
  assert.equal(game.destroyed, 0);
  advance(game, 0.1);
  assert.equal(game.enemy, startingShield);

  game.ammo = 'stasis';
  game.waveTime = Math.PI / 2;
  advance(game, 0.5);
  assert.equal(game.enemy, 0, 'impact uses the ammo and derivative sampled at launch');
  assert.equal(game.destroyed, 1);
  advance(game, 1);
  assert.equal(game.destroyed, 1, 'impact is resolved only once');
});

test('a pulse launched before the sector exit resolves before the drone can escape', () => {
  const game = createMission();
  game.status = 'active';
  game.crossed = true;
  game.time = SECTOR_TIME - 0.05;
  game.waveTime = 0;

  assert.equal(fire(game), true);
  advance(game, 0.1);
  assert.equal(game.sector, 0);
  assert.equal(fire(game), false);
  advance(game, PULSE_FLIGHT);
  assert.equal(game.destroyed, 1);
  assert.equal(game.hull, 100);
  assert.equal(game.sector, 1);
});
