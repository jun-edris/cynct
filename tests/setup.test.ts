import { describe, expect, it } from 'vitest';
import { PRESETS, buildAccounts, defaultAccount, readSetupPath, setupSteps } from '../src/lib/setup';

describe('setup after Welcome', () => {
  it('asks for accounts only when starting empty, and capture plus backups for everyone', () => {
    expect(setupSteps('empty')).toEqual(['accounts', 'capture', 'backup']);
    expect(setupSteps('starter')).toEqual(['capture', 'backup']);
    expect(setupSteps('restore')).toEqual(['capture', 'backup']);
    expect(readSetupPath('empty')).toBe('empty');
    expect(readSetupPath(null)).toBeNull();
    expect(readSetupPath('nope')).toBeNull();
  });

  it('turns picked accounts into real ones, linked to the app that notifies about them', () => {
    const gcash = PRESETS.find(p => p.name === 'GCash')!, bpi = PRESETS.find(p => p.name === 'BPI')!;
    const { accounts, links } = buildAccounts([
      { ...gcash, opening: 1_250_00 }, { ...bpi, opening: 40_000_00 }, { name: '  ', type: 'bank', color: '#000', opening: 5 }, { name: 'Metrobank ', type: 'bank', color: '#8B6CFF', opening: 0 },
    ], 3, 1000);
    expect(accounts.map(a => [a.name, a.opening, a.sort, a.icon])).toEqual([['GCash', 125_000, 3, 'cellphone'], ['BPI', 4_000_000, 4, 'bank'], ['Metrobank', 0, 5, 'bank']]);
    expect(links).toEqual({ gcash: [accounts[0].id] });
    expect(defaultAccount(accounts)).toBe(accounts[0].id);
    expect(defaultAccount([])).toBeNull();
  });
});
