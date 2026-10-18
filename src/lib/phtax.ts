// Philippine income tax and mandatory contributions, 2026 rules. Money in centavos.
// Sources checked Oct 2026: SSS 15% schedule (RA 11199, since Jan 2025), PhilHealth 5% (floor ₱10k, ceiling ₱100k),
// Pag-IBIG 2% up to ₱10k, GSIS 9%, BIR TRAIN graduated table (2023 onward), 8% option (≤ ₱3M gross).
// These are estimates for planning, not a tax filing.

const P = (pesos: number) => Math.round(pesos * 100);

/** Annual income tax on taxable income under the graduated table. */
export function graduatedTax(annualTaxable: number): { tax: number; marginal: number; note: string } {
  const t = Math.max(0, annualTaxable);
  const brackets: [number, number, number][] = [ // [over, base tax, rate on excess]
    [P(8_000_000), P(2_202_500), 0.35],
    [P(2_000_000), P(402_500), 0.30],
    [P(800_000), P(102_500), 0.25],
    [P(400_000), P(22_500), 0.20],
    [P(250_000), 0, 0.15],
  ];
  for (const [over, base, rate] of brackets) {
    if (t > over) {
      return { tax: Math.round(base + (t - over) * rate), marginal: rate,
        note: `${base ? `₱${(base / 100).toLocaleString('en-PH')} + ` : ''}${rate * 100}% of the excess over ₱${(over / 100).toLocaleString('en-PH')}.` };
    }
  }
  return { tax: 0, marginal: 0, note: 'No income tax on taxable income up to ₱250,000 a year.' };
}

/** SSS monthly salary credit: ₱500 brackets from ₱5,000 to ₱35,000. */
export function sssMsc(monthly: number): number {
  const pesos = monthly / 100;
  if (pesos < 5_250) return P(5_000);
  if (pesos >= 34_750) return P(35_000);
  return P(Math.floor((pesos + 250) / 500) * 500);
}

export interface Contributions { social: number; socialLabel: 'SSS' | 'GSIS'; philhealth: number; pagibig: number; total: number }

export function employeeContributions(monthly: number, employer: 'private' | 'government'): Contributions {
  const m = Math.max(0, monthly);
  const social = employer === 'government' ? Math.round(m * 0.09) : Math.round(sssMsc(m) * 0.05);
  const philhealth = m <= 0 ? 0 : Math.round(Math.min(Math.max(m, P(10_000)), P(100_000)) * 0.025);
  const pagibig = m <= 0 ? 0 : m <= P(1_500) ? Math.round(m * 0.01) : Math.round(Math.min(m, P(10_000)) * 0.02);
  const total = m <= 0 ? 0 : social + philhealth + pagibig;
  return { social: m <= 0 ? 0 : social, socialLabel: employer === 'government' ? 'GSIS' : 'SSS', philhealth, pagibig, total };
}

export interface CompensationResult extends Contributions {
  annualTaxable: number; annualTax: number; monthlyTax: number; netMonthly: number; marginal: number; note: string; thirteenthTaxable: number;
}

/**
 * Employee on payroll. 13th-month pay (one month's salary) and other benefits are tax-free up to ₱90,000 a year;
 * contributions are deducted before tax.
 */
export function compensationTax(monthly: number, employer: 'private' | 'government', with13th = true): CompensationResult {
  const c = employeeContributions(monthly, employer);
  const thirteenthTaxable = with13th ? Math.max(0, monthly - P(90_000)) : 0;
  const annualTaxable = Math.max(0, (monthly - c.total) * 12 + thirteenthTaxable);
  const g = graduatedTax(annualTaxable);
  const monthlyTax = Math.round(g.tax / 12);
  return { ...c, annualTaxable, annualTax: g.tax, monthlyTax, netMonthly: Math.max(0, monthly - c.total - monthlyTax), marginal: g.marginal, note: g.note, thirteenthTaxable };
}

export interface SelfEmployedResult { annualGross: number; annualTaxable: number; incomeTax: number; percentageTax: number; total: number; monthly: number; effective: number; note: string; allowed: boolean }

/** Self-employed / professional on graduated rates: 40% optional standard deduction or actual expenses, plus 3% percentage tax (non-VAT, ≤ ₱3M). */
export function selfEmployedGraduated(annualGross: number, expenses: number | 'osd'): SelfEmployedResult {
  const ded = expenses === 'osd' ? Math.round(annualGross * 0.4) : Math.max(0, expenses);
  const annualTaxable = Math.max(0, annualGross - ded);
  const g = graduatedTax(annualTaxable);
  const percentageTax = annualGross <= P(3_000_000) ? Math.round(annualGross * 0.03) : 0;
  const total = g.tax + percentageTax;
  return { annualGross, annualTaxable, incomeTax: g.tax, percentageTax, total, monthly: Math.round(total / 12), effective: annualGross ? total / annualGross : 0,
    note: `${g.note}${percentageTax ? ' Plus 3% percentage tax on gross.' : ' Over ₱3M you register for VAT instead of percentage tax.'}`, allowed: true };
}

/** 8% on gross over ₱250,000, replacing both graduated income tax and percentage tax. Only if gross ≤ ₱3M. */
export function eightPercent(annualGross: number): SelfEmployedResult {
  const allowed = annualGross <= P(3_000_000);
  const annualTaxable = Math.max(0, annualGross - P(250_000));
  const total = allowed ? Math.round(annualTaxable * 0.08) : 0;
  return { annualGross, annualTaxable, incomeTax: total, percentageTax: 0, total, monthly: Math.round(total / 12), effective: annualGross ? total / annualGross : 0,
    note: allowed ? '8% of gross receipts over ₱250,000. Replaces graduated tax and the 3% percentage tax.' : 'Not available: gross receipts are over ₱3,000,000.', allowed };
}
