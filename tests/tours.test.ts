import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { TOURS, markSeen, placeBubble, readTours, scrollNeeded, shouldAutoStart, type TourId } from '../src/lib/tours';

const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
});
const src = files('src').map(f => readFileSync(f, 'utf8')).join('\n');

describe('guided tips', () => {
  it('every step lights up something that exists on its screen', () => {
    const spots = new Set([...src.matchAll(/<Spot id="([^"]+)"/g)].map(m => m[1]));
    for (const [id, steps] of Object.entries(TOURS)) {
      for (const s of steps) if (s.target) expect(spots.has(s.target), `${id} → ${s.target}`).toBe(true);
      expect(steps[0].target, `${id} opens with an intro`).toBeUndefined();
    }
  });

  it('every tour is started by its screen', () => {
    for (const id of Object.keys(TOURS)) expect(src.includes(`tour="${id}"`) || src.includes(`useScreenTour('${id}'`) || src.includes(`'${id}' : undefined`), id).toBe(true);
  });

  it('copy stays short enough to read in one go', () => {
    for (const steps of Object.values(TOURS)) for (const s of steps) {
      expect(s.title.length).toBeLessThanOrEqual(32);
      expect(s.text.split(/\s+/).length, s.title).toBeLessThanOrEqual(40);
    }
  });

  it('starts by itself only for new users, once per screen', () => {
    expect(readTours({})).toEqual({ auto: false, seen: [] });
    const s = readTours({ tours: { auto: true, seen: ['home', 'nope'] } });
    expect(s.seen).toEqual(['home']);
    expect(shouldAutoStart(s, 'home')).toBe(false);
    expect(shouldAutoStart(s, 'wallet')).toBe(true);
    expect(shouldAutoStart(markSeen(s, 'wallet' as TourId), 'wallet')).toBe(false);
  });

  it('puts the bubble under the lit-up thing when it fits, above it when not', () => {
    expect(placeBubble({ x: 0, y: 100, w: 300, h: 60 }, 900, 200, 40, 20)).toEqual({ y: 174, side: 'below' });
    expect(placeBubble({ x: 0, y: 700, w: 300, h: 80 }, 900, 200, 40, 20)).toEqual({ y: 486, side: 'above' });
    expect(placeBubble(null, 900, 200, 40, 20).side).toBe('center');
  });

  it('scrolls only when the target is out of comfortable view', () => {
    expect(scrollNeeded({ x: 0, y: 300, w: 300, h: 100 }, 900, 40, 20)).toBe(0);
    expect(scrollNeeded({ x: 0, y: 1400, w: 300, h: 100 }, 900, 40, 20)).toBeGreaterThan(0);
  });
});
