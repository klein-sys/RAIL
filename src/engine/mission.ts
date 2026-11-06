import {
  CRITICAL, continuity, format, proceduralRail, rails, sampleWave, shot, waves,
  type Ammo, type Rail, type Shield, type Wave,
} from './calculusEngine.ts';

export const CAMPAIGN_LENGTH = rails.length;
export const REQUIRED_DRONES = 3;
export const BOUNDARY_TIME = 20;
export const SECTOR_TIME = 30;
export const COOLDOWN = 0.65;
export const PULSE_FLIGHT = 0.36;
const WAVE_SEQUENCE = [0, 1, 2, 3, 1] as const;
export type Speed = 0 | 0.25 | 1;
export type Status = 'briefing' | 'active' | 'victory' | 'defeat';

export type Mission = {
  status: Status;
  speed: Speed;
  sector: number;
  endless: boolean;
  rail: Rail;
  wave: Wave;
  k: number;
  node: number | null;
  welded: boolean;
  crossed: boolean;
  time: number;
  waveTime: number;
  hull: number;
  shield: Shield;
  threshold: number;
  enemy: number;
  enemyMax: number;
  destroyed: number;
  ammo: Ammo;
  cooldown: number;
  pulse: {
    age: number;
    ammo: Ammo;
    fromX: number;
    launchedAt: number;
    angle: number;
    rate: number;
    damage: number;
    correctAmmo: boolean;
  } | null;
  impact: number;
  feed: { text: string; tone: 'info' | 'good' | 'bad' };
};

export function loadSector(game: Mission, sector: number, random = Math.random): void {
  const wave = waves[WAVE_SEQUENCE[sector] ?? sector % waves.length]!;
  const rail = rails[sector] ?? proceduralRail(random);
  const phase = !wave.tangent && (sector === 1 || sector === 4 || (sector >= CAMPAIGN_LENGTH && sector % 2 === 1));
  const enemy = phase ? (sector === 1 ? 55 : 95) : [43, 55, 82, 54, 88][sector] ?? 85;
  Object.assign(game, {
    sector, rail, wave, k: rail.initialK, node: rail.initialNode,
    welded: false, crossed: false, time: 0,
    waveTime: sector === 0 ? 0.75 : 0, shield: phase ? 'phase' : 'armor',
    threshold: wave.tangent ? 2.45 : CRITICAL, enemy, enemyMax: enemy,
    cooldown: 0, pulse: null, impact: 0,
    feed: { text: `Sector ${sector + 1} · ${rail.name} ahead.`, tone: 'info' },
  } satisfies Partial<Mission>);
}

export function createMission(): Mission {
  const game: Mission = {
    status: 'briefing', speed: 1, sector: 0, endless: false, rail: rails[0]!,
    wave: waves[0]!, k: 0, node: 4, welded: false, crossed: false,
    time: 0, waveTime: 0, hull: 100, shield: 'armor', threshold: CRITICAL,
    enemy: 0, enemyMax: 0, destroyed: 0, ammo: 'kinetic', cooldown: 0,
    pulse: null, impact: 0, feed: { text: '', tone: 'info' },
  };
  loadSector(game, 0);
  return game;
}

export function trainX(game: Mission): number {
  return game.time < BOUNDARY_TIME
    ? (game.time / BOUNDARY_TIME) * game.rail.c
    : game.rail.c + (game.time - BOUNDARY_TIME) / (SECTOR_TIME - BOUNDARY_TIME) * (10 - game.rail.c);
}

export function weld(game: Mission): boolean {
  if (game.status !== 'active' || game.crossed || game.welded) return false;
  const result = continuity(game.rail, game.k, game.node);
  game.welded = result.continuous;
  game.feed = result.continuous
    ? { text: 'Weld sealed. The train can cross the joint safely.', tone: 'good' }
    : { text: result.meets ? 'Weld rejected. Match the node to the common limit.'
      : 'Weld rejected. Match the left and right limits first.', tone: 'bad' };
  return game.welded;
}

export function canFire(game: Mission): boolean {
  return game.status === 'active' && game.cooldown === 0 && game.enemy > 0 && game.time < SECTOR_TIME;
}

export function fire(game: Mission): boolean {
  if (!canFire(game)) return false;
  const live = sampleWave(game.wave, game.waveTime);
  const result = shot(game.ammo, game.shield, live.rate, game.threshold);
  game.cooldown = COOLDOWN;
  game.pulse = {
    age: 0, ammo: game.ammo, fromX: trainX(game), launchedAt: game.time,
    angle: live.theta, rate: live.rate, damage: result.damage,
    correctAmmo: game.ammo === (game.shield === 'armor' ? 'kinetic' : 'stasis'),
  };
  game.feed = { text: `Pulse away · |θ′| = ${format(Math.abs(live.rate))} rad/s.`, tone: 'info' };
  return true;
}

function advancePulse(game: Mission, step: number): void {
  const pulse = game.pulse;
  if (!pulse) return;
  const inFlight = pulse.age < PULSE_FLIGHT;
  pulse.age += step;
  if (inFlight && pulse.age >= PULSE_FLIGHT) {
    resolvePulse(game, pulse);
  }
  if (pulse.age >= COOLDOWN) game.pulse = null;
}

function resolvePulse(game: Mission, pulse: NonNullable<Mission['pulse']>): void {
  game.enemy = Math.max(0, game.enemy - pulse.damage);
  if (game.enemy === 0) {
    game.destroyed++;
    game.feed = { text: `Harvester down · |θ′| = ${format(Math.abs(pulse.rate))} rad/s.`, tone: 'good' };
  } else if (pulse.damage > 0) {
    game.feed = { text: `Shield pierced · ${format(pulse.damage, 1)} damage.`, tone: 'good' };
  } else {
    game.feed = { text: pulse.correctAmmo
      ? `Shot deflected · |θ′| = ${format(Math.abs(pulse.rate))} rad/s fell outside the window.`
      : 'Shot deflected. Switch ammo to match the shield.', tone: 'bad' };
  }
}

function damage(game: Mission, amount: number, text: string): void {
  game.hull = Math.max(0, game.hull - amount);
  game.impact = 0.45;
  game.feed = { text, tone: 'bad' };
  if (game.hull === 0) game.status = 'defeat';
}

export function advance(game: Mission, seconds: number): void {
  if (game.status !== 'active' || game.speed === 0) return;
  const step = seconds * game.speed;
  game.time = Math.min(SECTOR_TIME, game.time + step);
  game.waveTime += step;
  game.cooldown = Math.max(0, game.cooldown - step);
  game.impact = Math.max(0, game.impact - step);
  advancePulse(game, step);
  if (!game.crossed && game.time >= BOUNDARY_TIME) {
    game.crossed = true;
    if (game.welded) {
      game.feed = { text: 'Joint crossed safely. On to the sector exit.', tone: 'good' };
    } else {
      damage(game, 36, 'Emergency re-rail at the unsealed joint · −36 hull.');
    }
  }
  if (game.time < SECTOR_TIME || game.status !== 'active' || (game.pulse && game.pulse.age < PULSE_FLIGHT)) return;
  if (game.enemy > 0) damage(game, 24, 'The surviving Harvester struck the train · −24 hull.');
  if (game.hull === 0) return;
  if (!game.endless && game.sector + 1 === CAMPAIGN_LENGTH) {
    game.status = game.destroyed >= REQUIRED_DRONES ? 'victory' : 'defeat';
  } else {
    const warning = game.enemy > 0 ? game.feed : null;
    const impact = game.impact;
    loadSector(game, game.sector + 1);
    if (warning) {
      game.feed = warning;
      game.impact = impact;
    }
  }
}
