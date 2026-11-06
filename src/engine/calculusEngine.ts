export type Formula = Readonly<{
  expression: string;
  at: (x: number) => number;
  substitute: (x: string) => string;
}>;

export type Rail = Readonly<{
  name: string;
  topic: string;
  c: number;
  left: Formula;
  right: Formula;
  adjustable: boolean;
  initialK: number;
  initialNode: number | null;
  rational?: boolean;
}>;

export type Wave = Readonly<{
  position: string;
  derivative: string;
  rule: string;
  period: number;
  start: number;
  range: number;
  theta: (t: number) => number;
  rate: (t: number) => number;
  substitute: (t: string) => string;
  tangent?: boolean;
}>;

export type Ammo = 'kinetic' | 'stasis';
export type Shield = 'armor' | 'phase';
export const CRITICAL = 3.5;
export const PRECISION = 0.25;
export const BASE_DAMAGE = 12;
export const STASIS_DAMAGE = 55;
export const TANGENT_WINDOW = 1.9;

export const format = (n: number, digits = 2): string =>
  Number(n.toFixed(digits)).toString().replace('-', '−');

const linear = (m: number, b: number): Formula => {
  const tail = b ? ` ${b < 0 ? '−' : '+'} ${Math.abs(b)}` : '';
  return {
    expression: `${m === 1 ? '' : format(m)}x${tail}`,
    at: x => m * x + b,
    substitute: x => `${m === 1 ? x : `${format(m)}(${x})`}${tail}`,
  };
};

const quadratic = (a: number, b: number): Formula => {
  const factor = a === 1 ? '' : format(a);
  const tail = ` ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
  return {
    expression: `${factor}x²${tail}`,
    at: x => a * x * x + b,
    substitute: x => `${factor}(${x})²${tail}`,
  };
};

// Cancel x − c before evaluating the side limits. The original is undefined at c.
const hole = (c: number): Formula => ({
  expression: `(x² − ${c * c}) / (x − ${c})`,
  at: x => x + c,
  substitute: x => `${x} + ${c}`,
});

export const rails: readonly Rail[] = [
  { name: 'The Lower Foundry', topic: 'Linear jump', c: 3, left: linear(2, 1),
    right: linear(1, 0), adjustable: true, initialK: 0, initialNode: 4 },
  { name: 'Hollow Junction', topic: 'Rational hole', c: 4, left: hole(4),
    right: hole(4), adjustable: false, initialK: 0, initialNode: null, rational: true },
  { name: 'The Furnace Curve', topic: 'Quadratic jump + hole', c: 2, left: quadratic(1, -2),
    right: linear(3, 0), adjustable: true, initialK: 0, initialNode: 6 },
  { name: 'Skyline Viaduct', topic: 'Piecewise polynomial', c: 4, left: quadratic(0.5, 3),
    right: linear(2, 0), adjustable: true, initialK: -1, initialNode: 8 },
  { name: 'The Outer Terminus', topic: 'Quadratic-to-linear joint', c: 5, left: quadratic(0.5, 1),
    right: linear(2, 1), adjustable: true, initialK: -2, initialNode: 11 },
];

export const waves: readonly Wave[] = [
  { position: '4 sin(t)', derivative: '4 cos(t)', rule: 'Differentiate sine to cosine and keep the factor 4.',
    period: 2 * Math.PI, start: 0, range: 4, theta: t => 4 * Math.sin(t),
    rate: t => 4 * Math.cos(t), substitute: t => `4 cos(${t})` },
  { position: '5 cos(t)', derivative: '−5 sin(t)', rule: 'Differentiate cosine to negative sine and keep the factor 5.',
    period: 2 * Math.PI, start: 0, range: 5, theta: t => 5 * Math.cos(t),
    rate: t => -5 * Math.sin(t), substitute: t => `−5 sin(${t})` },
  { position: '3 sin(t) + 4 cos(t)', derivative: '3 cos(t) − 4 sin(t)',
    rule: 'Differentiate each term, using the sum rule and keeping both constant factors.',
    period: 2 * Math.PI, start: 0, range: 5, theta: t => 3 * Math.sin(t) + 4 * Math.cos(t),
    rate: t => 3 * Math.cos(t) - 4 * Math.sin(t), substitute: t => `3 cos(${t}) − 4 sin(${t})` },
  { position: '2 tan(0.5t)', derivative: 'sec²(0.5t)', tangent: true,
    rule: 'Use the chain rule. The outer factor 2 and inner derivative 0.5 multiply to 1.',
    period: 2 * TANGENT_WINDOW, start: -TANGENT_WINDOW, range: 3.1,
    theta: t => 2 * Math.tan(0.5 * t), rate: t => 1 / Math.cos(0.5 * t) ** 2,
    substitute: t => `sec²(0.5 × ${t})` },
];

export function proceduralRail(random: () => number): Rail {
  const c = 2 + Math.floor(random() * 4);
  const left = random() < 0.5 ? linear(2, 1) : quadratic(0.5, 2);
  const right = linear(1 + Math.floor(random() * 2), Math.floor(random() * 3));
  return {
    name: 'Uncharted Corridor', topic: 'Procedural track', c, left, right,
    adjustable: true, initialK: left.at(c) - right.at(c) - 3,
    initialNode: left.at(c) + 2,
  };
}

export function continuity(rail: Rail, k: number, node: number | null) {
  const shift = rail.adjustable ? k : 0;
  const left = rail.left.at(rail.c);
  const right = rail.right.at(rail.c) + shift;
  const defined = node !== null && Number.isFinite(node);
  const meets = Math.abs(left - right) < 1e-9;
  const continuous = meets && defined && Math.abs(left - node) < 1e-9;
  const kind = !meets ? 'jump' : continuous ? 'continuous' : 'hole';
  return { left, right, defined, meets, continuous, kind } as const;
}

export function sampleWave(wave: Wave, elapsed: number) {
  const t = ((elapsed % wave.period) + wave.period) % wave.period + wave.start;
  return { t, theta: wave.theta(t), rate: wave.rate(t) };
}

export function shot(ammo: Ammo, shield: Shield, rate: number, threshold: number = CRITICAL) {
  const speed = Math.abs(rate);
  const ready = ammo === 'kinetic' ? speed >= threshold : speed < PRECISION;
  const output = ammo === 'kinetic' ? speed * BASE_DAMAGE : ready ? STASIS_DAMAGE : 0;
  const penetrates = ready && (ammo === 'kinetic' ? shield === 'armor' : shield === 'phase');
  return { ready, output, penetrates, damage: penetrates ? output : 0 };
}
