import { continuity, format, type Wave } from './engine/calculusEngine.ts';
import { COOLDOWN, PULSE_FLIGHT, SECTOR_TIME, trainX, type Mission } from './engine/mission.ts';

const WIDTH = 960;
const HEIGHT = 630;
const GREEN = '#4be8b0';
const BLUE = '#53d6ff';
const ROSE = '#ff6485';
const mapX = (x: number) => 112 + x * 80;
const TURRET_X = -28;
const TURRET_Y = -44;
const BARREL_LENGTH = 35;
type Point = readonly [number, number];

function dronePosition(time: number, reduced: boolean): Point {
  return [745 + (reduced ? 0 : 21 * Math.sin(time * 0.9)),
    151 + (reduced ? 0 : 13 * Math.sin(time * 1.7))];
}

function turretHeading(theta: number): number {
  return -0.89 + theta * 0.12;
}
const seeded = (n: number) => {
  const value = Math.sin(n * 78.233 + 19.4) * 43758.5453;
  return value - Math.floor(value);
};

function line(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], color: string, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function polygon(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], fill: string, stroke?: string) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function landscape() {
  const background = document.createElement('canvas');
  background.width = WIDTH;
  background.height = HEIGHT;
  const ctx = background.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#091222');
  sky.addColorStop(0.55, '#11293b');
  sky.addColorStop(1, '#080d19');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const haze = ctx.createRadialGradient(730, 229, 15, 730, 229, 430);
  haze.addColorStop(0, '#28526a88');
  haze.addColorStop(1, '#0e172400');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let i = 0; i < 115; i++) {
    ctx.fillStyle = i % 9 === 0 ? '#7de7ff92' : '#a8c9e24d';
    ctx.fillRect(seeded(i + 1) * WIDTH, seeded(i + 200) * 357, i % 9 === 0 ? 2 : 1, 1);
  }
  circle(ctx, 768, 160, 101, '#142d435c', '#65b8d227');
  circle(ctx, 768, 160, 87, '#2d566433', '#65b8d222');
  ctx.save();
  ctx.beginPath();
  ctx.arc(768, 160, 87, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 12; i++) line(ctx, [[665, 87 + i * 14], [870, 87 + i * 14]], '#72cad317');
  ctx.restore();
  for (let layer = 0; layer < 3; layer++) {
    const floor = 430 + layer * 36;
    const shade = ['#14283c', '#0e2031', '#0b1728'][layer]!;
    for (let i = 0; i < 26; i++) {
      const x = i * 39 - (layer * 17);
      const width = 17 + seeded(i + layer * 50) * 25;
      const height = 22 + seeded(i + layer * 90 + 7) * (layer === 0 ? 123 : 89);
      const top = floor - height;
      polygon(ctx, [[x, floor], [x, top + 8], [x + 7, top], [x + width - 5, top], [x + width, top + 9], [x + width, floor]], shade, '#64a8c013');
      if (i % 4 === layer) {
        line(ctx, [[x + 12, top], [x + 12, top - 22]], '#48748b');
        circle(ctx, x + 12, top - 22, 1.5, i % 2 ? '#ff7f99' : '#61dbe5');
      }
      for (let row = 0; row < height / 13; row++) {
        for (let col = 0; col < width / 9 - 1; col++) {
          if (seeded(i + row * 27 + col * 102 + layer * 37) < 0.39) continue;
          ctx.fillStyle = layer === 2 ? '#4c98a648' : '#6bafc13b';
          ctx.fillRect(x + 5 + col * 8, top + 12 + row * 12, 3, 2);
        }
      }
    }
  }
  const floor = ctx.createLinearGradient(0, 467, 0, HEIGHT);
  floor.addColorStop(0, '#101d2c00');
  floor.addColorStop(0.42, '#09131fe5');
  floor.addColorStop(1, '#080f1c');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 467, WIDTH, HEIGHT - 467);
  for (let i = -5; i <= 5; i++) line(ctx, [[480 + i * 33, 459], [480 + i * 170, 630]], '#3b79942b');
  for (const y of [481, 501, 526, 559, 600]) line(ctx, [[0, y], [WIDTH, y]], '#3b79942b');
  for (let x = 32; x < WIDTH; x += 28) line(ctx, [[x, 12], [x, 17]], '#91dbf936');
  line(ctx, [[17, 40], [17, 19], [37, 19]], '#79b6d288');
  line(ctx, [[923, 19], [943, 19], [943, 40]], '#79b6d288');
  return background;
}

function railPath(ctx: CanvasRenderingContext2D, from: number, to: number, heightAt: (x: number) => number, color: string) {
  const points: [number, number][] = [];
  for (let i = 0; i <= 75; i++) {
    const x = from + (to - from) * i / 75;
    points.push([mapX(x), heightAt(x)]);
  }
  for (let i = 1; i < points.length; i += 4) {
    const [x, y] = points[i]!;
    line(ctx, [[x - 4, y + 9], [x + 3, y - 4]], '#6d8ba5', 2);
    if (i % 16 === 1) {
      line(ctx, [[x, y + 8], [x - 9, 548], [x + 14, 548], [x + 5, y + 8]], '#254456', 2);
      circle(ctx, x + 2, y + 11, 2, color);
    }
  }
  line(ctx, points.map(([x, y]) => [x, y + 7]), '#070e19', 9);
  line(ctx, points.map(([x, y]) => [x, y + 6]), color + '6a', 2);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  line(ctx, points, color, 3);
  ctx.restore();
  line(ctx, points, '#e5fffb', 0.85);
}

function drawTrain(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, impact: boolean) {
  ctx.save();
  ctx.translate(x, y);
  const glow = impact ? ROSE : BLUE;
  const metal = ctx.createLinearGradient(0, -48, 0, -1);
  metal.addColorStop(0, '#66869d');
  metal.addColorStop(0.36, '#304b61');
  metal.addColorStop(1, '#111c2f');
  ctx.shadowColor = glow;
  ctx.shadowBlur = 12;
  line(ctx, [[-68, -2], [24, -2]], glow, 2);
  ctx.shadowBlur = 0;
  polygon(ctx, [[-96,-12],[-96,-27],[-88,-34],[-69,-34],[-64,-28],[-64,-11]], '#243e52', '#6d8c9d');
  polygon(ctx, [[-66,-9],[-66,-33],[-55,-44],[4,-44],[16,-36],[32,-21],[32,-11],[20,-6],[-58,-6]], '#132332', '#7c9cb1');
  ctx.beginPath();
  ctx.moveTo(-61,-14);
  ctx.lineTo(-61,-31);
  ctx.lineTo(-51,-40);
  ctx.lineTo(4,-40);
  ctx.lineTo(26,-20);
  ctx.lineTo(24,-14);
  ctx.closePath();
  ctx.fillStyle = metal;
  ctx.fill();
  polygon(ctx, [[-1,-37],[6,-35],[17,-24],[-1,-24]], '#79e8ff', '#a2f6ff');
  polygon(ctx, [[-20,-37],[-7,-37],[-7,-25],[-20,-25]], '#15354d', '#57a3bc');
  line(ctx, [[-58,-19],[-34,-19],[-27,-13],[18,-13]], '#54bad3', 1.5);
  line(ctx, [[-91,-24],[-75,-24]], '#6899af', 2);
  for (const wheel of [-87, -72, -48, -29, 6, 20]) {
    circle(ctx, wheel, -6, 4.5, '#0b1526', '#6a8ca6');
  }
  ctx.fillStyle = '#ecfeff';
  ctx.fillRect(26, -19, 5, 3);
  ctx.translate(TURRET_X, TURRET_Y);
  circle(ctx, 0, 0, 9, '#1d354b', '#819daf');
  ctx.rotate(heading);
  polygon(ctx, [[-3,-4],[BARREL_LENGTH,-3],[BARREL_LENGTH,3],[-3,5]], '#3c627a', '#8aabbb');
  line(ctx, [[6, -1], [BARREL_LENGTH, -1]], glow, 2);
  circle(ctx, BARREL_LENGTH, 0, 3, '#e0faff');
  ctx.restore();
}

function drawDrone(ctx: CanvasRenderingContext2D, x: number, y: number, phase: boolean) {
  const color = phase ? '#bf9fff' : ROSE;
  ctx.save();
  ctx.translate(x, y);
  ctx.setLineDash([10, 7]);
  circle(ctx, 0, 0, 40, '#0d12284c', color + '92');
  ctx.setLineDash([]);
  line(ctx, [[-64, 0], [-45, 0]], color + '85');
  line(ctx, [[45, 0], [64, 0]], color + '85');
  polygon(ctx, [[-56,-7],[-42,-17],[-19,-12],[0,-21],[19,-12],[42,-17],[56,-7],[35,11],[16,9],[0,21],[-16,9],[-35,11]], '#29364f', '#91a8be');
  polygon(ctx, [[-26,-5],[-10,-14],[12,-14],[26,-4],[13,13],[-13,13]], '#18263c', color);
  line(ctx, [[-43,-8],[-30,-5]], color, 2);
  line(ctx, [[30,-5],[43,-8]], color, 2);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  circle(ctx, 0, 0, 8, color);
  circle(ctx, 0, 0, 3, '#fff3ff');
  ctx.restore();
}

function drawPulse(ctx: CanvasRenderingContext2D, pulse: NonNullable<Mission['pulse']>,
  launch: Point, target: Point, reduced: boolean) {
  const [tx, ty] = target;
  const color = pulse.ammo === 'kinetic' ? BLUE : '#cba5ff';
  if (pulse.age >= PULSE_FLIGHT) {
    const fade = (pulse.age - PULSE_FLIGHT) / (COOLDOWN - PULSE_FLIGHT);
    ctx.save();
    ctx.globalAlpha = 1 - fade;
    circle(ctx, tx, ty, 11 + fade * 23, '#85dfff13', pulse.damage > 0 ? color : ROSE);
    if (!reduced && pulse.damage > 0) {
      for (let i = 0; i < 8; i++) {
        const radius = 11 + fade * 40;
        circle(ctx, tx + Math.cos(i * 0.8) * radius, ty + Math.sin(i * 0.8) * radius, 2, color);
      }
    }
    ctx.restore();
    return;
  }

  const heading = turretHeading(pulse.angle);
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  const startX = launch[0] + TURRET_X + dx * BARREL_LENGTH;
  const startY = launch[1] + TURRET_Y + dy * BARREL_LENGTH;
  const lead = Math.min(120, Math.hypot(tx - startX, ty - startY) * 0.44);
  const controlX = startX + dx * lead;
  const controlY = startY + dy * lead;
  const pointAt = (t: number): Point => {
    const inverse = 1 - t;
    return [inverse ** 2 * startX + 2 * t * inverse * controlX + t ** 2 * tx,
      inverse ** 2 * startY + 2 * t * inverse * controlY + t ** 2 * ty];
  };
  const progress = pulse.age / PULSE_FLIGHT;
  const head = pointAt(progress);
  const trail = pointAt(Math.max(0, progress - 0.075));
  line(ctx, [trail, head], color, 6);
  line(ctx, [trail, head], '#f1faff', 2);
  circle(ctx, head[0], head[1], 4, color);
}

export function worldRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const background = landscape();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  return (game: Mission, theta: number) => {
    const { rail, k, node } = game;
    const result = continuity(rail, k, node);
    const shift = rail.adjustable ? k : 0;
    const top = Math.max(22, rail.right.at(10) + (rail.adjustable ? 12 : 0));
    const bottom = Math.min(-6, rail.left.at(0), rail.right.at(rail.c) - (rail.adjustable ? 12 : 0));
    const y = (height: number) => 486 - ((height - bottom) / (top - bottom)) * 253;
    const actual = (x: number) => x < rail.c ? rail.left.at(x) : rail.right.at(x) + shift;
    const xJoint = mapX(rail.c);
    const enemy = dronePosition(game.time, reduced.matches);
    const jointColor = result.continuous ? GREEN : ROSE;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    if (game.impact > 0 && !reduced.matches) ctx.translate(Math.sin(game.impact * 133) * game.impact * 9, 0);
    ctx.drawImage(background, 0, 0);
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94c8dd';
    ctx.fillText('MAG-LEV // LIVE TRACK SCAN', 31, 39);
    ctx.fillStyle = '#69879c';
    ctx.fillText('ELEVATION / y', 31, 208);
    for (let x = 0; x <= 10; x++) {
      const px = mapX(x);
      line(ctx, [[px, 218], [px, 548]], '#6da7be24');
      line(ctx, [[px, 549], [px, 557]], '#6da7be78');
      ctx.fillStyle = x === rail.c ? jointColor : '#9eb4c8';
      ctx.textAlign = 'center';
      ctx.fillText(String(x), px, 577);
    }
    line(ctx, [[82, 550], [928, 550]], '#6da7be83');
    ctx.fillStyle = '#89a7bb';
    ctx.fillText('SECTOR DISTANCE / x', 510, 606);
    ctx.setLineDash([5, 7]);
    line(ctx, [[xJoint, 184], [xJoint, 549]], jointColor + '7f');
    ctx.setLineDash([]);
    ctx.fillStyle = '#141b2d';
    ctx.fillRect(xJoint - 32, 192, 64, 22);
    ctx.fillStyle = jointColor;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`c = ${rail.c}`, xJoint, 208);
    railPath(ctx, 0, rail.c, x => y(rail.left.at(x)), GREEN);
    railPath(ctx, rail.c, 10, x => y(rail.right.at(x) + shift), BLUE);
    if (result.kind === 'jump') {
      const leftY = y(result.left);
      const rightY = y(result.right);
      ctx.setLineDash([4, 4]);
      line(ctx, [[xJoint, leftY], [xJoint, rightY]], ROSE, 2);
      ctx.setLineDash([]);
      circle(ctx, xJoint, leftY, 5, '#101e2e', GREEN);
      circle(ctx, xJoint, rightY, 5, '#101e2e', BLUE);
    } else if (result.kind === 'hole') {
      circle(ctx, xJoint, y(result.left), 7, '#101e2e', ROSE);
    }
    if (node !== null) {
      const ny = y(node);
      polygon(ctx, [[xJoint, ny - 8], [xJoint + 8, ny], [xJoint, ny + 8], [xJoint - 8, ny]], jointColor, '#ffe9f6');
    }
    if (game.enemy > 0) drawDrone(ctx, ...enemy, game.shield === 'phase');
    const x = trainX(game);
    const screenX = mapX(x);
    const screenY = y(actual(x));
    drawTrain(ctx, screenX, screenY, turretHeading(theta), game.impact > 0);
    const pulse = game.pulse;
    if (pulse) {
      const target = pulse.age < PULSE_FLIGHT ? enemy
        : dronePosition(Math.min(SECTOR_TIME, pulse.launchedAt + PULSE_FLIGHT), reduced.matches);
      drawPulse(ctx, pulse, [mapX(pulse.fromX), y(actual(pulse.fromX))], target, reduced.matches);
    }
    ctx.restore();
  };
}

export function drawScope(canvas: HTMLCanvasElement, wave: Wave, phase: number, threshold: number, ammo: Mission['ammo']) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const plotX = (t: number) => 13 + (w - 26) * (t - wave.start) / wave.period;
  const plotY = (value: number) => h / 2 - value / (wave.range + 0.35) * (h / 2 - 8);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i <= 8; i++) line(ctx, [[plotX(wave.start + wave.period * i / 8), 0], [plotX(wave.start + wave.period * i / 8), h]], '#274459');
  for (let i = 1; i < 6; i++) line(ctx, [[0, h * i / 6], [w, h * i / 6]], i === 3 ? '#49677c' : '#21394d');
  const band = ammo === 'kinetic' ? threshold : 0.25;
  ctx.fillStyle = '#3abdf61f';
  if (ammo === 'kinetic') {
    ctx.fillRect(0, 0, w, plotY(band));
    ctx.fillRect(0, plotY(-band), w, h - plotY(-band));
  } else {
    ctx.fillRect(0, plotY(band), w, plotY(-band) - plotY(band));
  }
  for (const [fn, color] of [[wave.theta, '#f1f5f9'], [wave.rate, BLUE]] as const) {
    const points: [number, number][] = [];
    for (let i = 0; i <= 125; i++) {
      const t = wave.start + wave.period * i / 125;
      points.push([plotX(t), plotY(fn(t))]);
    }
    line(ctx, points, color, 2);
  }
  const px = plotX(phase);
  line(ctx, [[px, 0], [px, h]], '#afeaff', 1);
  circle(ctx, px, plotY(wave.rate(phase)), 4, BLUE);
  circle(ctx, px, plotY(wave.theta(phase)), 3, '#f8fafc');
  canvas.title = `Phase ${format(phase)} rad · angular velocity ${format(wave.rate(phase))} rad/s`;
}
