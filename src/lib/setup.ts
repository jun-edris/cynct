// The short setup after Welcome: what to ask, in what order, and turning the accounts someone picks into
// real accounts linked to payment capture. Pure, so it can be tested.
import type { Account } from '../db/schema';
import type { AppId } from './capture';
import { ACCOUNT_ICONS } from './seed';
import { uid } from './money';

export type SetupPath = 'empty' | 'starter' | 'restore';
export type SetupStep = 'accounts' | 'capture' | 'backup';

/**
 * Starting empty means there are no accounts yet, so that comes first: capture needs to know which account a
 * GCash payment comes out of. Everyone gets capture and the backup folder, including people restoring a
 * backup, because notification access and the folder belong to the phone, not the backup.
 */
export function setupSteps(path: SetupPath): SetupStep[] {
  return path === 'empty' ? ['accounts', 'capture', 'backup'] : ['capture', 'backup'];
}

export const readSetupPath = (v: unknown): SetupPath | null => (v === 'empty' || v === 'starter' || v === 'restore' ? v : null);

export interface Preset { name: string; type: string; color: string; app?: AppId }

/** The accounts most people here have, ready to tap. */
export const PRESETS: Preset[] = [
  { name: 'GCash', type: 'ewallet', color: '#4C8DFF', app: 'gcash' },
  { name: 'Maya', type: 'ewallet', color: '#2EC4B6', app: 'maya' },
  { name: 'Cash', type: 'cash', color: '#7C879C' },
  { name: 'GoTyme', type: 'bank', color: '#3FA7D6', app: 'gotyme' },
  { name: 'BPI', type: 'bank', color: '#B11116' },
  { name: 'BDO', type: 'bank', color: '#0B3D91' },
  { name: 'UnionBank', type: 'bank', color: '#F47920' },
  { name: 'LandBank', type: 'bank', color: '#00843D' },
  { name: 'MariBank', type: 'savings', color: '#FF8A3D' },
  { name: 'Wise', type: 'bank', color: '#2BB673', app: 'wise' },
];

export interface PickedAccount { name: string; type: string; color: string; app?: AppId; opening: number }

/** New accounts in the order picked, plus which capture app each one belongs to. Blank names are dropped. */
export function buildAccounts(picked: PickedAccount[], startSort: number, now = Date.now()): { accounts: Account[]; links: Partial<Record<AppId, string[]>> } {
  const accounts: Account[] = [];
  const links: Partial<Record<AppId, string[]>> = {};
  picked.filter(p => p.name.trim()).forEach((p, i) => {
    const a: Account = {
      id: uid(), name: p.name.trim(), type: p.type, color: p.color, icon: ACCOUNT_ICONS[p.type] ?? 'wallet', currency: 'PHP',
      opening: Math.round(p.opening), creditLimit: null, statementDay: null, dueDay: null, note: '', archived: false, sort: startSort + i, createdAt: now,
    };
    accounts.push(a);
    if (p.app) links[p.app] = [...(links[p.app] ?? []), a.id];
  });
  return { accounts, links };
}

/** The account new entries use unless you pick another: an e-wallet if there is one, since most spending happens there. */
export function defaultAccount(accounts: Account[]): string | null {
  return (accounts.find(a => a.type === 'ewallet') ?? accounts.find(a => a.type === 'cash') ?? accounts[0])?.id ?? null;
}
