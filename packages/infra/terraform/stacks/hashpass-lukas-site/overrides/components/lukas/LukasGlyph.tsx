import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { LukasGlyphName, LukasGlyphProps } from '../../types/lukas.types';

const accentFor = (name: LukasGlyphName) => {
  if (name === 'coffee' || name === 'event') return ['#F7C64D', '#C87213'];
  if (name === 'network') return ['#49D7F0', '#176DCE'];
  if (name === 'shield' || name === 'reserve') return ['#69E6A0', '#0C8A58'];
  if (name === 'settings') return ['#B5D0FF', '#5377B8'];
  return ['#B391FF', '#6345C7'];
};

const markFor = (name: LukasGlyphName, foreground: string) => {
  switch (name) {
    case 'coffee':
      return <><Path d="M23 30h28v15c0 7-5 12-12 12H35c-7 0-12-5-12-12V30Z" fill={foreground} /><Path d="M51 35h6c5 0 8 3 8 8s-3 8-8 8h-6" fill="none" stroke={foreground} strokeWidth="5" strokeLinecap="round" /><Path d="M29 22c-4 4 4 6 0 10M39 22c-4 4 4 6 0 10M49 22c-4 4 4 6 0 10" fill="none" stroke={foreground} strokeWidth="3" strokeLinecap="round" /></>;
    case 'event':
      return <><Path d="M19 27h46v33H19V27Z" fill={foreground} /><Path d="M19 35h46" stroke="#F7F4E8" strokeWidth="4" /><Path d="M28 21v12M56 21v12" stroke={foreground} strokeWidth="5" strokeLinecap="round" /><Circle cx="31" cy="45" r="3" fill="#F7F4E8" /><Circle cx="42" cy="45" r="3" fill="#F7F4E8" /><Circle cx="53" cy="45" r="3" fill="#F7F4E8" /></>;
    case 'market':
      return <><Path d="M18 34 25 23h30l7 11v6H18v-6Z" fill={foreground} /><Path d="M22 41h36v20H22V41Z" fill={foreground} /><Path d="M31 61V48h10v13M48 48h5v6h-5z" fill="#F7F4E8" /></>;
    case 'network':
      return <><Circle cx="26" cy="45" r="7" fill={foreground} /><Circle cx="55" cy="28" r="7" fill={foreground} /><Circle cx="55" cy="59" r="7" fill={foreground} /><Path d="m32 42 17-11M32 48l17 9M55 35v17" stroke={foreground} strokeWidth="4" strokeLinecap="round" /></>;
    case 'reserve':
      return <><Ellipse cx="40" cy="25" rx="18" ry="7" fill={foreground} /><Path d="M22 25v28c0 4 8 7 18 7s18-3 18-7V25" fill={foreground} /><Path d="M22 40c0 4 8 7 18 7s18-3 18-7" fill="none" stroke="#F7F4E8" strokeWidth="3" opacity=".8" /><Path d="M34 26h12" stroke="#F7F4E8" strokeWidth="3" strokeLinecap="round" /></>;
    case 'shield':
      return <Path d="M40 17 61 25v15c0 13-8 23-21 28-13-5-21-15-21-28V25l21-8Z" fill={foreground} />;
    case 'settings':
      return <><Circle cx="40" cy="40" r="12" fill="#F7F4E8" /><Path d="M40 17v9M40 54v9M17 40h9M54 40h9M24 24l7 7M49 49l7 7M56 24l-7 7M31 49l-7 7" stroke={foreground} strokeWidth="6" strokeLinecap="round" /></>;
    case 'wallet':
      return <><Rect x="18" y="27" width="44" height="32" rx="7" fill={foreground} /><Path d="M49 37h14v13H49c-4 0-7-3-7-7s3-6 7-6Z" fill="#F7F4E8" /><Circle cx="55" cy="43.5" r="2.5" fill={foreground} /></>;
    default:
      return <><Ellipse cx="40" cy="22" rx="19" ry="7" fill={foreground} /><Path d="M21 22v32c0 6 9 10 19 10s19-4 19-10V22" fill={foreground} /><Path d="M26 35h28M26 48h28" stroke="#F7F4E8" strokeWidth="3" opacity=".85" /><Path d="M40 30v22M34 35h12" stroke="#F7F4E8" strokeWidth="3" strokeLinecap="round" /></>;
  }
};

/** Small, local SVG assets replace platform-specific emoji glyphs in the landing. */
export function LukasGlyph({ name, size = 64 }: LukasGlyphProps) {
  const [start, end] = accentFor(name);
  const id = `lukas-${name}`;
  return (
    <View style={[styles.frame, { width: size, height: size }]} accessible={false}>
      <Svg width={size} height={size} viewBox="0 0 80 80">
        <Defs>
          <SvgLinearGradient id={`${id}-base`} x1="12" y1="10" x2="66" y2="70" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={start} />
            <Stop offset="1" stopColor={end} />
          </SvgLinearGradient>
          <SvgLinearGradient id={`${id}-shine`} x1="20" y1="15" x2="61" y2="65" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity=".72" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="40" cy="43" r="31" fill="#061523" opacity=".24" />
        <Circle cx="40" cy="39" r="31" fill={`url(#${id}-base)`} />
        <Circle cx="40" cy="39" r="25" fill={`url(#${id}-shine)`} opacity=".58" />
        {markFor(name, '#092B31')}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#05131C',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 7,
  },
});
