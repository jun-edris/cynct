import { describe, expect, test } from 'vitest';
import { walkFrame, walkPose, WALK_MS, LEAN_MS } from '../src/lib/walk';

describe('Senti walk-in', () => {
  test('one foot is always on the ground while walking', () => {
    for (let phi = 0; phi < 4 * Math.PI; phi += 0.2) {
      const p = walkPose(phi);
      expect(Math.max(p.legs[0].c.y, p.legs[1].c.y) + p.dy).toBeCloseTo(182, 5);
    }
  });
  test('starts off to the right, arrives, then settles into the lean', () => {
    expect(walkFrame(0, 180, 35).offset).toBeCloseTo(180);
    const end = walkFrame(WALK_MS, 180, 35);
    expect(end.offset).toBeCloseTo(0);
    const settled = walkFrame(WALK_MS + LEAN_MS, 180, 35);
    expect(settled.done).toBe(true);
    expect(settled.lean).toBeCloseTo(-11);
    expect(settled.pose.armsInFront).toBe(true);
  });
  test('steps slow down near the end but never stop mid-stride', () => {
    const step = (a: number) => walkFrame(a + 50, 180, 35).offset - walkFrame(a, 180, 35).offset;
    expect(Math.abs(step(WALK_MS - 60))).toBeLessThan(Math.abs(step(0)));
    expect(Math.abs(step(WALK_MS - 60))).toBeGreaterThan(0);
  });
});
