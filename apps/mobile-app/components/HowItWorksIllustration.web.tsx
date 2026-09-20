import React from 'react';
export type HowItWorksCardId = 'scan' | 'allies' | 'meet' | 'rewards';
/** Each web scene tells the card's story with interacting objects. The native
 * counterpart keeps the same meaning with lightweight static vectors. */
export default function HowItWorksIllustration({ kind, color, animated = false }: { kind: HowItWorksCardId; color: string; animated?: boolean }) {
  return <svg width="200" height="116" viewBox="0 0 200 116" aria-hidden="true" className={animated ? 'hp-illustration hp-illustration-active' : 'hp-illustration'} style={{ color }}>
    <style>{`
      .hp-illustration .hp-detail{transform-box:fill-box;transform-origin:center}
      .hp-illustration-active .hp-scan-beam{animation:hp-scan-beam 2.8s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-scan-cell{animation:hp-scan-cell 2.8s ease-out infinite}
      .hp-illustration-active .hp-scan-check{animation:hp-confirm 2.8s ease-out infinite}
      .hp-illustration-active .hp-node{animation:hp-node 3s ease-in-out infinite}
      .hp-illustration-active .hp-packet{animation:hp-packet 3s cubic-bezier(.4,0,.2,1) infinite}
      .hp-illustration-active .hp-chat-left{animation:hp-chat-left 3.6s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-chat-right{animation:hp-chat-right 3.6s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-lock{animation:hp-lock 3.6s ease-in-out infinite}
      .hp-illustration-active .hp-reward-five{animation:hp-reward-five 4.2s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-reward-ten{animation:hp-reward-ten 4.2s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-diamond{animation:hp-diamond 4.2s ease-in-out infinite}
      .hp-illustration-active .hp-lks{animation:hp-lks 4.2s ease-out infinite}
      @keyframes hp-scan-beam{0%,100%{transform:translateY(-23px);opacity:.2}45%,55%{opacity:1}75%{transform:translateY(23px);opacity:.8}}
      @keyframes hp-scan-cell{0%,24%{opacity:.3}42%,78%{opacity:1}100%{opacity:.3}}
      @keyframes hp-confirm{0%,58%{transform:scale(.7);opacity:0}72%,88%{transform:scale(1);opacity:1}100%{opacity:0}}
      @keyframes hp-node{0%,100%{transform:scale(.94);opacity:.68}50%{transform:scale(1.08);opacity:1}}
      @keyframes hp-packet{0%{transform:translateX(0);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateX(114px);opacity:0}}
      @keyframes hp-chat-left{0%,100%{transform:translateX(-5px);opacity:.32}18%,45%{transform:translateX(5px);opacity:.85}62%{opacity:.35}}
      @keyframes hp-chat-right{0%,42%{transform:translateX(5px);opacity:.22}60%,86%{transform:translateX(-5px);opacity:.72}100%{opacity:.22}}
      @keyframes hp-lock{0%,100%{transform:scale(.94);opacity:.72}50%{transform:scale(1.04);opacity:1}}
      @keyframes hp-reward-five{0%,100%{transform:translate(-8px,7px);opacity:0}16%,43%{transform:translate(0,0);opacity:1}62%{opacity:0}}
      @keyframes hp-reward-ten{0%,38%{transform:translate(8px,7px);opacity:0}56%,84%{transform:translate(0,0);opacity:1}100%{opacity:0}}
      @keyframes hp-diamond{0%,100%{transform:translateY(2px) scale(.96)}50%{transform:translateY(-3px) scale(1.04)}}
      @keyframes hp-lks{0%,12%,100%{opacity:.52}28%,86%{opacity:1}}
      @media(prefers-reduced-motion:reduce){.hp-illustration-active .hp-detail{animation:none!important}}
    `}</style>
    {kind === 'scan' && <>
      <rect x="64" y="22" width="72" height="72" rx="20" fill={color} opacity=".08" />
      <path d="M77 44V35h12M111 35h12v9M123 72v9h-12M89 81H77v-9" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path className="hp-detail hp-scan-cell" d="M87 46h9v9h-9zM104 46h9v9h-9zM87 63h9v9h-9zM104 63h4v4h-4zM112 68h3v4h-3z" fill={color} />
      <g className="hp-detail hp-scan-beam"><rect x="52" y="56" width="96" height="6" rx="3" fill={color} opacity=".12" /><path d="M52 59h96" stroke={color} strokeWidth="2" /></g>
      <g className="hp-detail hp-scan-check"><circle cx="132" cy="83" r="11" fill={color}/><path d="m127 83 3 3 6-7" stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
    </>}
    {kind === 'allies' && <>
      <path d="M42 58h116" stroke={color} strokeWidth="1.5" opacity=".25" />
      <circle cx="100" cy="58" r="31" fill={color} opacity=".07" />
      <circle className="hp-detail hp-node" cx="40" cy="58" r="12" fill={color} />
      <g className="hp-detail hp-node" style={{ animationDelay: '-.8s' }}><circle cx="100" cy="58" r="18" fill={color} /><circle cx="100" cy="58" r="6" fill="white" opacity=".85" /></g>
      <circle className="hp-detail hp-node" style={{ animationDelay: '-1.6s' }} cx="160" cy="58" r="10" fill={color} />
      <circle className="hp-detail hp-packet" cx="43" cy="58" r="4" fill="white" stroke={color} strokeWidth="2" />
    </>}
    {kind === 'meet' && <>
      <g className="hp-detail hp-chat-left"><rect x="34" y="31" width="57" height="18" rx="9" fill={color} opacity=".72"/><circle cx="48" cy="40" r="2" fill="white"/><circle cx="57" cy="40" r="2" fill="white"/><circle cx="66" cy="40" r="2" fill="white"/></g>
      <g className="hp-detail hp-chat-right"><rect x="111" y="72" width="55" height="18" rx="9" fill={color} opacity=".38"/><path d="M126 81h25" stroke={color} strokeWidth="2" strokeLinecap="round"/></g>
      <g className="hp-detail hp-lock"><rect x="87" y="49" width="27" height="23" rx="4" fill="none" stroke={color} strokeWidth="3"/><path d="M93 49v-7a7.5 7.5 0 0 1 15 0v7" fill="none" stroke={color} strokeWidth="3"/><circle cx="100.5" cy="59" r="2" fill={color}/></g>
    </>}
    {kind === 'rewards' && <>
      <ellipse cx="100" cy="61" rx="42" ry="38" fill={color} opacity=".09" />
      <g className="hp-detail hp-diamond"><path d="M100 30 125 51 100 87 75 51Z" fill={color}/><path d="m75 51 25 36 25-36-14 8-11-29-11 29Z" fill="white" opacity=".2"/><path d="m75 51 14 8 11-29 11 29 14-8" fill="none" stroke="white" strokeWidth="1.5" opacity=".62"/></g>
      <g className="hp-detail hp-reward-five"><rect x="36" y="26" width="38" height="22" rx="11" fill={color}/><text x="55" y="41" fill="white" fontSize="12" fontWeight="700" textAnchor="middle">+5</text></g>
      <g className="hp-detail hp-reward-ten"><rect x="127" y="70" width="42" height="22" rx="11" fill={color}/><text x="148" y="85" fill="white" fontSize="12" fontWeight="700" textAnchor="middle">+10</text></g>
      <text className="hp-detail hp-lks" x="100" y="108" fill={color} fontSize="12" fontWeight="800" letterSpacing="1.4" textAnchor="middle">$LKS</text>
    </>}
  </svg>;
}
