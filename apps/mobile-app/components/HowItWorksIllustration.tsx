import React from 'react';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
export type HowItWorksCardId = 'scan' | 'allies' | 'meet' | 'rewards';
/** Vector artwork avoids platform icon-font loading and missing-glyph fallbacks. */
export default function HowItWorksIllustration({ kind, color }: { kind: HowItWorksCardId; color: string; animated?: boolean }) {
  return <Svg width={200} height={116} viewBox="0 0 200 116" accessible={false}>
    {kind === 'scan' && <>
      <Rect x={64} y={22} width={72} height={72} rx={20} fill={color} opacity={0.08} />
      <Path d="M77 44V35h12M111 35h12v9M123 72v9h-12M89 81H77v-9" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M87 46h9v9h-9zM104 46h9v9h-9zM87 63h9v9h-9zM104 63h4v4h-4zM112 68h3v4h-3z" fill={color} />
      <Line x1={52} y1={59} x2={148} y2={59} stroke={color} strokeWidth={2} opacity={0.7} />
    </>}
    {kind === 'allies' && <>
      <Line x1={42} y1={58} x2={158} y2={58} stroke={color} strokeWidth={1.5} opacity={0.25} />
      <Circle cx={100} cy={58} r={31} fill={color} opacity={0.07} />
      <Circle cx={100} cy={58} r={18} fill={color} opacity={0.9} />
      <Circle cx={40} cy={58} r={12} fill={color} opacity={0.8} />
      <Circle cx={160} cy={58} r={10} fill={color} opacity={0.55} />
      <Circle cx={100} cy={58} r={6} fill="white" opacity={0.85} />
    </>}
    {kind === 'meet' && <>
      <Rect x={47} y={30} width={54} height={17} rx={8.5} fill={color} opacity={0.65} />
      <Rect x={104} y={20} width={38} height={14} rx={7} fill={color} opacity={0.12} />
      <Rect x={36} y={78} width={61} height={17} rx={8.5} fill={color} opacity={0.4} />
      <Rect x={120} y={76} width={36} height={12} rx={6} fill={color} opacity={0.15} />
      <Rect x={94} y={57} width={27} height={23} rx={4} fill="none" stroke={color} strokeWidth={3} />
      <Path d="M100 57v-7a7.5 7.5 0 0 1 15 0v7" fill="none" stroke={color} strokeWidth={3} />
      <Circle cx={107.5} cy={67} r={2} fill={color} />
    </>}
    {kind === 'rewards' && <>
      <Circle cx={100} cy={58} r={38} fill={color} opacity={0.1} />
      <Path d="M100 27 126 49 100 88 74 49Z" fill={color} />
      <Path d="m74 49 15 9 11-31 11 31 15-9" fill="none" stroke="white" strokeWidth={1.5} opacity={0.65} />
      <Rect x={34} y={25} width={38} height={22} rx={11} fill={color} />
      <Rect x={128} y={70} width={43} height={22} rx={11} fill={color} />
      <SvgText x={53} y={40} fill="white" fontSize={12} fontWeight="700" textAnchor="middle">+5</SvgText>
      <SvgText x={149.5} y={85} fill="white" fontSize={12} fontWeight="700" textAnchor="middle">+10</SvgText>
      <SvgText x={100} y={108} fill={color} fontSize={12} fontWeight="800" letterSpacing={1.4} textAnchor="middle">$LKS</SvgText>
    </>}
  </Svg>;
}
