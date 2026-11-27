import { describe, expect, it } from 'vitest';
import { learn, payeeKey, recall } from '../src/lib/learn';
import { budgetCrossings } from '../src/lib/budgetAlert';
import { planPaycheck } from '../src/lib/paycheck';

describe('category learning', () => {
  it('normalises payees', () => {
    expect(payeeKey('From Dale Johnson')).toBe('dale johnson');
    expect(payeeKey('Sent to +63 967 258 9889')).toBeNull();
    expect(payeeKey('NEOMONEY INC.')).toBe('neomoney inc');
    expect(payeeKey('ab')).toBeNull();
  });
  it('remembers the last category per payee and ignores deleted ones', () => {
    let m = learn(undefined, 'Neomoney INC', 'bills', 1);
    m = learn(m, 'neomoney inc', 'investing', 100_000);
    expect(recall(m, 'NEOMONEY INC.', new Set(['investing']))).toBe('investing');
    expect(recall(m, 'NEOMONEY INC.', new Set(['bills']))).toBeNull();
    expect(m['neomoney inc'].n).toBe(1);
  });
  it('keeps at most 300 payees, dropping the oldest', () => {
    let m = learn(undefined, 'first payee', 'a', 0);
    for (let i = 1; i <= 300; i++) m = learn(m, `payee ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, 'a', i * 100_000);
    expect(Object.keys(m).length).toBe(300);
    expect(m['first payee']).toBeUndefined();
  });
});

describe('budget alerts', () => {
  const cats = [{ id: 'food', kind: 'expense', parentId: null, name: 'Food' }, { id: 'food.coffee', kind: 'expense', parentId: 'food', name: 'Coffee' }];
  const b = { id: 'b', name: 'Food', kind: 'expense', categoryId: 'food', period: 'monthly', amount: 10_000, rollover: false, startDate: '2026-01-01' };
  const tx = (amount: number, categoryId = 'food') => ({ id: String(amount), type: 'expense', amount, date: '2026-11-10', accountId: 'a', toAccountId: null, categoryId, fee: 0, deletedAt: null });
  it('flags crossing 80% and 100%, counting subcategories', () => {
    expect(budgetCrossings([b], [tx(7_000)], cats, { categoryId: 'food.coffee', amount: 1_500, date: '2026-11-20' }, '2026-11-20')[0]).toMatchObject({ level: 80 });
    expect(budgetCrossings([b], [tx(9_000)], cats, { categoryId: 'food', amount: 2_000, date: '2026-11-20' }, '2026-11-20')[0]).toMatchObject({ level: 100, remaining: -1_000 });
  });
  it('stays quiet when already past, in another category, or another month', () => {
    expect(budgetCrossings([b], [tx(9_000)], cats, { categoryId: 'food', amount: 500, date: '2026-11-20' }, '2026-11-20')).toEqual([]);
    expect(budgetCrossings([b], [tx(7_000)], cats, { categoryId: 'transport', amount: 5_000, date: '2026-11-20' }, '2026-11-20')).toEqual([]);
    expect(budgetCrossings([b], [tx(7_000)], cats, { categoryId: 'food', amount: 5_000, date: '2026-10-20' }, '2026-11-20')).toEqual([]);
  });
});

describe('emergency fund first', () => {
  const base = { days: 15, bills: [], dailySpend: 0, investPct: 0 };
  it('fills the priority goal’s need before splitting the rest', () => {
    const p = planPaycheck({ ...base, amount: 5_000, goals: [{ id: 'ef', name: 'EF', need: 4_000 }, { id: 'house', name: 'House', need: 4_000 }], priorityId: 'ef' });
    expect(p.goals.find(g => g.id === 'ef')!.put).toBe(4_000);
    expect(p.goals.find(g => g.id === 'house')!.put).toBe(1_000);
  });
  it('puts free money into the priority goal first, up to its room', () => {
    const p = planPaycheck({ ...base, amount: 20_000, freeToGoals: true, priorityId: 'ef',
      goals: [{ id: 'ef', name: 'EF', need: 1_000, room: 6_000 }, { id: 'house', name: 'House', need: 1_000, room: 100_000 }] });
    expect(p.goals.find(g => g.id === 'ef')!.put).toBe(6_000);
    expect(p.goals.find(g => g.id === 'house')!.put).toBe(14_000);
    expect(p.free).toBe(0);
  });
  it('splits by need when there is no priority', () => {
    const p = planPaycheck({ ...base, amount: 3_000, goals: [{ id: 'a', name: 'A', need: 2_000 }, { id: 'b', name: 'B', need: 2_000 }] });
    expect(p.goals.map(g => g.put)).toEqual([1_500, 1_500]);
  });
});

import { bucketOf, needsShareOf, splitOfPlan, targetAmounts } from '../src/lib/split';

describe('needs, wants, savings', () => {
  const cats = [
    { id: 'food', kind: 'expense', parentId: null, name: 'Food' }, { id: 'food.eatout', kind: 'expense', parentId: 'food', name: 'Eating out' },
    { id: 'mine', kind: 'expense', parentId: 'bills', name: 'My bill' }, { id: 'bills', kind: 'expense', parentId: null, name: 'Bills' },
  ];
  it('classifies by the nearest known category', () => {
    expect(bucketOf('food.eatout', cats)).toBe('want');
    expect(bucketOf('mine', cats)).toBe('need');
    expect(bucketOf('house', cats)).toBe('save');
    expect(bucketOf(null, cats)).toBe('want');
  });
  it('measures how everyday spending splits, ignoring planned bills', () => {
    const tx = (id: string, categoryId: string, amount: number, extra = {}) => ({ id, type: 'expense', amount, date: '2026-11-20', accountId: 'a', toAccountId: null, categoryId, fee: 0, deletedAt: null, ...extra });
    const s = needsShareOf([tx('1', 'food', 300), tx('2', 'food.eatout', 100), tx('3', 'bills', 5000, { recurringId: 'r' })], cats, '2026-11-27');
    expect(s).toBe(0.75);
    expect(needsShareOf([], cats, '2026-11-27')).toBe(0.6);
  });
  it('maps a paycheck plan and a target split to pesos', () => {
    expect(splitOfPlan({ needs: 1000, dayToDay: 1000, save: 500, invest: 200, free: 300 }, 0.75)).toEqual({ needs: 1750, wants: 550, savings: 700 });
    expect(targetAmounts(1001, [50, 30, 20])).toEqual({ needs: 501, wants: 300, savings: 200 });
  });
});

import { guideSplit } from '../src/lib/paycheck';

describe('needs / wants / savings guide', () => {
  it('maps the plan into needs, wants and savings and finds the biggest gap', () => {
    const r = guideSplit({ needs: 30_000, dayToDay: 30_000, save: 5_000, invest: 5_000, free: 30_000 }, 100_000, '50/30/20');
    expect(r.actual).toEqual({ needs: 60_000, wants: 30_000, save: 10_000 });
    expect(r.guide).toEqual({ needs: 50_000, wants: 30_000, save: 20_000 });
    expect(r.note).toMatch(/^Needs take 10 points more/);
  });
  it('says nothing when within 5 points', () => {
    expect(guideSplit({ needs: 48_000, dayToDay: 0, save: 21_000, invest: 0, free: 31_000 }, 100_000, '50/30/20').note).toBeNull();
  });
  it('supports other splits', () => {
    expect(guideSplit({ needs: 0, dayToDay: 0, save: 0, invest: 0, free: 0 }, 100_000, '70/20/10').guide).toEqual({ needs: 70_000, wants: 20_000, save: 10_000 });
  });
});

import { dailySpendingDetail, needOrWant } from '../src/lib/paycheck';

describe('needs vs wants in day-to-day', () => {
  const cats = [{ id: 'food', parentId: null }, { id: 'food.eatout', parentId: 'food' }, { id: 'food.eatout.jollibee', parentId: 'food.eatout' }, { id: 'pets', parentId: null }];
  it('classifies with your choice first, then defaults, inheriting from parents', () => {
    expect(needOrWant('food', cats)).toBe('need');
    expect(needOrWant('food.eatout.jollibee', cats)).toBe('want');
    expect(needOrWant('food.eatout.jollibee', cats, { 'food.eatout.jollibee': 'need' })).toBe('need');
    expect(needOrWant('pets', cats, { pets: 'want' })).toBe('want');
    expect(needOrWant(null, cats)).toBe('need');
  });
  it('measures the needs share of day-to-day spending', () => {
    const d = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
    const txs = [
      { type: 'expense', amount: 300, date: d(1), categoryId: 'food' }, { type: 'expense', amount: 100, date: d(2), categoryId: 'food.eatout' },
    ];
    const r = dailySpendingDetail(txs, d(20), 60, id => needOrWant(id, cats) === 'want');
    expect(r.needShare).toBeCloseTo(0.75);
  });
  it('splits day-to-day between needs and wants in the guide', () => {
    const g = guideSplit({ needs: 10_000, dayToDay: 40_000, save: 20_000, invest: 0, free: 30_000 }, 100_000, '50/30/20', 0.75);
    expect(g.actual).toEqual({ needs: 40_000, wants: 40_000, save: 20_000 });
  });
});

import { safeToSpend } from '../src/lib/paycheck';

describe('safe to spend', () => {
  it('spreads money after bills over the days until the next income', () => {
    const r = safeToSpend({ spendable: 10_000, spentToday: 1_000, bills: 3_000, today: '2026-11-27', next: { date: '2026-11-30', name: 'Salary' } });
    expect(r).toEqual({ allowance: Math.floor(8_000 / 3), left: Math.floor(8_000 / 3) - 1_000, days: 3, until: '2026-11-30', untilName: 'Salary' });
  });
  it('falls back to the end of the month and never goes below zero', () => {
    const r = safeToSpend({ spendable: 1_000, spentToday: 0, bills: 5_000, today: '2026-11-27', next: null });
    expect(r.until).toBe('2026-12-01');
    expect(r.days).toBe(4);
    expect(r.allowance).toBe(0);
    expect(r.untilName).toBeNull();
  });
  it('shows today’s overspend as negative left', () => {
    expect(safeToSpend({ spendable: 0, spentToday: 3_000, bills: 0, today: '2026-11-27', next: { date: '2026-11-28', name: 'Pay' } }).left).toBe(0);
    expect(safeToSpend({ spendable: 0, spentToday: 3_000, bills: 2_000, today: '2026-11-27', next: { date: '2026-11-29', name: 'Pay' } }).left).toBe(-2_500);
  });
});

import { expiredBackups } from '../src/lib/backupPrune';

describe('backup clean-up', () => {
  it('deletes Cynct backups older than 30 days, keeps the newest 3 and other files', () => {
    const names = ['cynct-2026-11-27.json', 'cynct-2026-10-28.json', 'cynct-2026-10-27.json', 'bahay-2026-09-01.json',
      'content://x/document/primary%3ADocuments%2FCynct%2Fcynct-2026-10-01%20(1).json', 'notes.txt'];
    expect(expiredBackups(names, '2026-11-27')).toEqual(['content://x/document/primary%3ADocuments%2FCynct%2Fcynct-2026-10-01%20(1).json', 'bahay-2026-09-01.json']);
  });
  it('keeps the newest three even when all are old', () => {
    expect(expiredBackups(['cynct-2026-01-01.json', 'cynct-2026-01-02.json', 'cynct-2026-01-03.json', 'cynct-2026-01-04.json'], '2026-11-27')).toEqual(['cynct-2026-01-01.json']);
  });
});

import { parseBackupText } from '../src/lib/backupPrune';

describe('reading damaged backups', () => {
  it('reads normal JSON and recovers a file with a leftover tail', () => {
    expect(parseBackupText('{"a":1}')).toEqual({ a: 1 });
    expect(parseBackupText('{"a":{"b":2}}}')).toEqual({ a: { b: 2 } });
    expect(parseBackupText('﻿{"a":{"b":2}}"}]}')).toEqual({ a: { b: 2 } });
    expect(parseBackupText('not json')).toBeUndefined();
  });
});
