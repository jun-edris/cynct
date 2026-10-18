# Bahay (Android)

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

## Build 2 (not in this build)

Receipt scanning (on-device ML Kit), multi-currency, extra calculators and templates.
