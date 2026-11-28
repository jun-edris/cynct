// Coin jar geometry: a no-neck glass jar with a lid band, and a heap of flat cartoon coins lying at
// slight angles, the way coins settle when they're dropped in. Pure, so it can be tested and previewed without React Native.

export interface JarShape {
  W: number; H: number; body: string;
  rimX: number; rimY: number; rimW: number; rimH: number;
  left: number; right: number; bottom: number; bodyY: number; rad: number; neckW: number;
}

/**
 * A wide-mouth jar with no neck: straight sides, a rounded bottom and a lid band across the top that's a
 * little wider than the glass. Drawn in Senti's style (ink outline), so the whole body is the part that fills.
 */
export function jarShape(W: number): JarShape {
  const H = W * 1.12;
  const rimH = H * 0.12, rimX = W * 0.03, rimW = W * 0.94, rimY = H * 0.015;
  const left = W * 0.08, right = W * 0.92, bottom = H * 0.95, rad = W * 0.2;
  const bodyY = rimY + rimH * 0.7; // the glass starts just under the lid band
  const body = `M${left} ${bodyY} L${left} ${bottom - rad} Q${left} ${bottom} ${left + rad} ${bottom} L${right - rad} ${bottom}`
    + ` Q${right} ${bottom} ${right} ${bottom - rad} L${right} ${bodyY} Z`;
  return { W, H, body, rimX, rimY, rimW, rimH, left, right, bottom, bodyY, rad, neckW: right - left };
}

export interface PileCoin { x: number; y: number; rot: number; tilt: number }
export interface Pile { r: number; coins: PileCoin[] }

// Stable pseudo-random in [-0.5, 0.5).
const rnd = (i: number) => (((i * 9301 + 49297) % 233280) / 233280 - 0.5);

/**
 * Coins for a jar `pct` full, back-to-front (draw in order). The heap's top is a low mound, higher in the
 * middle; each coin gets its own tilt and slight offset. `tilt` is the coin's height-to-width ratio (0.4–0.7),
 * so some lie flatter than others.
 */
export function pile(j: JarShape, pct: number): Pile {
  const r = Math.max(7, j.W * 0.12);
  const p = Math.max(0, Math.min(1, pct));
  if (p <= 0) return { r, coins: [] };
  const cx = j.W / 2;
  const floor = j.bottom - r * 0.6;
  const ceil = j.bodyY + r * 0.5;
  const level = p * (floor - ceil);
  const bump = Math.min(r * 1.4, level * 0.35);
  const half = (j.right - j.left) / 2;
  const surface = (x: number) => floor - level + bump * Math.min(1, ((x - cx) / half) ** 2);
  const dy = r * 0.58, dx = r * 1.55; // fewer, bigger coins read as shapes, not texture
  const coins: PileCoin[] = [];
  let i = 0;
  for (let row = 0; ; row++) {
    const y = floor - row * dy;
    if (y < ceil) break;
    const shift = (row % 2) * dx * 0.5 + rnd(row + 3) * r * 0.4;
    const xs: number[] = [];
    for (let x = j.left + r * 0.5 + shift; x <= j.right - r * 0.5; x += dx) xs.push(x);
    let any = false;
    for (const x0 of xs) {
      const x = x0 + rnd(i + 11) * r * 0.45;
      i++;
      // A small amount is a little heap in the middle that spreads out as it grows.
      if (y < surface(x) || Math.abs(x - cx) > half * Math.min(1, 0.22 + p * 4)) continue;
      any = true;
      coins.push({ x, y: y + rnd(i + 5) * r * 0.25, rot: rnd(i) * 28, tilt: 0.42 + rnd(i + 17) * 0.08 });
    }
    if (!any && row > 0) break;
  }
  // A tiny amount still shows a few coins lying at the bottom.
  if (!coins.length) {
    for (const [k, off] of [[0, 0], [1, -0.9], [2, 0.9]] as const) if (k < Math.max(1, Math.round(p * 300))) coins.push({ x: cx + off * r, y: floor, rot: rnd(k) * 20, tilt: 0.42 });
  }
  return { r, coins };
}
