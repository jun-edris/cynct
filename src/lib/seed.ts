// Default data. Pure: returns rows; the repository writes them.
import { addMonths, todayISO, uid } from './money';
import { nextPayday } from './ledger';
import type { Account, Budget, Category, Goal, Recurring } from '../db/schema';

type Cat = Omit<Category, 'archived' | 'sort' | 'keywords'> & { keywords: string };

const C = (id: string, kind: 'expense' | 'income', name: string, color: string, icon: string, keywords: string[] = [], parentId: string | null = null): Cat =>
  ({ id, kind, name, color, icon, keywords: JSON.stringify(keywords), parentId });

// Ids of the original categories are kept so older data and web-app backups still match.
export const DEFAULT_CATEGORIES: Category[] = ([
  C('food', 'expense', 'Food', '#FF8A3D', 'silverware-fork-knife', ['kain', 'meal']),
  C('food.groceries', 'expense', 'Groceries', '#FF8A3D', 'cart', ['grocery', 'groceries', 'palengke', 'market'], 'food'),
  C('food.eatout', 'expense', 'Eating out', '#FF8A3D', 'food', ['lunch', 'dinner', 'breakfast', 'jollibee', 'mcdo', 'resto'], 'food'),
  C('food.coffee', 'expense', 'Coffee & snacks', '#FF8A3D', 'coffee', ['coffee', 'snacks', 'merienda', 'milktea'], 'food'),
  C('transport', 'expense', 'Transport', '#4C8DFF', 'bus', ['fare', 'tricycle', 'grab', 'jeep']),
  C('transport.gas', 'expense', 'Gas', '#4C8DFF', 'gas-station', ['gas', 'gasoline', 'fuel'], 'transport'),
  C('transport.motor', 'expense', 'Motorcycle upkeep', '#4C8DFF', 'motorbike', ['motor', 'oil', 'tires', 'lto', 'registration'], 'transport'),
  C('phone', 'expense', 'Phone', '#8B6CFF', 'cellphone', ['load', 'globe', 'smart', 'dito']),
  C('bills', 'expense', 'Bills', '#FFB020', 'receipt', []),
  C('bills.electric', 'expense', 'Electricity', '#FFB020', 'flash', ['electric', 'electricity', 'kuryente', 'boheco'], 'bills'),
  C('bills.internet', 'expense', 'Internet', '#FFB020', 'wifi', ['internet', 'wifi', 'pldt', 'converge'], 'bills'),
  C('bills.water', 'expense', 'Water', '#FFB020', 'water', ['water', 'tubig'], 'bills'),
  C('subs', 'expense', 'Subscriptions', '#B26CFF', 'repeat', ['spotify', 'adobe', 'netflix', 'loklok', 'youtube', 'icloud']),
  C('shopping', 'expense', 'Shopping', '#FF5C8A', 'shopping', ['shopee', 'lazada', 'mall', 'clothes']),
  C('wants', 'expense', 'Fun', '#2EC4B6', 'gamepad-variant', ['cravings', 'treat', 'movie', 'night out']),
  C('wants.games', 'expense', 'Games', '#2EC4B6', 'controller-classic', ['games', 'steam', 'psn'], 'wants'),
  C('health', 'expense', 'Health', '#F2545B', 'medical-bag', ['medicine', 'doctor', 'checkup', 'pharmacy', 'hmo']),
  C('family', 'expense', 'Family', '#E0A15A', 'account-group', ['parents', 'mama', 'papa', 'padala']),
  C('house', 'expense', 'House build', '#C08552', 'home-city', ['cement', 'materials', 'contractor', 'permit', 'lot']),
  C('fees', 'expense', 'Fees', '#9AA6BD', 'cash-minus', ['fee', 'charge', 'instapay', 'pesonet']),
  C('other', 'expense', 'Other', '#7C879C', 'dots-horizontal', []),
  C('salary', 'income', 'Salary', '#2BB673', 'briefcase', ['sweldo', 'payroll']),
  C('bonus', 'income', 'Bonus', '#5B8CFF', 'gift', ['13th', 'bonus']),
  C('freelance', 'income', 'Freelance', '#FF8A3D', 'laptop', ['client', 'project', 'duda', 'awrp']),
  C('commission', 'income', 'Commission', '#4C8DFF', 'chart-bar', ['commission']),
  C('business', 'income', 'Business', '#2EC4B6', 'storefront', ['sales', 'store']),
  C('sidehustle', 'income', 'Side hustle', '#FFB020', 'lightning-bolt', ['sideline', 'raket']),
  C('allowance', 'income', 'Allowance', '#8B6CFF', 'wallet', ['allowance']),
  C('gift', 'income', 'Gift', '#FF5C8A', 'gift-outline', ['gift', 'regalo']),
  C('refund', 'income', 'Refund', '#B26CFF', 'cash-refund', ['refund']),
  C('cashback', 'income', 'Cashback', '#2BB673', 'credit-card-refund', ['cashback', 'rebate']),
  C('interest', 'income', 'Interest', '#3FA7D6', 'percent', ['interest']),
  C('dividend', 'income', 'Dividend', '#5E7F3A', 'chart-pie', ['dividend', 'mp2']),
  C('rental', 'income', 'Rental', '#C08552', 'home-account', ['rent', 'upa']),
  C('otherin', 'income', 'Other income', '#7C879C', 'dots-horizontal', []),
] as Cat[]).map((c, i) => ({ archived: false, sort: i, ...c }) as Category);

export const ACCOUNT_TYPES: Record<string, string> = {
  bank: 'Bank', ewallet: 'E-wallet', savings: 'Savings', cash: 'Cash',
  credit: 'Credit card', loan: 'Loan', investment: 'Investment',
};
export const ACCOUNT_ICONS: Record<string, string> = {
  bank: 'bank', ewallet: 'cellphone', savings: 'piggy-bank', cash: 'cash', credit: 'credit-card', loan: 'hand-coin', investment: 'chart-line',
};
export const ICON_CHOICES = ['wallet', 'bank', 'cellphone', 'piggy-bank', 'cash', 'credit-card', 'hand-coin', 'chart-line', 'safe', 'home', 'car', 'airplane',
  'school', 'heart', 'star', 'briefcase', 'gift', 'cart', 'food', 'gamepad-variant', 'paw', 'beach', 'baby-carriage', 'tools'];

export const SWATCHES = ['#FFB020', '#FF8A3D', '#F2545B', '#FF5C8A', '#B26CFF', '#8B6CFF', '#4C8DFF', '#3FA7D6', '#2EC4B6', '#2BB673', '#C08552', '#7C879C'];

export interface SeedRows {
  categories: Category[]; accounts: Account[]; recurring: Recurring[]; budgets: Budget[]; goals: Goal[];
  settings: Record<string, unknown>;
}

export function mySetup(today = todayISO()): SeedRows {
  const now = Date.now();
  let sort = 0;
  const acc = (name: string, type: string, color: string): Account =>
    ({ id: uid(), name, type, color, icon: ACCOUNT_ICONS[type] ?? 'wallet', currency: 'PHP', opening: 0, creditLimit: null, statementDay: null, dueDay: null,
      note: '', archived: false, sort: sort++, createdAt: now });
  const wise = acc('Wise', 'bank', '#2BB673');
  const gotyme = acc('GoTyme', 'bank', '#3FA7D6');
  const maya = acc('Maya', 'ewallet', '#2EC4B6');
  const gcash = acc('GCash', 'ewallet', '#4C8DFF');
  const mari = acc('MariBank', 'savings', '#FF8A3D');
  const house = acc('House fund', 'savings', '#FFB020');
  const emergency = acc('Emergency fund', 'savings', '#C08552');
  const cash = acc('Cash', 'cash', '#7C879C');

  const nextOn = (day: number) => {
    const d = `${today.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    return d >= today ? d : addMonths(d, 1);
  };
  const rec = (name: string, kind: string, pesos: number, accountId: string, frequency: string, nextDue: string, categoryId: string | null, toAccountId: string | null = null): Recurring =>
    ({ id: uid(), name, kind, amount: pesos * 100, accountId, toAccountId, categoryId, frequency, nextDue, endDate: null, debtId: null, active: true, createdAt: now });

  const payday = nextPayday(today);
  const recurring = [
    rec('Salary', 'income', 50000, wise.id, 'semimonthly', payday, 'salary'),
    rec('Save to house fund', 'transfer', 35000, wise.id, 'semimonthly', payday, null, house.id),
    rec('Internet', 'bill', 1400, gcash.id, 'monthly', nextOn(5), 'bills.internet'),
    rec('Electric bill', 'bill', 5000, gcash.id, 'monthly', nextOn(10), 'bills.electric'),
    rec('Adobe Portfolio', 'bill', 1000, maya.id, 'monthly', nextOn(1), 'subs'),
    rec('Spotify', 'bill', 150, maya.id, 'monthly', nextOn(1), 'subs'),
    rec('Loklok', 'bill', 500, maya.id, 'quarterly', nextOn(1), 'subs'),
  ];

  const monthStart = `${today.slice(0, 7)}-01`;
  const bud = (name: string, categoryId: string | null, pesos: number, period = 'monthly', kind = 'expense'): Budget =>
    ({ id: uid(), name, kind, categoryId, period, amount: pesos * 100, rollover: false, startDate: monthStart, createdAt: now });
  const budgets = [
    bud('Food', 'food', 5000),
    bud('Transport', 'transport', 2500),
    bud('Fun', 'wants', 2500),
    bud('Bills', 'bills', 6400),
    bud('Subscriptions', 'subs', 1400),
  ];

  const goal = (name: string, target: number, months: number, monthly: number, rateBp: number, accountId: string, color: string): Goal => ({
    id: uid(), name, target, deadline: addMonths(today, months), monthly, annualRate: rateBp, accountIds: JSON.stringify([accountId]), startingSaved: 0,
    interestCreditedThrough: null, photoUri: null, note: '', color, archived: false, createdAt: now,
  });
  const goals = [
    // These goals count the balance of a real bank account; the bank pays the interest, so the goal rate is for projections only.
    goal('Bahay sa Bohol', 2_800_000_00, 36, 70_000_00, 0, house.id, '#FFB020'),
    goal('Emergency fund', 60_000_00, 2, 30_000_00, 0, emergency.id, '#C08552'),
  ];

  return {
    categories: DEFAULT_CATEGORIES,
    accounts: [wise, gotyme, maya, gcash, mari, house, emergency, cash],
    recurring, budgets, goals,
    settings: { setupDone: true, defaultAccountId: gcash.id },
  };
}

export function emptySetup(): SeedRows {
  return { categories: DEFAULT_CATEGORIES, accounts: [], recurring: [], budgets: [], goals: [], settings: { setupDone: true } };
}
