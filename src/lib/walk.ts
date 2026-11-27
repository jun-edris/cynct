// Senti's walk cycle and lean, as plain geometry in his 160×200 box. Pure so frames can be tested and
// previewed. The walk is driven by distance, so steps slow down naturally as he slows to a stop.
//
// phase: walk cycle angle in radians (2π = two steps). u: 0 = walking, 1 = settled into the lean.

export interface Pt { x: number; y: number }
export interface Limb { a: Pt; b: Pt; c: Pt } // hip/shoulder → knee/elbow → foot/hand
export interface Pose {
  dy: number;           // whole-body vertical shift so the planted foot stays on the ground
  tilt: number;         // body tilt in degrees (negative leans left)
  face: number;         // face shift in x (looks the way he's walking)
  legs: [Limb, Limb];   // [far, near]
  shoes: [number, number]; // shoe rotation in degrees for each leg
  arms: [Limb, Limb];   // [far, near]
  armsInFront: boolean; // crossed arms are drawn over the coin
}

const D = Math.PI / 180;
const GROUND = 182;
const THIGH = 23, SHIN = 22, UPPER = 19, FORE = 19;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lp = (p: Pt, q: Pt, t: number): Pt => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
const ll = (m: Limb, n: Limb, t: number): Limb => ({ a: lp(m.a, n.a, t), b: lp(m.b, n.b, t), c: lp(m.c, n.c, t) });
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** One leg at walk phase φ. dir −1 = walking left. Thigh swings ±26°, the knee bends while the leg swings forward. */
function leg(hipX: number, phi: number, dir: number): { limb: Limb; shoe: number } {
  const th = 26 * D * Math.sin(phi);
  const bend = 58 * D * Math.max(0, Math.cos(phi)) ** 1.2;
  const a = { x: hipX, y: 138 };
  const b = { x: a.x + dir * THIGH * Math.sin(th), y: a.y + THIGH * Math.cos(th) };
  const sh = th - bend;
  const c = { x: b.x + dir * SHIN * Math.sin(sh), y: b.y + SHIN * Math.cos(sh) };
  // Toes lift as the foot swings through, and roll off the ground at push-off.
  return { limb: { a, b, c }, shoe: dir * (bend / D) * 0.45 + dir * Math.min(0, th / D) * 0.3 };
}

/** One arm swinging opposite its leg, elbow slightly bent in the walking direction. */
function arm(sx: number, phi: number, dir: number, out: number): Limb {
  const sw = 28 * D * Math.sin(phi + Math.PI);
  const a = { x: sx, y: 98 };
  const b = { x: a.x + dir * UPPER * Math.sin(sw) + out * 6, y: a.y + UPPER * Math.cos(sw) };
  const fa = sw + 28 * D * (0.6 + 0.4 * Math.max(0, Math.sin(phi + Math.PI)));
  return { a, b, c: { x: b.x + dir * FORE * Math.sin(fa) + out * 2, y: b.y + FORE * Math.cos(fa) } };
}

// The settled lean: weight on the far leg, near leg crossed in front at the ankle, arms folded.
const LEAN_LEGS: [Limb, Limb] = [
  { a: { x: 70, y: 138 }, b: { x: 73, y: 160 }, c: { x: 78, y: GROUND } },
  { a: { x: 90, y: 138 }, b: { x: 78, y: 158 }, c: { x: 48, y: GROUND - 4 } },
];
// Elbows sit where the folded arms' curves pass, so the quadratic limb reads like the drawn crossed arms.
const LEAN_ARMS: [Limb, Limb] = [
  { a: { x: 33, y: 100 }, b: { x: 48.8, y: 118.8 }, c: { x: 102, y: 119 } },
  { a: { x: 127, y: 100 }, b: { x: 111.8, y: 118.3 }, c: { x: 60, y: 121 } },
];

export function walkPose(phi: number, u = 0, dir = -1): Pose {
  const far = leg(70, phi, dir), near = leg(90, phi + Math.PI, dir);
  // Keep the lower foot on the ground: the body dips when the legs are spread and rises over the planted leg.
  const low = Math.max(far.limb.c.y, near.limb.c.y);
  const walk: Pose = {
    dy: GROUND - low,
    tilt: dir * 4 + 1.5 * Math.sin(2 * phi),
    face: dir * 9,
    legs: [far.limb, near.limb],
    shoes: [far.shoe, near.shoe],
    arms: [arm(44, phi + Math.PI, dir, -1), arm(112, phi, dir, 1)],
    armsInFront: false,
  };
  if (u <= 0) return walk;
  const t = easeInOut(Math.min(1, u));
  return {
    dy: lerp(walk.dy, 0, t),
    tilt: lerp(walk.tilt, 0, t), // the lean itself is applied around the feet by the caller
    face: lerp(walk.face, -3, t),
    legs: [ll(walk.legs[0], LEAN_LEGS[0], t), ll(walk.legs[1], LEAN_LEGS[1], t)],
    shoes: [lerp(walk.shoes[0], 0, t), lerp(walk.shoes[1], 22, t)], // crossed foot rests on its toe
    arms: [ll(walk.arms[0], LEAN_ARMS[0], t), ll(walk.arms[1], LEAN_ARMS[1], t)],
    armsInFront: t > 0.35,
  };
}

/** A rubber-hose limb through its middle joint: a quadratic curve whose control point makes it pass near b. */
export function limbPath(l: Limb): string {
  const cx = 2 * l.b.x - (l.a.x + l.c.x) / 2, cy = 2 * l.b.y - (l.a.y + l.c.y) / 2;
  return `M${l.a.x.toFixed(1)} ${l.a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${l.c.x.toFixed(1)} ${l.c.y.toFixed(1)}`;
}

// ---------- drawing ----------
// Senti as a flat list of SVG shapes, so the app and the preview draw exactly the same thing.
export type Shape =
  | { t: 'path'; d: string; stroke?: string; sw?: number; fill?: string; op?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number; dash?: string; op?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; rot?: number };

export const INK = '#17122D', COIN = '#FFB020', PINK = '#E5458F';

/** The whole figure for a pose, plus the group transform (bob, tilt and lean around his feet). */
export function sentiShapes(p: Pose, lean = 0, dir = -1, rim?: string): { transform: string; shapes: Shape[] } {
  const s: Shape[] = [];
  // On a dark background a faint light edge keeps the ink limbs readable.
  const limb = (l: Limb, w = 5) => {
    if (rim) s.push({ t: 'path', d: limbPath(l), stroke: rim, sw: w + 3, fill: 'none' });
    s.push({ t: 'path', d: limbPath(l), stroke: INK, sw: w, fill: 'none' });
  };
  const shoe = (l: Limb, rot: number) => {
    if (rim) s.push({ t: 'ellipse', cx: l.c.x + dir * 4, cy: l.c.y, rx: 16.5, ry: 9.5, fill: rim, rot });
    s.push({ t: 'ellipse', cx: l.c.x + dir * 4, cy: l.c.y, rx: 15, ry: 8, fill: INK, rot });
  };
  const glove = (l: Limb) => s.push({ t: 'circle', cx: l.c.x, cy: l.c.y, r: 9.5, fill: '#fff', stroke: INK, sw: 3 });
  const [farLeg, nearLeg] = p.legs, [farArm, nearArm] = p.arms;
  // Back to front: far arm, legs, coin, then the near arm (in front while walking; both folded in front when leaning).
  if (!p.armsInFront) { limb(farArm); glove(farArm); }
  limb(farLeg); shoe(farLeg, p.shoes[0]);
  limb(nearLeg); shoe(nearLeg, p.shoes[1]);
  s.push({ t: 'circle', cx: 80, cy: 92, r: 50, fill: COIN, stroke: INK, sw: 4 });
  s.push({ t: 'circle', cx: 80, cy: 92, r: 41, fill: 'none', stroke: INK, sw: 1.6, dash: '2 4', op: 0.5 });
  const f = p.face;
  s.push({ t: 'path', d: `M${68 + f} 106 q12 10 24 0`, stroke: INK, sw: 4, fill: 'none' });
  s.push({ t: 'circle', cx: 53 + f * 0.8, cy: 102, r: 5, fill: PINK, op: 0.35 }, { t: 'circle', cx: 107 + f * 0.8, cy: 102, r: 5, fill: PINK, op: 0.35 });
  s.push({ t: 'ellipse', cx: 67 + f, cy: 86, rx: 7, ry: 11, fill: INK }, { t: 'path', d: `M${70 + f} 79 l-6 6 h7z`, fill: '#fff' });
  s.push({ t: 'ellipse', cx: 93 + f, cy: 86, rx: 7, ry: 11, fill: INK }, { t: 'path', d: `M${96 + f} 79 l-6 6 h7z`, fill: '#fff' });
  if (p.armsInFront) { limb(nearArm, 6); glove(nearArm); limb(farArm, 6); glove(farArm); }
  else { limb(nearArm); glove(nearArm); }
  return { transform: `translate(0 ${p.dy.toFixed(2)}) rotate(${(p.tilt + lean).toFixed(2)} 80 184)`, shapes: s };
}

/** Where he is along the walk-in at time `ms` after he starts walking. Distance-driven, so steps slow as he does. */
export interface WalkFrame { offset: number; pose: Pose; lean: number; done: boolean }
export const WALK_MS = 2300, LEAN_MS = 700;

export function walkFrame(ms: number, distance: number, stepPx: number): WalkFrame {
  // An odd number of steps, so he arrives with the near leg swinging, ready to cross over.
  let n = Math.max(3, Math.round(distance / stepPx));
  if (n % 2 === 0) n += 1;
  const s = Math.max(0, Math.min(1, ms / WALK_MS));
  // Eases out but keeps some speed at the end, so the last step doesn't crawl.
  const prog = (1 - (1 - s) ** 2) * 0.75 + s * 0.25;
  const phi = prog * n * Math.PI;
  const u = Math.max(0, Math.min(1, (ms - WALK_MS) / LEAN_MS));
  // The lean overshoots a touch and settles against the logo.
  const back = u === 0 ? 0 : 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
  return { offset: distance * (1 - prog), pose: walkPose(phi, u), lean: -11 * back, done: u >= 1 };
}
