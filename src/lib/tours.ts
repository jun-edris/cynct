// Guided tips: for each screen, a short list of steps. Each step lights up one thing on the screen (its
// `target`, a <Spot id> placed in that screen) and Senti explains it in plain words. A step with no target
// is a card in the middle of the screen. Pure data and helpers, so steps can be checked in tests.

export type TourId =
  | 'home' | 'wallet' | 'plan' | 'history' | 'add'
  | 'paycheck' | 'scan' | 'capture' | 'sort' | 'goal' | 'budgets' | 'quick';

export interface TourStep { target?: string; title: string; text: string }

export const TOURS: Record<TourId, TourStep[]> = {
  home: [
    { title: 'Hi, I’m Senti', text: 'I’ll show you around. It takes a few taps, and you can skip any time. Tap the ? at the top of a screen to see its tips again.' },
    { target: 'home.balance', title: 'Everything you have', text: 'All your accounts added up, minus what you owe. Tap it to see where the money sits.' },
    { target: 'home.chart', title: 'Money in and out', text: 'Green is money that came in this month, pink is what went out. Switch to 6 months to compare.' },
    { target: 'home.actions', title: 'Log money in seconds', text: 'Spend when you pay for something, Income when you get paid, Move when you shift money between your own accounts.' },
    { target: 'home.accounts', title: 'Your accounts', text: 'GCash, Maya, banks and cash. Tap one to see its balance and history. Swipe sideways to see more.' },
    { target: 'tabs.add', title: 'The + button', text: 'Works from any screen. It can also scan a receipt or let you type “lunch 180 gcash”.' },
    { target: 'home.tools', title: 'Hide and settings', text: 'The eye hides amounts when people are looking. The gear opens settings, backups and payment capture.' },
  ],
  wallet: [
    { title: 'Your wallet', text: 'Every account in one place: e-wallets, banks, cash, cards and loans.' },
    { target: 'wallet.total', title: 'Net worth', text: 'What you have minus what you owe, across every account, right now.' },
    { target: 'wallet.add', title: 'Add an account', text: 'Tap + to add GCash, a bank, a credit card or cash. Put in what’s in it today, and Cynct keeps count from there.' },
    { target: 'wallet.list', title: 'Tap an account', text: 'See its balance, every entry, and fix the balance if it doesn’t match your app.' },
  ],
  plan: [
    { title: 'Plan ahead', text: 'This is where you decide where money goes before you spend it: bills, budgets, goals and your next pay.' },
    { target: 'plan.safe', title: 'Safe to spend today', text: 'How much you can spend today and still cover your bills until your next pay. Stay under it and you’re fine.' },
    { target: 'plan.pay', title: 'Got paid?', text: 'Tap Plan pay when your salary comes in. Cynct splits it into bills, savings and spending money for you.' },
    { target: 'plan.tools', title: 'Your main planning tools', text: 'Budgets limit spending per category. Goals are things you save for. Planned payments remind you of bills before they’re due.' },
    { target: 'plan.more', title: 'More tools', text: 'Forecast, installments, receipts, invoices and more. Each one has its own tips behind the ? button.' },
  ],
  history: [
    { title: 'Everything you logged', text: 'Every expense, income and transfer, newest first, grouped by day.' },
    { target: 'history.month', title: 'Pick a month', text: 'Use the arrows to go back a month. Tap the month’s name to pick a different range, like this year.' },
    { target: 'history.totals', title: 'In and out', text: 'What came in and what went out in the period you picked.' },
    { target: 'history.kinds', title: 'Show only one kind', text: 'Tap Expenses to see only spending, Income to see only money in, and so on.' },
    { target: 'history.search', title: 'Search, calendar, filters', text: 'Search a store, a note or an amount. The calendar shows spending by day. Filters narrow by account or category.' },
    { title: 'Tap any entry', text: 'To change it or delete it. Press and hold to pick several at once, then change their category together.' },
  ],
  add: [
    { title: 'Adding an entry', text: 'Three things matter: how much, what for, and which account paid.' },
    { target: 'add.type', title: 'Expense, income or transfer', text: 'Pick what kind of entry this is. Transfer is for moving money between your own accounts.' },
    { target: 'add.amount', title: 'How much', text: 'Type the amount on the keypad. You can do sums too, like 120 + 85.' },
    { target: 'add.category', title: 'What it was for', text: 'Pick a category so your budgets and reports make sense. Cynct learns your usual ones.' },
    { target: 'add.account', title: 'Which account', text: 'Where the money came from, like GCash or cash. The date is today unless you change it.' },
    { target: 'add.save', title: 'Save', text: 'That’s it. If you pick a future date, it becomes a planned payment instead.' },
  ],
  paycheck: [
    { title: 'Plan a paycheck', text: 'Type what you got paid and Cynct splits it for you: bills first, then daily spending, then savings, then what’s free. Nothing moves until you say so.' },
    { target: 'paycheck.amount', title: 'Your pay', text: 'Type what landed in your account, after tax. The rest of the screen fills in once you do.' },
    { target: 'paycheck.until', title: 'How long it has to last', text: 'Your next payday. Cynct finds it from your salary in Planned payments, or you can pick a date.' },
    { target: 'paycheck.result', title: 'Your split', text: 'Dark is bills due before next pay, blue is food and errands, purple is goals, and the dashed box is free to spend.' },
    { target: 'paycheck.guide', title: 'Am I saving enough?', text: 'Compares your plan with a common rule like 50/30/20: half for needs, a third for wants, a fifth for savings.' },
    { target: 'paycheck.move', title: 'Move the goal money', text: 'One tap moves the goal amounts out of your account and into your goals. You can undo it right after.' },
  ],
  scan: [
    { title: 'Scan a receipt', text: 'Take a photo of a paper receipt and Cynct reads the total, the date and the store. It all happens on your phone.' },
    { target: 'scan.pick', title: 'Take or pick a photo', text: 'Take photo uses the camera. From photos picks one you already took. Lay the receipt flat with the total showing.' },
    { title: 'Check what it read', text: 'Cynct fills in the amount, store and date. If the total is wrong, tap the right one from the list it found. Then tap Review and save.' },
  ],
  capture: [
    { title: 'Payment capture', text: 'When Maya, GCash, Wise or GoTyme sends a payment notification, Cynct turns it into an entry for you to confirm. Nothing leaves your phone.' },
    { target: 'capture.toggle', title: 'Turn it on', text: 'Switch this on, then find Cynct in your phone’s notification access list and allow it. Without that step, nothing comes in.' },
    { target: 'capture.screenshot', title: 'Missed a payment?', text: 'Card purchases and old payments may not send a notification. Import a screenshot of Maya’s transaction screen instead.' },
    { target: 'capture.review', title: 'Check what came in', text: 'Each payment waits here until you tap Add or Dismiss. Sort them one by one if there are many.' },
    { target: 'capture.links', title: 'Which account is which', text: 'Tell Cynct which of your accounts each app is, so a Maya payment comes out of your Maya account.' },
    { target: 'capture.you', title: 'That’s you', text: 'Add your name and the last 4 digits of your own numbers. Money between them counts as a transfer, not spending.' },
  ],
  sort: [
    { title: 'Sort your payments', text: 'Each card is one payment Cynct caught from a notification or a screenshot. Decide on them one at a time.' },
    { target: 'sort.card', title: 'Swipe to decide', text: 'Swipe right to add it to your records, left to skip it. Tap a category on the card first if Cynct guessed wrong.' },
    { target: 'sort.buttons', title: 'Or tap instead', text: 'X skips it. The pencil opens it so you can change anything first. The check adds it.' },
  ],
  goal: [
    { title: 'Your goal', text: 'Something you’re saving for. The jar fills up as you save, and it’s full when you reach the target.' },
    { target: 'goal.jar', title: 'The jar', text: 'The coins show how much of the goal you’ve saved. The tag is your target amount.' },
    { target: 'goal.actions', title: 'Add or take out money', text: 'Add money moves it from one of your accounts into this goal. Withdraw moves it back if you need it.' },
    { target: 'goal.stats', title: 'Are you on track?', text: 'What’s left to save, how much you need each month to finish on time, and where you’ll end up at this pace.' },
  ],
  budgets: [
    { title: 'Budgets', text: 'A limit for one kind of spending, like ₱6,000 a month on food. Cynct tells you when you’re close to it.' },
    { target: 'budgets.add', title: 'Make a budget', text: 'Tap + and pick a category, an amount, and whether it’s per day, week or month.' },
    { target: 'budgets.kind', title: 'Limits or targets', text: 'Spending limits cap what goes out. Income targets track money coming in, like a sales goal.' },
    { target: 'budgets.list', title: 'How each one is going', text: 'The bar fills as you spend. Pink means you went over. Cynct also shows how much you can spend a day to stay under.' },
  ],
  quick: [
    { title: 'Type it', text: 'The fastest way to log money: write it like a text message, and Cynct fills in the rest.' },
    { target: 'quick.input', title: 'Write here', text: 'Say what, how much and which account, in any order. “lunch 180 gcash” is an expense of ₱180 from GCash.' },
    { target: 'quick.examples', title: 'A few tricks', text: '“+” or salary makes it income. Naming two accounts makes it a transfer. Add “yesterday” to backdate. Tap an example to try it.' },
    { title: 'Check, then save', text: 'Cynct shows what it understood as chips. If it looks right, press Save. If not, change your words.' },
  ],
};

export interface TourState { auto: boolean; seen: TourId[] }

/** Tips start by themselves only for new users, and only once per screen. */
export function readTours(settings: Record<string, unknown>): TourState {
  const t = (settings.tours ?? {}) as Partial<TourState>;
  return { auto: t.auto === true, seen: Array.isArray(t.seen) ? t.seen.filter((x): x is TourId => x in TOURS) : [] };
}

export const shouldAutoStart = (s: TourState, id: TourId) => s.auto && !s.seen.includes(id);
export const markSeen = (s: TourState, id: TourId): TourState => (s.seen.includes(id) ? s : { ...s, seen: [...s.seen, id] });

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Where Senti's bubble goes: under the lit-up thing if there's room, otherwise above it. With nothing lit up,
 * it sits a third of the way down.
 */
export function placeBubble(rect: Rect | null, screenH: number, bubbleH: number, top: number, bottom: number): { y: number; side: 'below' | 'above' | 'center' } {
  const gap = 14;
  if (!rect) return { y: Math.max(top + 20, screenH * 0.32 - bubbleH / 2), side: 'center' };
  const below = rect.y + rect.h + gap;
  if (below + bubbleH <= screenH - bottom - 8) return { y: below, side: 'below' };
  const above = rect.y - gap - bubbleH;
  if (above >= top + 8) return { y: above, side: 'above' };
  return { y: Math.max(top + 8, screenH - bottom - bubbleH - 8), side: 'center' };
}

/** How far to scroll so a target lands in the upper part of the screen; 0 when it's already comfortably visible. */
export function scrollNeeded(rect: Rect, screenH: number, top: number, bottom: number): number {
  const visibleTop = top + 60, visibleBottom = screenH - bottom - 260;
  if (rect.y >= visibleTop && rect.y + Math.min(rect.h, 220) <= visibleBottom) return 0;
  return rect.y - (top + screenH * 0.22);
}
