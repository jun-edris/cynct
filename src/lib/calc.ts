// Tiny calculator for the amount keypad. Supports + − × ÷ and % (percent of the number before it).
// No eval(): parses the expression itself.

export type Op = '+' | '−' | '×' | '÷';
const OPS = new Set(['+', '−', '×', '÷']);

export function tokenize(expr: string): (number | Op)[] {
  const out: (number | Op)[] = [];
  let num = '';
  const flush = () => {
    if (!num) return;
    const pct = num.endsWith('%');
    let v = parseFloat(pct ? num.slice(0, -1) : num);
    if (Number.isNaN(v)) v = 0;
    out.push(pct ? v / 100 : v);
    num = '';
  };
  for (const ch of expr) {
    if (OPS.has(ch)) { flush(); if (out.length && typeof out[out.length - 1] === 'number') out.push(ch as Op); }
    else num += ch;
  }
  flush();
  if (out.length && typeof out[out.length - 1] !== 'number') out.pop(); // trailing operator
  return out;
}

export function evaluate(expr: string): number {
  const t = tokenize(expr);
  if (!t.length) return 0;
  // first pass: × and ÷
  const stack: (number | Op)[] = [t[0]];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i] as Op, n = t[i + 1] as number;
    if (op === '×' || op === '÷') {
      const prev = stack.pop() as number;
      stack.push(op === '×' ? prev * n : n === 0 ? NaN : prev / n);
    } else stack.push(op, n);
  }
  let total = stack[0] as number;
  for (let i = 1; i < stack.length; i += 2) total = stack[i] === '+' ? total + (stack[i + 1] as number) : total - (stack[i + 1] as number);
  return Math.round(total * 100) / 100;
}

export function hasOperator(expr: string) { return [...expr].some(ch => OPS.has(ch)); }

/** Applies a keypad press to the expression string. */
export function press(expr: string, key: string): string { return pressWith(expr, key, 2); }

/** Like press, with a decimal limit (6 for exchange rates). Separate so press stays safe as a reduce() callback. */
export function pressWith(expr: string, key: string, maxDecimals: number): string {
  if (key === 'AC') return '';
  if (key === '⌫') return expr.slice(0, -1);
  if (key === '=') { const v = evaluate(expr); return Number.isFinite(v) ? String(v) : ''; }
  const last = expr.slice(-1);
  const current = expr.split(/[+−×÷]/).pop() ?? '';
  if (OPS.has(key)) {
    if (!expr) return '';
    if (OPS.has(last)) return expr.slice(0, -1) + key;
    return expr + key;
  }
  if (key === '%') return current && !current.endsWith('%') ? expr + '%' : expr;
  if (current.endsWith('%')) return expr; // nothing after a percent sign
  if (key === '.') return current.includes('.') ? expr : expr + (current ? '.' : '0.');
  const decimals = current.includes('.') ? current.split('.')[1].length : 0;
  if (decimals >= maxDecimals) return expr;
  if (current.replace('.', '').length >= 10) return expr;
  if (current === '0' && key !== '.') return expr.slice(0, -1) + (key === '00' ? '0' : key);
  if (!current && key === '00') return expr + '0';
  return expr + key;
}
