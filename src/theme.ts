import { useColorScheme } from 'react-native';
import { useData } from './data/DataContext';

// Navy & Mango. Mango carries the brand and every primary action; navy carries weight and hero blocks.
// Text on mango is always navy (white on #FFB020 fails contrast).
const light = {
  bg: '#F7F5EF', surface: '#FFFFFF', sunk: '#EFEBE1', raised: '#FFFFFF',
  ink: '#0B1426', inkSoft: '#2A3550', muted: '#6B7387', faint: '#A4AABA', line: '#E6E1D5',
  navy: '#0B1426', navyText: '#F4F1E8', navyMuted: '#9AA6BD', navyLine: '#24345A',
  mango: '#FFB020', mangoSoft: '#FFEFC9', onMango: '#0B1426',
  income: '#1F9D63', incomeSoft: '#DDF5E8', spend: '#E04449', spendSoft: '#FDE4E4', warn: '#B7791F', warnSoft: '#FCF0D8',
  info: '#3F6FE0', infoSoft: '#E3EBFD', scrim: 'rgba(11,20,38,0.5)',
};
const dark: typeof light = {
  bg: '#0B1426', surface: '#13213D', sunk: '#0F1A31', raised: '#1A2A4A',
  ink: '#F4F1E8', inkSoft: '#D5D9E3', muted: '#97A3BC', faint: '#5C6A88', line: '#22345A',
  navy: '#1A2A4A', navyText: '#F4F1E8', navyMuted: '#97A3BC', navyLine: '#2C3F68',
  mango: '#FFB020', mangoSoft: '#3A2E12', onMango: '#0B1426',
  income: '#3DD68C', incomeSoft: '#123528', spend: '#FF6B70', spendSoft: '#3A1A22', warn: '#F2C14E', warnSoft: '#3A2F12',
  info: '#7FA3FF', infoSoft: '#1B2A55', scrim: 'rgba(0,0,0,0.6)',
};
export type Colors = typeof light;

export const fonts = {
  // Rounded display for numbers and headings
  num: 'Nunito-ExtraBold',
  numBlack: 'Nunito-Black',
  head: 'Nunito-Bold',
  // Body
  body: 'Figtree',
  medium: 'Figtree-Medium',
  semi: 'Figtree-SemiBold',
  bold: 'Figtree-Bold',
};

export const radius = { xl: 28, lg: 22, md: 16, sm: 12, pill: 999 };
export const space = { page: 18 };

export function useTheme(): { c: Colors; dark: boolean } {
  const system = useColorScheme();
  const { data } = useData();
  const pref = (data.settings.theme as string) || 'system';
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return { c: isDark ? dark : light, dark: isDark };
}

export const themes = { light, dark };
