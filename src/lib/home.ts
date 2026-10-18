// Which sections Home shows, and in what order. Saved in settings as { order, hidden }.
export type HomeSection = 'networth' | 'stats' | 'goal' | 'budgets' | 'upcoming' | 'note' | 'recent';
export const HOME_SECTIONS: { key: HomeSection; label: string; icon: string }[] = [
  { key: 'networth', label: 'Net worth', icon: 'scale-balance' },
  { key: 'stats', label: 'Today and this month', icon: 'chart-box-outline' },
  { key: 'goal', label: 'Goal', icon: 'flag-outline' },
  { key: 'budgets', label: 'Budgets', icon: 'chart-donut' },
  { key: 'upcoming', label: 'Coming up', icon: 'calendar-clock' },
  { key: 'note', label: 'Pinned note', icon: 'pin-outline' },
  { key: 'recent', label: 'Recent entries', icon: 'history' },
];
export interface HomeLayout { order: HomeSection[]; hidden: HomeSection[] }

/** Saved layout, repaired: unknown keys dropped, sections added in a later version appended. */
export function readLayout(saved: unknown): HomeLayout {
  const all = HOME_SECTIONS.map(s => s.key);
  const s = (saved ?? {}) as Partial<HomeLayout>;
  const order = (Array.isArray(s.order) ? s.order : []).filter((k): k is HomeSection => all.includes(k as HomeSection));
  for (const k of all) if (!order.includes(k)) order.push(k);
  const hidden = (Array.isArray(s.hidden) ? s.hidden : []).filter((k): k is HomeSection => all.includes(k as HomeSection));
  return { order: [...new Set(order)], hidden };
}

export function move(layout: HomeLayout, key: HomeSection, dir: -1 | 1): HomeLayout {
  const order = [...layout.order];
  const i = order.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return layout;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...layout, order };
}
