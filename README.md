# Cynct (Android)

Cynct = cent + sync. Formerly Bahay; the Android package id (`com.junaire.bahay`), EAS slug, database file (`bahay.db`) and backup format id keep the old name on purpose so the app updates in place and every old backup restores.

Offline budget and expense tracker. Expo SDK 58, React Native, TypeScript, SQLite (expo-sqlite) with Drizzle ORM.
No accounts, no servers: everything lives in `bahay.db` on the phone.

## Install on your phone (no Play Store)

```
npm install
npx eas-cli@latest login            # free Expo account
npx eas-cli@latest build -p android --profile preview
```

EAS builds in the cloud and gives you a link to an `.apk`. Open it on your phone and allow "install unknown apps" for your browser.
To move data from the Bahay web app: in the web app, Settings → Download backup, then in this app choose "Restore a backup".

**Updating from 1.x:** build the new APK the same way and install it over the old one (same EAS project, so the same signing key).
Your data stays: on first launch the database migrates from v1 to v2 in place. Make a backup first anyway (Settings → Share backup).

### Developing on the phone

```
npx eas-cli@latest build -p android --profile development   # once, installs a dev build
npx expo start                                              # then open it from the dev build
```

Expo Go won't work: the app uses native modules (SQLite, biometrics, date picker) that need a development build.

## Checks

```
npm test            # money logic + real SQLite tests (better-sqlite3; skipped if it can't install, e.g. Windows without build tools)
npm run typecheck
npx expo lint
```

`npx expo export --platform web` builds a browser preview that uses an in-memory database (`src/db/client.web.ts`).
It's only for screenshots and quick UI checks; nothing persists there, and backups/biometrics don't work on web.

## Layout

| Path | What it is |
|---|---|
| `src/db/schema.ts` | Drizzle tables. Money is integer centavos, dates are `YYYY-MM-DD` |
| `src/db/migrations.ts` | SQL migrations by `PRAGMA user_version`. Never edit a shipped one; append a new one |
| `src/db/repo.ts` | Every write. Multi-table actions (pay a bill, pay an installment, debt payment) are single transactions |
| `src/lib/ledger.ts` | Balances, budgets (daily to yearly, rollover, income targets), goal funds and interest, installments, debts, streaks, forecast |
| `src/lib/parse.ts` | Quick entry: `lunch 180 gcash`, `+50k salary wise`, `35k wise > house fund` |
| `src/lib/backup.ts` | Daily backup (last 14 kept in the app), optional Drive folder, share and restore |
| `src/lib/importPwa.ts` | Converts a web app backup |
| `src/theme.ts` | Navy & Mango design tokens, light and dark |
| `src/components/ui.tsx` | Design system: Screen, Block, Card, List/Row, Sheet, fields, pickers, keypad |
| `src/components/domain.tsx` | Money-aware pieces: transaction rows, coming-up rows, category grid, photo and tag fields |
| `src/app/` | Screens (Expo Router). Tabs: Home, Wallet, Plan, History; the center + opens Expense / Income / Transfer / Type it |

## How money moves

- Expenses and income change one account. Transfers move between two and are never counted as spending.
- Credit cards and loans are accounts with negative balances. Paying a card is a transfer into it.
- Debts with people use `debt_in` / `debt_out` rows so they don't distort income or spending.
- Bills, income and installments are never posted automatically. "Paid" records the transaction and moves the due date in one step, with undo.
- Updating an account's real balance records a correction (`adjust`) only if the account already has history.
- Transfer and send fees are real spending, reported under the Fees category.
- "Outside" sends and receipts (`ext_out` / `ext_in`) move money to or from people outside your accounts without counting as income or spending.
- Goals hold their own money: "Add money" moves it out of an account into the goal (`goal_in`), "Withdraw" moves it back. Monthly interest is credited on launch for finished months. A goal can also count linked account balances.
- Deleting an entry moves it to Recently deleted for 30 days.

## Build 2

- **Multi-currency.** Each account has a currency (set when created; locked once it has entries). Amounts are stored in that currency.
  Totals, budgets, goals, debts and the forecast convert to pesos using rates in Currencies (`rates` table, pesos per unit × 1,000,000).
  A missing rate counts that account as ₱0 and shows a warning. A transfer between currencies stores what arrived in `to_amount`.
  Live rates come from FXRatesAPI (no key; falls back to open.er-api.com), refreshed on launch when older than 6 hours and on demand
  (`src/lib/fxrates.ts`, `useRefreshRates`). The full table is cached in settings (`fx`) for the converter and offline use; a rate you
  set by hand and mark "Keep my rate" (`pinnedRates`) is never overwritten.
- **Receipt scan** (`src/app/scan.tsx`, `src/lib/receipt.ts`): `expo-text-extractor` (Google ML Kit on Android) reads the photo on the phone;
  the parser picks total, date, store and a category guess, and lists every amount so a wrong guess is one tap to fix.
  ML Kit's text model comes through Google Play services and downloads once on first use.
- **Templates**: saved entries under the + button. With an amount and account they record in one tap; otherwise they open the entry screen prefilled.
- **Calculators** (`src/app/tools/`, `src/lib/finance.ts`): loan (reducing balance or add-on rate, with its true yearly cost), savings, split the bill.
- Database v3 (`MIGRATIONS[2]`) adds `transactions.to_amount`, `rates`, `templates`. Backups are version 3; version 2 backups still restore.

## Phase 3

- **Tax calculator** (`src/lib/phtax.ts`, `tools/tax`): 2026 SSS (5% of MSC ₱5k–₱35k), GSIS 9%, PhilHealth 2.5% (₱10k–₱100k), Pag-IBIG 2% up to ₱10k,
  BIR TRAIN graduated table, 13th month tax-free up to ₱90k, self-employed with 40% OSD + 3% percentage tax, and the 8% option. Estimates only.
- **Invoices** (`invoices`, `invoice/[id]`, `business`, `src/lib/invoice.ts`, DB v4 `invoices` table): line items, discount, tax, any currency,
  PDF export through `expo-print` + share sheet, "Paid" can record the income.
- **Reminders** (`src/lib/reminders.ts` plans, `src/lib/notify.ts` schedules with `expo-notifications`): daily check-in, bills/paydays/installments
  (plus a day-before heads-up for bills), debts, card due days, goal dates — all local, re-planned whenever data changes, max 40 scheduled.
- **Monthly statement PDF** (`statement`, `src/lib/statement.ts`) and **Recap** (`recap`, `src/lib/recap.ts`): Wrapped-style cards for last month / this year.
- **Home layout** (`home-layout`, `src/lib/home.ts`): show, hide and reorder Home sections.
