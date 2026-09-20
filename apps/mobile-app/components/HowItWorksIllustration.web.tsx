import React from 'react';
export type HowItWorksCardId = 'scan' | 'allies' | 'meet' | 'rewards';
/** Web-only detail motion. The native counterpart renders lightweight static vectors. */
export default function HowItWorksIllustration({ kind, color, animated = false }: { kind: HowItWorksCardId; color: string; animated?: boolean }) {
  return <svg width="200" height="116" viewBox="0 0 200 116" aria-hidden="true" className={animated ? 'hp-illustration hp-illustration-active' : 'hp-illustration'} style={{ color }}>
    <style>{`.hp-illustration .hp-detail{animation-play-state:paused;transform-box:fill-box;transform-origin:center}.hp-illustration-active .hp-detail{animation-play-state:running}.hp-scan{animation:hp-scan 3.2s ease-in-out infinite}.hp-node{animation:hp-node 2.8s ease-in-out infinite}.hp-chat{animation:hp-chat 3.8s ease-in-out infinite}.hp-coin{animation:hp-coin 5s ease-in-out infinite}.hp-spark{animation:hp-spark 3s ease-in-out infinite}@keyframes hp-scan{0%,100%{transform:translateY(-22px);opacity:.25}50%{transform:translateY(22px);opacity:1}}@keyframes hp-node{0%,100%{transform:scale(1);opacity:.65}50%{transform:scale(1.16);opacity:1}}@keyframes hp-chat{0%,100%{transform:translateY(4px);opacity:.35}50%{transform:translateY(-5px);opacity:.8}}@keyframes hp-coin{0%,30%,100%{transform:scaleX(1)}48%{transform:scaleX(.12)}66%{transform:scaleX(1)}}@keyframes hp-spark{0%,100%{transform:scale(.75);opacity:.3}50%{transform:scale(1.15);opacity:1}}@media(prefers-reduced-motion:reduce){.hp-illustration .hp-detail{animation:none!important}}`}</style>
    {kind === 'scan' && <>
      <rect x="64" y="22" width="72" height="72" rx="20" fill={color} opacity=".08" />
      <path d="M77 44V35h12M111 35h12v9M123 72v9h-12M89 81H77v-9" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M87 46h9v9h-9zM104 46h9v9h-9zM87 63h9v9h-9zM104 63h4v4h-4zM112 68h3v4h-3z" fill={color} />
      <g className="hp-detail hp-scan"><rect x="52" y="56" width="96" height="6" rx="3" fill={color} opacity=".12" /><path d="M52 59h96" stroke={color} strokeWidth="2" /></g>
    </>}
    {kind === 'allies' && <>
      <path d="M42 58h116" stroke={color} strokeWidth="1.5" opacity=".25" />
      <circle cx="100" cy="58" r="31" fill={color} opacity=".07" />
      <circle className="hp-detail hp-node" cx="40" cy="58" r="12" fill={color} />
      <g className="hp-detail hp-node" style={{ animationDelay: '-.8s' }}><circle cx="100" cy="58" r="18" fill={color} /><circle cx="100" cy="58" r="6" fill="white" opacity=".85" /></g>
      <circle className="hp-detail hp-node" style={{ animationDelay: '-1.6s' }} cx="160" cy="58" r="10" fill={color} />
    </>}
    {kind === 'meet' && <>
      <rect className="hp-detail hp-chat" x="47" y="30" width="54" height="17" rx="8.5" fill={color} opacity=".65" />
      <rect x="104" y="20" width="38" height="14" rx="7" fill={color} opacity=".12" />
      <rect className="hp-detail hp-chat" style={{ animationDelay: '-1.8s' }} x="36" y="78" width="61" height="17" rx="8.5" fill={color} opacity=".4" />
      <rect x="120" y="76" width="36" height="12" rx="6" fill={color} opacity=".15" />
      <rect x="94" y="57" width="27" height="23" rx="4" fill="none" stroke={color} strokeWidth="3" />
      <path d="M100 57v-7a7.5 7.5 0 0 1 15 0v7" fill="none" stroke={color} strokeWidth="3" /><circle cx="107.5" cy="67" r="2" fill={color} />
    </>}
    {kind === 'rewards' && <>
      <circle cx="100" cy="58" r="36" fill={color} opacity=".1" />
      <g className="hp-detail hp-coin"><circle cx="100" cy="58" r="27" fill={color} /><circle cx="100" cy="58" r="20" fill="none" stroke="white" opacity=".45" /><path d="m100 44 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="white" /></g>
      <path className="hp-detail hp-spark" d="M147 32v10M142 37h10M54 78v8M50 82h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </>}
  </svg>;
}
