import React from 'react';

export type HowItWorksCardId = 'scan' | 'allies' | 'meet' | 'rewards';
export type HowItWorksSceneLabels = {
  eventPass: string; eventExplorer: string; agenda: string; speakers: string;
  findAttendees: string; meet: string; lksWallet: string; availableBalance: string;
};
const defaultLabels: HowItWorksSceneLabels = {
  eventPass: 'EVENT PASS', eventExplorer: 'EVENT EXPLORER', agenda: 'AGENDA', speakers: 'SPEAKERS',
  findAttendees: 'FIND ATTENDEES', meet: 'MEET', lksWallet: '$LKS WALLET', availableBalance: 'AVAILABLE BALANCE',
};

/**
 * Small product scenes rather than decorative icons. Every scene keeps the card
 * surface plain and lets only real HASHPASS UI elements carry the accent color.
 */
export default function HowItWorksIllustration({ kind, color, animated = false, labels = defaultLabels }: { kind: HowItWorksCardId; color: string; animated?: boolean; labels?: HowItWorksSceneLabels }) {
  return <svg width="220" height="116" viewBox="0 0 220 116" aria-hidden="true" className={animated ? 'hp-illustration hp-illustration-active' : 'hp-illustration'} style={{ color }}>
    <style>{`
      .hp-illustration .hp-detail{transform-box:fill-box;transform-origin:center}
      .hp-illustration .hp-ui-frame{fill:none;stroke:currentColor;stroke-width:1.25;opacity:.24}
      .hp-illustration .hp-ui-copy{fill:currentColor;opacity:.58;font-family:ui-sans-serif,system-ui,sans-serif;font-size:6px;font-weight:700;letter-spacing:.7px}
      .hp-illustration-active .hp-scan-beam{animation:hp-scan-beam 2.9s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-scan-cell{animation:hp-scan-cell 2.9s ease-out infinite}
      .hp-illustration-active .hp-scan-check{animation:hp-confirm 2.9s ease-out infinite}
      .hp-illustration-active .hp-scan-symbol{animation:hp-symbol-pulse 2.9s ease-in-out infinite}
      .hp-illustration-active .hp-node{animation:hp-node 3.4s ease-in-out infinite}
      .hp-illustration-active .hp-packet{animation:hp-packet 3.4s cubic-bezier(.4,0,.2,1) infinite}
      .hp-illustration-active .hp-agenda{animation:hp-agenda 3.4s ease-in-out infinite}
      .hp-illustration-active .hp-speaker{animation:hp-speaker 3.4s ease-out infinite}
      .hp-illustration-active .hp-allies-symbol{animation:hp-symbol-orbit 3.4s ease-in-out infinite}
      .hp-illustration-active .hp-search-cursor{animation:hp-search-cursor 2.8s steps(2,end) infinite}
      .hp-illustration-active .hp-chat-left{animation:hp-chat-left 3.6s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-chat-right{animation:hp-chat-right 3.6s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-meet-result{animation:hp-meet-result 3.6s ease-out infinite}
      .hp-illustration-active .hp-meet-symbol{animation:hp-symbol-pulse 3.6s ease-in-out infinite}
      .hp-illustration-active .hp-reward-five{animation:hp-reward-five 4.2s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-reward-ten{animation:hp-reward-ten 4.2s cubic-bezier(.16,1,.3,1) infinite}
      .hp-illustration-active .hp-diamond{animation:hp-diamond 4.2s ease-in-out infinite}
      .hp-illustration-active .hp-lks{animation:hp-lks 4.2s ease-out infinite}
      .hp-illustration-active .hp-wallet-symbol{animation:hp-symbol-pulse 4.2s ease-in-out infinite}
      .hp-illustration-active .hp-chain-eth{animation:hp-chain-eth 4.2s ease-in-out infinite}
      .hp-illustration-active .hp-chain-sol{animation:hp-chain-sol 4.2s ease-in-out infinite}
      .hp-illustration-active .hp-chain-btc{animation:hp-chain-btc 4.2s ease-in-out infinite}
      @keyframes hp-scan-beam{0%,100%{transform:translateY(-18px);opacity:.14}45%,55%{opacity:1}75%{transform:translateY(18px);opacity:.82}}
      @keyframes hp-scan-cell{0%,24%{opacity:.28}42%,78%{opacity:1}100%{opacity:.28}}
      @keyframes hp-confirm{0%,58%{transform:scale(.7);opacity:0}72%,88%{transform:scale(1);opacity:1}100%{opacity:0}}
      @keyframes hp-symbol-pulse{0%,100%{transform:scale(.9);opacity:.42}50%{transform:scale(1.08);opacity:1}}
      @keyframes hp-symbol-orbit{0%,100%{transform:rotate(0deg);opacity:.46}50%{transform:rotate(18deg);opacity:1}}
      @keyframes hp-node{0%,100%{transform:scale(.92);opacity:.58}50%{transform:scale(1.08);opacity:1}}
      @keyframes hp-packet{0%{transform:translateX(0);opacity:0}12%{opacity:1}82%{opacity:1}100%{transform:translateX(72px);opacity:0}}
      @keyframes hp-agenda{0%,100%{transform:scaleX(.4);transform-origin:left;opacity:.35}46%,72%{transform:scaleX(1);opacity:1}}
      @keyframes hp-speaker{0%,32%{transform:translateY(4px);opacity:.2}50%,82%{transform:translateY(0);opacity:1}100%{opacity:.2}}
      @keyframes hp-search-cursor{0%,42%{opacity:0}43%,72%{opacity:1}73%,100%{opacity:0}}
      @keyframes hp-chat-left{0%,100%{transform:translateX(-5px);opacity:.22}18%,45%{transform:translateX(2px);opacity:.9}62%{opacity:.28}}
      @keyframes hp-chat-right{0%,42%{transform:translateX(5px);opacity:.18}60%,86%{transform:translateX(-2px);opacity:.78}100%{opacity:.18}}
      @keyframes hp-meet-result{0%,18%{transform:translateY(4px);opacity:.25}34%,76%{transform:translateY(0);opacity:1}100%{opacity:.25}}
      @keyframes hp-reward-five{0%,100%{transform:translate(-8px,7px);opacity:0}16%,43%{transform:translate(0,0);opacity:1}62%{opacity:0}}
      @keyframes hp-reward-ten{0%,38%{transform:translate(8px,7px);opacity:0}56%,84%{transform:translate(0,0);opacity:1}100%{opacity:0}}
      @keyframes hp-diamond{0%,100%{transform:translateY(2px) scale(.96)}50%{transform:translateY(-3px) scale(1.04)}}
      @keyframes hp-lks{0%,12%,100%{opacity:.52}28%,86%{opacity:1}}
      @keyframes hp-chain-eth{0%,100%{transform:translateY(2px);opacity:.45}42%,72%{transform:translateY(-3px);opacity:1}}
      @keyframes hp-chain-sol{0%,22%,100%{transform:translateX(-2px);opacity:.34}42%,76%{transform:translateX(2px);opacity:1}}
      @keyframes hp-chain-btc{0%,48%,100%{transform:scale(.9);opacity:.3}62%,84%{transform:scale(1);opacity:1}}
      @media(prefers-reduced-motion:reduce){.hp-illustration-active .hp-detail{animation:none!important}}
    `}</style>
    {kind === 'scan' && <>
      <g className="hp-detail hp-scan-symbol"><circle cx="31" cy="58" r="15" fill="none" stroke={color} strokeWidth="1.5" opacity=".42"/><path d="M23 54v-5h5m6 0h5v5m0 8v5h-5m-6 0h-5v-5" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round"/></g>
      <rect className="hp-ui-frame" x="53" y="18" width="114" height="80" rx="14" />
      <text className="hp-ui-copy" x="68" y="33">{labels.eventPass}</text><path d="M68 39h28" stroke={color} strokeWidth="2" opacity=".2" strokeLinecap="round" />
      <path d="M78 57V48h12M132 48h12v9M144 76v9h-12M90 85H78v-9" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path className="hp-detail hp-scan-cell" d="M89 59h9v9h-9zM106 59h9v9h-9zM89 76h9v9h-9zM106 76h4v4h-4zM114 81h3v4h-3z" fill={color} />
      <g className="hp-detail hp-scan-beam"><rect x="69" y="69" width="84" height="6" rx="3" fill={color} opacity=".12" /><path d="M69 72h84" stroke={color} strokeWidth="2" /></g>
      <g className="hp-detail hp-scan-check"><circle cx="153" cy="86" r="10" fill={color}/><path d="m148 86 3 3 6-7" stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
    </>}
    {kind === 'allies' && <>
      <g className="hp-detail hp-allies-symbol"><circle cx="188" cy="17" r="4" fill={color}/><circle cx="199" cy="24" r="4" fill={color} opacity=".65"/><circle cx="187" cy="30" r="4" fill={color} opacity=".4"/><path d="m191 19 5 3m-7 5 6-2" stroke={color} strokeWidth="1.25" opacity=".62"/></g>
      <rect className="hp-ui-frame" x="37" y="23" width="146" height="70" rx="14" />
      <text className="hp-ui-copy" x="52" y="39">{labels.eventExplorer}</text>
      <text className="hp-ui-copy" x="53" y="54" opacity=".48">{labels.agenda}</text><text className="hp-ui-copy" x="101" y="54" opacity=".48">{labels.speakers}</text>
      <path className="hp-detail hp-agenda" d="M52 59h33" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <g className="hp-detail hp-node"><circle cx="63" cy="76" r="9" fill={color} opacity=".88"/><circle cx="63" cy="73" r="3" fill="white" opacity=".78"/></g>
      <g className="hp-detail hp-speaker"><circle cx="102" cy="76" r="9" fill={color} opacity=".68"/><circle cx="102" cy="73" r="3" fill="white" opacity=".78"/></g>
      <g className="hp-detail hp-node" style={{ animationDelay: '-1.2s' }}><circle cx="141" cy="76" r="9" fill={color} opacity=".48"/><circle cx="141" cy="73" r="3" fill="white" opacity=".78"/></g>
      <path d="M72 76h60" stroke={color} strokeWidth="1.25" opacity=".25" />
      <circle className="hp-detail hp-packet" cx="72" cy="76" r="3.5" fill="white" stroke={color} strokeWidth="1.75" />
      <path d="m164 75 4 4-4 4" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".7"/>
    </>}
    {kind === 'meet' && <>
      <g className="hp-detail hp-meet-symbol"><path d="M191 19h18a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5h-9l-5 5v-5h-4a5 5 0 0 1-5-5v-9a5 5 0 0 1 5-5Z" fill="none" stroke={color} strokeWidth="1.5" opacity=".76"/><circle cx="197" cy="28.5" r="1.3" fill={color}/><circle cx="202" cy="28.5" r="1.3" fill={color}/><circle cx="207" cy="28.5" r="1.3" fill={color}/></g>
      <rect className="hp-ui-frame" x="36" y="21" width="148" height="74" rx="14" />
      <rect x="51" y="34" width="118" height="18" rx="9" fill="none" stroke={color} strokeWidth="1.4" opacity=".42" />
      <circle cx="63" cy="43" r="3.6" fill="none" stroke={color} strokeWidth="1.5" opacity=".8"/><path d="m66 46 3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".8"/>
      <text className="hp-ui-copy" x="76" y="45.5">{labels.findAttendees}</text><path className="hp-detail hp-search-cursor" d="M148 39v8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <g className="hp-detail hp-meet-result"><circle cx="62" cy="70" r="8" fill={color} opacity=".78"/><path d="M74 67h35M74 73h22" stroke={color} strokeWidth="2" strokeLinecap="round" opacity=".34"/><rect x="137" y="63" width="23" height="14" rx="7" fill={color}/><text x="148.5" y="72.5" fill="white" fontSize="5.5" fontWeight="800" textAnchor="middle">{labels.meet}</text></g>
      <g className="hp-detail hp-chat-left"><rect x="85" y="82" width="24" height="8" rx="4" fill={color} opacity=".7"/></g>
      <g className="hp-detail hp-chat-right"><rect x="115" y="82" width="19" height="8" rx="4" fill={color} opacity=".34"/></g>
    </>}
    {kind === 'rewards' && <>
      <g className="hp-detail hp-wallet-symbol"><circle cx="30" cy="30" r="15" fill="none" stroke={color} strokeWidth="1.5" opacity=".42"/><path d="m30 18 8 12-8 12-8-12Z" fill={color} opacity=".82"/><path d="m22 30 8 12 8-12" fill="none" stroke="white" strokeWidth="1.1" opacity=".75"/></g>
      <g className="hp-detail hp-chain-eth"><path d="m190 8 8 14-8 5-8-5Z" fill="#627EEA"/><path d="m190 29 8-5-8 10-8-10Z" fill="#627EEA" opacity=".72"/></g>
      <g className="hp-detail hp-chain-sol"><path d="m181 45 18 0 4 4-18 0Z" fill="#14F195"/><path d="m181 53 18 0 4 4-18 0Z" fill="#9945FF"/><path d="m181 61 18 0 4 4-18 0Z" fill="#14F195"/></g>
      <g className="hp-detail hp-chain-btc"><circle cx="190" cy="86" r="12" fill="#F7931A"/><text x="190" y="90" fill="white" fontSize="14" fontWeight="800" textAnchor="middle">B</text><path d="M187 78v16m4-16v16" stroke="white" strokeWidth="1.15" opacity=".85"/></g>
      <rect className="hp-ui-frame" x="48" y="18" width="124" height="80" rx="14" />
      <text className="hp-ui-copy" x="63" y="35">{labels.lksWallet}</text><text className="hp-ui-copy" x="63" y="46" opacity=".42">{labels.availableBalance}</text>
      <g className="hp-detail hp-diamond"><path d="M104 43 121 57 104 82 87 57Z" fill={color}/><path d="m87 57 9 6 8-20 8 20 9-6" fill="none" stroke="white" strokeWidth="1.25" opacity=".7"/></g>
      <text className="hp-detail hp-lks" x="104" y="94" fill={color} fontSize="10" fontWeight="800" letterSpacing="1.1" textAnchor="middle">$LKS</text>
      <g className="hp-detail hp-reward-five"><rect x="57" y="63" width="31" height="18" rx="9" fill={color}/><text x="72.5" y="75.3" fill="white" fontSize="10" fontWeight="700" textAnchor="middle">+5</text></g>
      <g className="hp-detail hp-reward-ten"><rect x="132" y="56" width="35" height="18" rx="9" fill={color}/><text x="149.5" y="68.3" fill="white" fontSize="10" fontWeight="700" textAnchor="middle">+10</text></g>
    </>}
  </svg>;
}
