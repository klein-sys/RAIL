import {
  BASE_DAMAGE, PRECISION, TANGENT_WINDOW, continuity, format, sampleWave, shot,
  type Ammo,
} from './engine/calculusEngine.ts';
import {
  advance, BOUNDARY_TIME, CAMPAIGN_LENGTH, canFire, createMission, fire, loadSector,
  PULSE_FLIGHT, REQUIRED_DRONES, trainX, weld, type Speed,
} from './engine/mission.ts';
import { drawScope, worldRenderer } from './render.ts';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing interface element: ${id}`);
  return element as T;
}

const inputs = { shift: el<HTMLInputElement>('shift'), node: el<HTMLInputElement>('node') };
const cover = el('scene-cover');
const launch = el<HTMLButtonElement>('launch');
const endless = el<HTMLButtonElement>('endless');
const weldButton = el<HTMLButtonElement>('weld');
const fireButton = el<HTMLButtonElement>('fire');
const touchBar = el('touch-combat');
const touchAmmo = el<HTMLButtonElement>('touch-ammo');
const touchFire = el<HTMLButtonElement>('touch-fire');
const inspector = el<HTMLDialogElement>('inspector');
const world = worldRenderer(el<HTMLCanvasElement>('world'));
const scope = el<HTMLCanvasElement>('scope');
const speedButtons = [
  [1, el<HTMLButtonElement>('speed-normal')],
  [0.25, el<HTMLButtonElement>('speed-slow')],
  [0, el<HTMLButtonElement>('speed-pause')],
] as const;
const ammoButtons = { kinetic: el('kinetic'), stasis: el('stasis') };
const pieces = Array.from({ length: 3 }, () => document.createElement('div'));
const railSteps = Array.from({ length: 4 }, () => document.createElement('li'));
const waveSteps = Array.from({ length: 4 }, () => document.createElement('li'));
el('piecewise').append(...pieces);
el('rail-example').append(...railSteps);
el('wave-example').append(...waveSteps);

let game = createMission();
let dirty = true;
let previousStatus = game.status;
let lastFrame = 0;
let lastPaint = 0;

function setText(element: HTMLElement | string, value: string) {
  const target = typeof element === 'string' ? el(element) : element;
  if (target.textContent !== value) target.textContent = value;
}

function setBadge(id: string, pass: boolean) {
  const badge = el(id);
  badge.dataset.pass = String(pass);
  setText(badge, pass ? 'PASS' : 'FAIL');
}

function number(value: number, digits = 2) {
  const rounded = value.toFixed(digits);
  return Number(rounded) === 0 ? (0).toFixed(digits) : rounded.replace('-', '−');
}

function canEditTrack() {
  return game.status === 'active' && !game.crossed && !game.welded;
}

function syncTrack() {
  const { rail, node, k } = game;
  const check = continuity(rail, k, node);
  const right = rail.adjustable ? rail.right.expression + ' + k' : rail.right.expression;
  const nodeText = node === null ? 'undefined' : format(node);
  const entries = [
    `f(x) = ${rail.left.expression}   [x < ${rail.c}]`,
    `         ${nodeText}   [x = ${rail.c}]`,
    `         ${right}   [x > ${rail.c}]`,
  ];
  pieces.forEach((piece, index) => setText(piece, entries[index]!));
  setText('condition-node', `f(${rail.c}) = ${nodeText}`);
  setText('condition-limits', `LHL ${format(check.left)} ${check.meets ? '=' : '≠'} RHL ${format(check.right)}`);
  setText('condition-value', check.continuous
    ? game.welded ? 'CONTINUOUS · RAIL LOCKED' : 'CONTINUOUS · READY TO WELD'
    : 'DISCONTINUOUS · DANGER');
  setBadge('badge-node', check.defined);
  setBadge('badge-limits', check.meets);
  setBadge('badge-value', check.continuous);
  setText('shift-value', rail.adjustable ? format(k) : 'fixed');
  setText('node-symbol', `f(${rail.c})`);
  setText('node-value', node === null ? 'unset' : format(node));
  inputs.shift.value = String(k);
  inputs.node.value = String(node ?? 0);
  inputs.node.setAttribute('aria-valuetext', nodeText);
  const editable = canEditTrack();
  inputs.shift.disabled = !editable || !rail.adjustable;
  inputs.node.disabled = !editable;
  for (const field of ['shift', 'node'] as const) {
    const input = inputs[field];
    el<HTMLButtonElement>(field + '-down').disabled = input.disabled || input.valueAsNumber <= Number(input.min);
    el<HTMLButtonElement>(field + '-up').disabled = input.disabled || input.valueAsNumber >= Number(input.max);
  }
  weldButton.disabled = !editable;
  setText('weld-label', game.welded ? 'Rail locked' : game.crossed ? 'Boundary passed' : 'Engage track weld');
}

function syncCombat(live: ReturnType<typeof sampleWave>) {
  const { wave, enemy, ammo, shield, threshold } = game;
  const output = shot(ammo, shield, live.rate, threshold);
  setText('position-formula', wave.position);
  setText('derivative-formula', wave.derivative);
  setText('phase-value', `${number(live.t)} rad`);
  setText('rate-value', `${number(live.rate)} rad/s`);
  setText('power-value', `${number(output.output, 1)} MW`);
  setText('enemy-name', enemy <= 0 ? 'HARVESTER ELIMINATED' : shield === 'phase' ? 'PHASE HARVESTER' : 'ARMORED HARVESTER');
  setText('enemy-window', enemy <= 0 ? 'SKY LANE CLEAR'
    : shield === 'phase' ? 'STASIS · |θ′| < 0.25' : `KINETIC · |θ′| ≥ ${threshold}`);
  const shieldMeter = el<HTMLMeterElement>('enemy-health');
  shieldMeter.max = game.enemyMax;
  shieldMeter.value = enemy;
  el('enemy-strip').dataset.shield = enemy <= 0 ? 'clear' : shield;
  for (const mode of ['kinetic', 'stasis'] as const) {
    ammoButtons[mode].setAttribute('aria-pressed', String(mode === ammo));
  }
  const window = el('fire-window');
  const rightAmmo = ammo === (shield === 'armor' ? 'kinetic' : 'stasis');
  const available = canFire(game);
  const ready = available && output.penetrates;
  const inFlight = game.pulse !== null && game.pulse.age < PULSE_FLIGHT;
  const cue = enemy <= 0 ? 'Sky lane clear' : inFlight ? 'Pulse in flight' : game.cooldown > 0 ? 'Recharging'
    : !rightAmmo ? `Use ${shield === 'armor' ? 'Kinetic' : 'Stasis'}` : ready ? 'Fire now' : 'Wait for window';
  window.dataset.ready = String(ready);
  setText(window, `${ready ? '● CRITICAL' : '◇'} · ${cue.toUpperCase()}`);
  touchBar.hidden = game.status !== 'active';
  touchBar.dataset.ready = String(ready);
  setText('touch-window', cue);
  setText('touch-rate', `|θ′| ${number(Math.abs(live.rate))} rad/s`);
  setText(touchAmmo, ammo === 'kinetic' ? 'Kinetic' : 'Stasis');
  touchAmmo.setAttribute('aria-label', ammo === 'kinetic' ? 'Kinetic equipped. Switch to Stasis' : 'Stasis equipped. Switch to Kinetic');
  for (const button of [fireButton, touchFire]) {
    button.setAttribute('aria-disabled', String(!available));
    button.dataset.ready = String(ready);
  }
  setText('fire-label', enemy <= 0 ? 'Target eliminated' : inFlight ? 'Pulse in flight'
    : game.cooldown > 0 ? 'Capacitor cycling' : 'Fire plasma pulse');
  drawScope(scope, wave, live.t, threshold, ammo);
}

function syncInspector(live: ReturnType<typeof sampleWave>) {
  const { rail, wave, k, node, ammo, shield, threshold } = game;
  for (const [speed, button] of speedButtons) button.setAttribute('aria-pressed', String(game.speed === speed));
  const c = String(rail.c);
  const check = continuity(rail, k, node);
  const rawRight = rail.right.at(rail.c);
  const shift = rail.adjustable ? ` + (${format(k)})` : '';
  const leftEvaluation = rail.left.substitute(c);
  const rightEvaluation = rail.right.substitute(c);
  const prefix = rail.rational
    ? `Factor x² − ${rail.c ** 2} into (x − ${c})(x + ${c}) and cancel x − ${c} for x ≠ ${c}. `
    : '';
  const common = check.meets ? format(check.left) : 'does not exist';
  const steps = [
    `${prefix}Approach from the left. lim x→${c}⁻ f(x) = ${leftEvaluation} = ${format(check.left)}.`,
    `Approach from the right. lim x→${c}⁺ f(x) = ${rightEvaluation}${shift}${rail.adjustable && rightEvaluation !== format(rawRight) ? ` = ${format(rawRight)}${shift}` : ''} = ${format(check.right)}.`,
    `Evaluate the joint. f(${c}) is ${node === null ? 'undefined' : format(node)}. The two-sided limit ${check.meets ? 'is ' : ''}${common}.`,
    check.continuous ? 'All three conditions pass. Both rails meet at the defined node.'
      : check.meets ? `A hole remains. Set f(${c}) to ${common}.`
        : `A jump remains. Solve ${format(rawRight)} + k = ${format(check.left)}, so k = ${format(check.left - rawRight)}.`,
  ];
  railSteps.forEach((li, index) => setText(li, steps[index]!));

  const atQuarterTurn = Math.abs(live.t - Math.PI / 2) < 1e-10;
  const phase = atQuarterTurn ? 'π/2' : number(live.t, 4);
  const result = shot(ammo, shield, live.rate, threshold);
  const combat = [
    `Start with θ(t) = ${wave.position}. ${wave.rule}${wave.tangent ? ` The phase loops inside [−${TANGENT_WINDOW}, ${TANGENT_WINDOW}] rad, away from the asymptotes. Each reset starts a new sweep.` : ''}`,
    `The derivative is dθ/dt = ${wave.derivative}.`,
    `At t ${atQuarterTurn ? '=' : '≈'} ${phase} rad, θ′(t) = ${wave.substitute(phase)} ≈ ${number(live.rate, 4)} rad/s.`,
    ammo === 'kinetic'
      ? `Kinetic output is ${BASE_DAMAGE} × |θ′| ≈ ${number(result.output, 2)} MW. This shot projects ${number(result.damage, 2)} damage after applying the armor threshold of ${threshold} rad/s and checking shield type.`
      : `Stasis requires |θ′| < ${PRECISION} rad/s and a phase shield. This shot projects ${number(result.damage, 2)} damage.`,
  ];
  waveSteps.forEach((li, index) => setText(li, combat[index]!));
}

function paint() {
  const { status, rail, sector, time } = game;
  const live = sampleWave(game.wave, game.waveTime);
  world(game, live.theta);
  syncTrack();
  syncCombat(live);
  if (inspector.open) syncInspector(live);
  setText('sector-counter', game.endless ? `PATROL / ${String(sector + 1).padStart(2, '0')}`
    : `SECTOR ${String(sector + 1).padStart(2, '0')} / ${String(CAMPAIGN_LENGTH).padStart(2, '0')}`);
  Array.from(el('sector-pips').children).forEach((pip, index) => {
    pip.classList.toggle('passed', index < sector);
    pip.classList.toggle('current', index === sector);
  });
  setText('sector-name', rail.name);
  setText('viewport-state', status === 'active' ? game.speed === 0 ? 'PAUSED' : game.speed === 0.25 ? 'SLOW MOTION' : 'LIVE'
    : status === 'victory' ? 'COMPLETE' : status === 'defeat' ? 'OFFLINE' : 'STANDBY');
  el<HTMLMeterElement>('hull').value = game.hull;
  el('hull').dataset.low = String(game.hull <= 36);
  setText('hull-value', `${game.hull}%`);
  setText('train-position', `x = ${number(trainX(game))}`);
  setText('boundary-coord', `c = ${rail.c}`);
  setText('boundary-time', game.crossed ? 'PASSED' : `${number(BOUNDARY_TIME - time, 1)} s`);
  el('boundary-time').classList.toggle('urgent', !game.welded && !game.crossed && time > BOUNDARY_TIME - 5);
  setText('drone-count', `${String(game.destroyed).padStart(2, '0')}${game.endless ? '' : ` / 0${REQUIRED_DRONES}`}`);
  if (status !== 'briefing') setText('feed', game.feed.text);
  el('feed').dataset.tone = game.feed.tone;
  cover.hidden = status === 'active';
  if (status !== previousStatus && status !== 'active') {
    setText('cover-title', status === 'victory' ? 'Terminus secured.' : 'Mission lost.');
    setText('cover-body', status === 'victory'
      ? `Campaign complete with ${game.hull}% hull and ${game.destroyed} Harvesters destroyed.`
      : game.hull === 0 ? `Hull depleted in sector ${sector + 1}. ${game.destroyed} Harvesters destroyed.`
        : `Only ${game.destroyed} Harvesters destroyed. The campaign requires at least ${REQUIRED_DRONES}.`);
    setText(launch, 'Replay campaign →');
    endless.hidden = status !== 'victory';
    if (!inspector.open) launch.focus({ preventScroll: true });
  }
  previousStatus = status;
}

function start(patrol = false) {
  const speed = game.speed;
  if (patrol) {
    game.endless = true;
    loadSector(game, CAMPAIGN_LENGTH);
  } else if (game.status !== 'briefing') {
    game = createMission();
  }
  game.speed = speed;
  game.status = 'active';
  game.feed = { text: `Sector ${game.sector + 1} · ${game.rail.topic}. Weld before the joint.`, tone: 'info' };
  paint();
  el('scene').focus({ preventScroll: true });
}

function changeField(field: keyof typeof inputs, delta?: number) {
  const input = inputs[field];
  if (!canEditTrack() || (field === 'shift' && !game.rail.adjustable)) return;
  const current = field === 'shift' ? game.k : game.node ?? 0;
  const value = delta === undefined ? input.valueAsNumber
    : Math.min(Number(input.max), Math.max(Number(input.min), current + delta));
  if (field === 'shift') game.k = value;
  else game.node = value;
  dirty = true;
}

function setSpeed(speed: Speed) {
  game.speed = speed;
  setText('presentation-status', speed === 0 ? 'Simulation frozen at its current train position and turret phase.'
    : `Simulation running at ${speed}×. This speed stays active when the inspector closes.`);
  dirty = true;
}

function switchAmmo(mode: Ammo) {
  game.ammo = mode;
  dirty = true;
}

launch.addEventListener('click', () => start());
endless.addEventListener('click', () => start(true));
weldButton.addEventListener('click', () => { weld(game); dirty = true; });
fireButton.addEventListener('click', () => { fire(game); dirty = true; });
touchFire.addEventListener('click', () => { fire(game); dirty = true; });
touchAmmo.addEventListener('click', () => switchAmmo(game.ammo === 'kinetic' ? 'stasis' : 'kinetic'));
for (const field of ['shift', 'node'] as const) {
  inputs[field].addEventListener('input', () => changeField(field));
  el(field + '-down').addEventListener('click', () => changeField(field, -0.5));
  el(field + '-up').addEventListener('click', () => changeField(field, 0.5));
}
for (const mode of ['kinetic', 'stasis'] as const) ammoButtons[mode].addEventListener('click', () => switchAmmo(mode));
for (const [speed, button] of speedButtons) button.addEventListener('click', () => setSpeed(speed));
el('open-inspector').addEventListener('click', () => {
  inspector.showModal();
  syncInspector(sampleWave(game.wave, game.waveTime));
});
el('freeze-phase').addEventListener('click', () => {
  game.waveTime = Math.PI / 2 - game.wave.start;
  setSpeed(0);
});

document.addEventListener('keydown', event => {
  if (inspector.open || event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  const target = event.target;
  const nativeControl = target instanceof HTMLElement && target.closest('button, a, input, select, textarea, [contenteditable]');
  if (key.startsWith('arrow') && target instanceof HTMLInputElement) return;
  if ((key === 'enter' || key === ' ') && nativeControl) return;
  if (game.status !== 'active') return;
  if (key === 'w' || key === 'arrowup') changeField('shift', 0.5);
  else if (key === 's' || key === 'arrowdown') changeField('shift', -0.5);
  else if (key === 'd' || key === 'arrowright') changeField('node', 0.5);
  else if (key === 'a' || key === 'arrowleft') changeField('node', -0.5);
  else if (key === 'enter') { if (!event.repeat) weld(game); }
  else if (key === ' ') { if (!event.repeat) fire(game); }
  else return;
  event.preventDefault();
  dirty = true;
});

function frame(now: number) {
  const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
  lastFrame = now;
  const running = !document.hidden && game.status === 'active' && game.speed !== 0;
  if (running) advance(game, elapsed);
  if (dirty || game.status !== previousStatus || (running && now - lastPaint >= 30)) {
    paint();
    dirty = false;
    lastPaint = now;
  }
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => { lastFrame = 0; });
paint();
requestAnimationFrame(frame);
