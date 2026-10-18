export const PERIOD_WORD: Record<string, string> = { daily: 'today', weekly: 'this week', biweekly: 'these 2 weeks', monthly: 'this month', yearly: 'this year' };
export const FREQ_LABEL: Record<string, string> = { once: 'One time', weekly: 'Weekly', monthly: 'Monthly', semimonthly: '15th and 30th', quarterly: 'Every 3 months', yearly: 'Yearly' };
export const PARTY_LABEL: Record<string, string> = { person: 'Person', entity: 'Entity', organization: 'Organization' };
export const PARTY_ICON: Record<string, string> = { person: 'account', entity: 'domain', organization: 'account-group' };

export const PM_KIND: Record<string, { label: string; color: string; icon: string }> = {
  gcash: { label: 'GCash', color: '#2F6BFF', icon: 'cellphone' },
  maya: { label: 'Maya', color: '#2BB673', icon: 'cellphone' },
  bank: { label: 'Bank', color: '#8B6CFF', icon: 'bank' },
  other: { label: 'Other', color: '#7C879C', icon: 'qrcode' },
};
