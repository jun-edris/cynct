import { useColorScheme } from 'react-native';
import { useData } from './data/DataContext';

// K: night violet gradients over a warm cream page. Token names are kept from the first theme so every
// screen picks the new look up: `mango` is now the brand accent (violet), `navy` the night hero blocks.
// Text on the accent is always white (5.6:1 on #6B3BF5). Amber stays for Senti and highlights only.
const light = {
  bg: '#FAF7F2', surface: '#FFFFFF', sunk: '#EFEAE1', raised: '#FFFFFF',
  ink: '#17122D', inkSoft: '#4A4466', muted: '#6E6886', faint: '#A9A3BC', line: '#ECE6DD',
  navy: '#130D2E', navyText: '#FFFFFF', navyMuted: '#E7E0FF', navyLine: '#2D2560',
  mango: '#6B3BF5', mangoSoft: '#ECE6FF', onMango: '#FFFFFF',
  income: '#0F7A4A', incomeSoft: '#DDF3E6', spend: '#D23A7E', spendSoft: '#FFE2EF', warn: '#A86A12', warnSoft: '#FFEEC4',
  info: '#3C6CF0', infoSoft: '#E1EAFF', scrim: 'rgba(19,13,46,0.55)',
  // K extras
  violet: '#6B3BF5', violetDeep: '#4B22C9', magenta: '#E5458F', blue: '#3C6CF0', amber: '#FFB020', night2: '#1E1647',
  gradFrom: '#6B3BF5', gradMid: '#9B3FE0', gradTo: '#E5458F', onNightIn: '#8BF0BC', onNightOut: '#FF9CCB',
  tViolet: '#ECE6FF', tBlue: '#E1EAFF', tMagenta: '#FFE2EF', tAmber: '#FFEEC4', tGreen: '#DDF3E6',
};
const dark: typeof light = {
  bg: '#0E0A20', surface: '#1A1535', sunk: '#141030', raised: '#221C42',
  ink: '#F4F1FA', inkSoft: '#D6D0EA', muted: '#A39CC0', faint: '#6C6590', line: '#2A2350',
  navy: '#1E1647', navyText: '#FFFFFF', navyMuted: '#CFC6F2', navyLine: '#3A2F70',
  mango: '#8E6BFF', mangoSoft: '#2A2156', onMango: '#FFFFFF',
  income: '#3DD68C', incomeSoft: '#123528', spend: '#FF6FA8', spendSoft: '#3A1630', warn: '#F2C14E', warnSoft: '#3A2F12',
  info: '#7FA3FF', infoSoft: '#1B2A55', scrim: 'rgba(0,0,0,0.6)',
  violet: '#8E6BFF', violetDeep: '#B9A3FF', magenta: '#FF6FA8', blue: '#7FA3FF', amber: '#FFB020', night2: '#2A2160',
  gradFrom: '#5A30D6', gradMid: '#8A35C9', gradTo: '#C93A7C', onNightIn: '#8BF0BC', onNightOut: '#FF9CCB',
  tViolet: '#2A2156', tBlue: '#1B2A55', tMagenta: '#3A1630', tAmber: '#3A2F12', tGreen: '#123528',
};
export type Colors = typeof light;

export const fonts = {
  // Space Grotesk for numbers and headings, Inter for everything you read.
  num: 'SpaceGrotesk-SemiBold',
  numBlack: 'SpaceGrotesk-Bold',
  head: 'SpaceGrotesk-Medium',
  body: 'Inter',
  medium: 'Inter-Medium',
  semi: 'Inter-SemiBold',
  bold: 'Inter-Bold',
};

export const radius = { xl: 28, lg: 22, md: 16, sm: 12, pill: 999 };
export const ease = { out: [0.16, 1, 0.3, 1] as const, spring: [0.2, 0.9, 0.25, 1.15] as const };
export const space = { page: 18 };

export function useTheme(): { c: Colors; dark: boolean } {
  const system = useColorScheme();
  const { data } = useData();
  const pref = (data.settings.theme as string) || 'system';
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return { c: isDark ? dark : light, dark: isDark };
}

export const themes = { light, dark };
