// Calculator math for the Tools screens. Money in centavos, rates as decimals (0.06 = 6%).

export interface LoanResult { monthly: number; totalInterest: number; totalPaid: number; effectiveAnnual: number; schedule: { month: number; payment: number; interest: number; principal: number; balance: number }[] }

/** Standard amortized loan (banks, Pag-IBIG, car loans): interest on the remaining balance. */
export function amortized(principal: number, annualRate: number, months: number): LoanResult {
  const r = annualRate / 12;
  const monthly = r === 0 ? Math.ceil(principal / months) : Math.round(principal * r / (1 - Math.pow(1 + r, -months)));
  const schedule: LoanResult['schedule'] = [];
  let bal = principal, totalInterest = 0;
  for (let m = 1; m <= months; m++) {
    const interest = Math.round(bal * r);
    let princ = monthly - interest;
    if (m === months || princ > bal) princ = bal; // last payment clears rounding
    bal -= princ;
    totalInterest += interest;
    schedule.push({ month: m, payment: princ + interest, interest, principal: princ, balance: bal });
  }
  return { monthly, totalInterest, totalPaid: principal + totalInterest, effectiveAnnual: annualRate, schedule };
}

/**
 * Add-on rate (common with financing, appliance and lending apps): a flat monthly rate on the original amount for every month.
 * "1.5% a month" looks small but costs far more than 18% a year on a reducing balance; effectiveAnnual shows the true cost.
 */
export function addOn(principal: number, monthlyRate: number, months: number): LoanResult {
  const totalInterest = Math.round(principal * monthlyRate * months);
  const totalPaid = principal + totalInterest;
  const monthly = Math.ceil(totalPaid / months);
  // Solve for the reducing-balance rate with the same payment (bisection on the monthly rate).
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const pv = mid === 0 ? monthly * months : monthly * (1 - Math.pow(1 + mid, -months)) / mid;
    if (pv > principal) lo = mid; else hi = mid;
  }
  const schedule: LoanResult['schedule'] = [];
  let bal = totalPaid;
  for (let m = 1; m <= months; m++) {
    const pay = m === months ? bal : monthly;
    bal -= pay;
    schedule.push({ month: m, payment: pay, interest: Math.round(totalInterest / months), principal: pay - Math.round(totalInterest / months), balance: Math.max(0, bal) });
  }
  return { monthly, totalInterest, totalPaid, effectiveAnnual: ((lo + hi) / 2) * 12, schedule };
}

export interface SplitResult { perPerson: number; total: number; service: number; remainder: number }
/** Splits a bill evenly. Rounds each share up to `roundTo` centavos; the extra is the remainder someone keeps. */
export function splitBill(amount: number, people: number, servicePct = 0, tip = 0, roundTo = 100): SplitResult {
  const service = Math.round(amount * servicePct);
  const total = amount + service + tip;
  if (people < 1) return { perPerson: total, total, service, remainder: 0 };
  const raw = total / people;
  const perPerson = roundTo > 0 ? Math.ceil(raw / roundTo) * roundTo : Math.ceil(raw);
  return { perPerson, total, service, remainder: perPerson * people - total };
}

/** Months until a target is reached saving `monthly` with monthly compounding. Null if never. */
export function monthsToReach(target: number, saved: number, monthly: number, annualRate = 0): number | null {
  if (saved >= target) return 0;
  const r = annualRate / 12;
  let bal = saved;
  for (let m = 1; m <= 1200; m++) {
    bal = bal * (1 + r) + monthly;
    if (bal >= target) return m;
  }
  return null;
}
