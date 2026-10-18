// Drizzle table definitions. Must match the SQL in migrations.ts — tests/db.test.ts checks this.
// Money is always integer centavos. Dates are 'YYYY-MM-DD' text, times 'HH:MM'. Timestamps are epoch ms.
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // cash | bank | ewallet | savings | credit | loan | investment
  type: text('type').notNull(),
  color: text('color').notNull(),
  icon: text('icon').notNull().default('wallet'),
  currency: text('currency').notNull().default('PHP'),
  // signed: a credit card or loan that you owe on starts negative
  opening: integer('opening').notNull().default(0),
  creditLimit: integer('credit_limit'),
  statementDay: integer('statement_day'),
  dueDay: integer('due_day'),
  note: text('note').notNull().default(''),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // expense | income
  name: text('name').notNull(),
  parentId: text('parent_id'),
  color: text('color').notNull(),
  icon: text('icon').notNull().default('shape'),
  keywords: text('keywords').notNull().default('[]'), // JSON string[]
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  sort: integer('sort').notNull().default(0),
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  // expense | income | transfer | adjust | debt_out | debt_in | ext_out | ext_in | goal_in | goal_out | goal_interest
  type: text('type').notNull(),
  amount: integer('amount').notNull(), // positive, except adjust which is signed
  fee: integer('fee').notNull().default(0), // transfers and outside sends; counted as spending under Fees
  // Transfers between accounts in different currencies: what arrived, in the destination's currency. Null = same as amount.
  toAmount: integer('to_amount'),
  accountId: text('account_id'), // null only for goal interest and off-wallet debt entries
  toAccountId: text('to_account_id'),
  categoryId: text('category_id'),
  date: text('date').notNull(),
  time: text('time'),
  note: text('note').notNull().default(''),
  counterparty: text('counterparty'), // outside person or place for ext_in / ext_out
  heldFor: text('held_for'),
  photoUri: text('photo_uri'),
  tags: text('tags').notNull().default('[]'), // JSON tag ids
  recurringId: text('recurring_id'),
  installmentId: text('installment_id'),
  debtId: text('debt_id'),
  debtRole: text('debt_role'), // start | borrow | payment
  goalId: text('goal_id'),
  tripId: text('trip_id'),
  deletedAt: integer('deleted_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('tx_date').on(t.date),
  index('tx_account').on(t.accountId),
  index('tx_category').on(t.categoryId),
  index('tx_goal').on(t.goalId),
  index('tx_debt').on(t.debtId),
]);

export const budgets = sqliteTable('budgets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('expense'), // expense (a limit) | income (a target)
  categoryId: text('category_id'), // null = all spending (or all income)
  period: text('period').notNull(), // daily | weekly | biweekly | monthly | yearly
  amount: integer('amount').notNull(),
  rollover: integer('rollover', { mode: 'boolean' }).notNull().default(false),
  startDate: text('start_date').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const recurring = sqliteTable('recurring', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // bill | income | transfer
  amount: integer('amount').notNull(),
  accountId: text('account_id').notNull(),
  toAccountId: text('to_account_id'),
  categoryId: text('category_id'),
  frequency: text('frequency').notNull(), // once | weekly | monthly | semimonthly | quarterly | yearly
  nextDue: text('next_due').notNull(),
  endDate: text('end_date'),
  debtId: text('debt_id'), // paying this records a debt payment
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
});

export const installments = sqliteTable('installments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  monthlyAmount: integer('monthly_amount').notNull(),
  months: integer('months').notNull(),
  paidCount: integer('paid_count').notNull().default(0),
  accountId: text('account_id').notNull(),
  categoryId: text('category_id'),
  nextDue: text('next_due').notNull(),
  note: text('note').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

export const debts = sqliteTable('debts', {
  id: text('id').primaryKey(),
  direction: text('direction').notNull(), // owe (I borrowed) | owed (someone owes me)
  partyType: text('party_type').notNull().default('person'), // person | entity | organization
  person: text('person').notNull(),
  principal: integer('principal').notNull(),
  alreadyPaid: integer('already_paid').notNull().default(0),
  interestRate: integer('interest_rate_bp').notNull().default(0),
  startDate: text('start_date'),
  dueDate: text('due_date'),
  note: text('note').notNull().default(''),
  closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  target: integer('target').notNull(),
  deadline: text('deadline').notNull(),
  monthly: integer('monthly').notNull().default(0),
  annualRate: integer('annual_rate_bp').notNull().default(0), // basis points: 600 = 6.00%
  accountIds: text('account_ids').notNull().default('[]'), // JSON: accounts whose balances also count
  startingSaved: integer('starting_saved').notNull().default(0),
  interestCreditedThrough: text('interest_through'), // last month-end interest was credited for
  photoUri: text('photo_uri'),
  note: text('note').notNull().default(''),
  color: text('color').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const paymentMethods = sqliteTable('payment_methods', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  kind: text('kind').notNull(),
  accountName: text('account_name').notNull().default(''),
  accountNumber: text('account_number').notNull().default(''),
  qrUri: text('qr_uri'),
  note: text('note').notNull().default(''),
  sort: integer('sort').notNull().default(0),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('airplane'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'), // null while the trip is active
  createdAt: integer('created_at').notNull(),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  body: text('body').notNull().default(''),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  remindOn: text('remind_on'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// One row per foreign currency: how many pesos one unit is worth, times 1,000,000 (58.25 → 58_250_000).
export const rates = sqliteTable('rates', {
  currency: text('currency').primaryKey(),
  perUnit: integer('per_unit').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // expense | income | transfer
  amount: integer('amount').notNull().default(0), // 0 = ask each time
  accountId: text('account_id'),
  toAccountId: text('to_account_id'),
  categoryId: text('category_id'),
  note: text('note').notNull().default(''),
  tags: text('tags').notNull().default('[]'),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
});

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Recurring = typeof recurring.$inferSelect;
export type Installment = typeof installments.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Rate = typeof rates.$inferSelect;
export type Template = typeof templates.$inferSelect;

export const schema = { accounts, categories, transactions, budgets, recurring, installments, debts, goals, paymentMethods, tags, trips, notes, rates, templates, settings };
