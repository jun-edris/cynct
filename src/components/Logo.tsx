import React from 'react';
import Svg, { G, Path, Rect } from 'react-native-svg';

/**
 * Cynct's mark: a cent sign (¢) whose C is a sync arrow turning upward — cents that stay in sync and grow.
 * Same geometry as the app icon (assets/icon.png), drawn in a 100×100 box.
 */
export function Logo({ size = 40, tile = true, mango = '#FFB020', bar = '#F7F5EF', bg = '#0B1426' }: { size?: number; tile?: boolean; mango?: string; bar?: string; bg?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Cynct">
      {tile ? <Rect width={100} height={100} rx={24} fill={bg} /> : null}
      <G transform={tile ? 'translate(5 5) scale(0.9)' : undefined}>
        <Path d="M65.43 68.39 A24 24 0 1 1 67.84 33.94" fill="none" stroke={mango} strokeWidth={10} strokeLinecap="round" />
        <Path d="M71.85 76.05 L78.45 57.46 L59 60.72 Z" fill={mango} stroke={mango} strokeWidth={3} strokeLinejoin="round" />
        <Rect x={44.6} y={16.5} width={7.8} height={67} rx={3.9} fill={bar} />
      </G>
    </Svg>
  );
}
