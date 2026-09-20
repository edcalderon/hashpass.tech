import React from 'react';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

export type HowItWorksCardId = 'scan' | 'allies' | 'meet' | 'rewards';
export type HowItWorksSceneLabels = {
  eventPass: string; eventExplorer: string; agenda: string; speakers: string;
  findAttendees: string; meet: string; lksWallet: string; availableBalance: string;
};
const defaultLabels: HowItWorksSceneLabels = {
  eventPass: 'EVENT PASS', eventExplorer: 'EVENT EXPLORER', agenda: 'AGENDA', speakers: 'SPEAKERS',
  findAttendees: 'FIND ATTENDEES', meet: 'MEET', lksWallet: '$LKS WALLET', availableBalance: 'AVAILABLE BALANCE',
};

/** Native keeps the product-specific scenes while avoiding web-only looping motion. */
export default function HowItWorksIllustration({ kind, color, labels = defaultLabels }: { kind: HowItWorksCardId; color: string; animated?: boolean; labels?: HowItWorksSceneLabels }) {
  const frame = { fill: 'none', stroke: color, strokeWidth: 1.25, opacity: 0.24 } as const;
  const copy = { fill: color, fontSize: 6, fontWeight: '700', letterSpacing: 0.7, opacity: 0.58 } as const;
  return <Svg width={220} height={116} viewBox="0 0 220 116" accessible={false}>
    {kind === 'scan' && <>
      <Rect {...frame} x={53} y={18} width={114} height={80} rx={14} />
      <SvgText {...copy} x={68} y={33}>{labels.eventPass}</SvgText><Path d="M68 39h28" stroke={color} strokeWidth={2} opacity={0.2} strokeLinecap="round" />
      <Path d="M78 57V48h12M132 48h12v9M144 76v9h-12M90 85H78v-9" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M89 59h9v9h-9zM106 59h9v9h-9zM89 76h9v9h-9zM106 76h4v4h-4zM114 81h3v4h-3z" fill={color} />
      <Line x1={69} y1={72} x2={153} y2={72} stroke={color} strokeWidth={2} opacity={0.7} />
      <Circle cx={153} cy={86} r={10} fill={color} /><Path d="m148 86 3 3 6-7" stroke="white" strokeWidth={2.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>}
    {kind === 'allies' && <>
      <Rect {...frame} x={37} y={23} width={146} height={70} rx={14} />
      <SvgText {...copy} x={52} y={39}>{labels.eventExplorer}</SvgText>
      <SvgText {...copy} x={53} y={54} opacity={0.48}>{labels.agenda}</SvgText><SvgText {...copy} x={101} y={54} opacity={0.48}>{labels.speakers}</SvgText>
      <Line x1={52} y1={59} x2={85} y2={59} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      {[{ x: 63, opacity: 0.88 }, { x: 102, opacity: 0.68 }, { x: 141, opacity: 0.48 }].map(person => <React.Fragment key={person.x}><Circle cx={person.x} cy={76} r={9} fill={color} opacity={person.opacity} /><Circle cx={person.x} cy={73} r={3} fill="white" opacity={0.78} /></React.Fragment>)}
      <Line x1={72} y1={76} x2={132} y2={76} stroke={color} strokeWidth={1.25} opacity={0.25} /><Circle cx={102} cy={76} r={3.5} fill="white" stroke={color} strokeWidth={1.75} />
      <Path d="m164 75 4 4-4 4" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
    </>}
    {kind === 'meet' && <>
      <Rect {...frame} x={36} y={21} width={148} height={74} rx={14} />
      <Rect x={51} y={34} width={118} height={18} rx={9} fill="none" stroke={color} strokeWidth={1.4} opacity={0.42} /><Circle cx={63} cy={43} r={3.6} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} /><Path d="m66 46 3 3" stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
      <SvgText {...copy} x={76} y={45.5}>{labels.findAttendees}</SvgText>
      <Circle cx={62} cy={70} r={8} fill={color} opacity={0.78} /><Path d="M74 67h35M74 73h22" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.34} /><Rect x={137} y={63} width={23} height={14} rx={7} fill={color} /><SvgText x={148.5} y={72.5} fill="white" fontSize={5.5} fontWeight="800" textAnchor="middle">{labels.meet}</SvgText>
      <Rect x={85} y={82} width={24} height={8} rx={4} fill={color} opacity={0.7} /><Rect x={115} y={82} width={19} height={8} rx={4} fill={color} opacity={0.34} />
    </>}
    {kind === 'rewards' && <>
      <Path d="m190 8 8 14-8 5-8-5Z" fill="#627EEA" /><Path d="m190 29 8-5-8 10-8-10Z" fill="#627EEA" opacity={0.72} />
      <Path d="m181 45 18 0 4 4-18 0ZM181 61l18 0 4 4-18 0Z" fill="#14F195" /><Path d="m181 53 18 0 4 4-18 0Z" fill="#9945FF" />
      <Circle cx={190} cy={86} r={12} fill="#F7931A" /><SvgText x={190} y={90} fill="white" fontSize={14} fontWeight="800" textAnchor="middle">B</SvgText><Line x1={187} y1={78} x2={187} y2={94} stroke="white" strokeWidth={1.15} opacity={0.85} /><Line x1={191} y1={78} x2={191} y2={94} stroke="white" strokeWidth={1.15} opacity={0.85} />
      <Rect {...frame} x={48} y={18} width={124} height={80} rx={14} />
      <SvgText {...copy} x={63} y={35}>{labels.lksWallet}</SvgText><SvgText {...copy} x={63} y={46} opacity={0.42}>{labels.availableBalance}</SvgText>
      <Path d="M104 43 121 57 104 82 87 57Z" fill={color} /><Path d="m87 57 9 6 8-20 8 20 9-6" fill="none" stroke="white" strokeWidth={1.25} opacity={0.7} />
      <Rect x={57} y={63} width={31} height={18} rx={9} fill={color} /><Rect x={132} y={56} width={35} height={18} rx={9} fill={color} />
      <SvgText x={72.5} y={75.3} fill="white" fontSize={10} fontWeight="700" textAnchor="middle">+5</SvgText><SvgText x={149.5} y={68.3} fill="white" fontSize={10} fontWeight="700" textAnchor="middle">+10</SvgText><SvgText x={104} y={94} fill={color} fontSize={10} fontWeight="800" letterSpacing={1.1} textAnchor="middle">$LKS</SvgText>
    </>}
  </Svg>;
}
