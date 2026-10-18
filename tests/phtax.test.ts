import { describe, expect, it } from 'vitest';
import { compensationTax, eightPercent, employeeContributions, graduatedTax, selfEmployedGraduated, sssMsc } from '../src/lib/phtax';

const P = (n: number) => Math.round(n * 100);

describe('PH tax 2026', () => {
  it('graduated table edges', () => {
    expect(graduatedTax(P(250_000)).tax).toBe(0);
    expect(graduatedTax(P(400_000)).tax).toBe(P(22_500));
    expect(graduatedTax(P(800_000)).tax).toBe(P(102_500));
    expect(graduatedTax(P(2_000_000)).tax).toBe(P(402_500));
    expect(graduatedTax(P(8_000_000)).tax).toBe(P(2_202_500));
    expect(graduatedTax(P(1_000_000)).tax).toBe(P(152_500));
  });
  it('SSS brackets and caps', () => {
    expect(sssMsc(P(3_000))).toBe(P(5_000));
    expect(sssMsc(P(20_240))).toBe(P(20_000));
    expect(sssMsc(P(20_250))).toBe(P(20_500));
    expect(sssMsc(P(100_000))).toBe(P(35_000));
  });
  it('contributions for a ₱50k private employee', () => {
    const c = employeeContributions(P(50_000), 'private');
    expect(c).toMatchObject({ social: P(1_750), philhealth: P(1_250), pagibig: P(200), total: P(3_200) });
    expect(employeeContributions(P(50_000), 'government').social).toBe(P(4_500));
    expect(employeeContributions(P(5_000), 'private').philhealth).toBe(P(250));
  });
  it('compensation: ₱50k a month', () => {
    const r = compensationTax(P(50_000), 'private');
    expect(r.annualTaxable).toBe(P(561_600));
    expect(r.annualTax).toBe(P(54_820));
    expect(r.monthlyTax).toBe(456_833);
    expect(r.netMonthly).toBe(P(50_000) - P(3_200) - 456_833);
  });
  it('self-employed: graduated vs 8%', () => {
    const g = selfEmployedGraduated(P(1_200_000), 'osd'); // taxable 720k
    expect(g.incomeTax).toBe(P(86_500));
    expect(g.percentageTax).toBe(P(36_000));
    expect(eightPercent(P(1_200_000)).total).toBe(P(76_000));
    expect(eightPercent(P(3_500_000)).allowed).toBe(false);
  });
});
