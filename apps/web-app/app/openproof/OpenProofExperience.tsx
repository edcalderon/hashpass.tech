'use client';
import {useEffect, useRef, useState} from 'react';
import {openProofContent as c} from '@hashpass/config/openproof';
import {useTranslation, useLocale, useSetLocale, useAvailableLocales} from '@hashpass/i18n';
import type {SupportedLocale} from '@hashpass/i18n';
import {useTheme} from '../components/ThemeProvider';
import styles from './openproof.module.css';

// Hosted on the production event-media S3 bucket (same bucket/prefix pattern
// as the Chile 2026 speaker photos — see apps/mobile-app/lib/demo-chapters.ts)
// rather than shipped from apps/web-app/public: the rendered .mp4 is
// gitignored (binary exports don't go through this repo's review system —
// see artifacts/openproof/README.md), so a path under /public would 404 on
// every real deploy, which is exactly what shipped before this was caught in
// production. S3 supports HTTP Range requests natively, so seeking works.
const MEDIA_BASE='https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/openproof';

export function OpenProofExperience(){
  const {t}=useTranslation('openproof');
  const {resolvedTheme}=useTheme();
  const [query,setQuery]=useState(0);
  const queryPaused=useRef(false);
  // Auto-advances through the query tabs on a loop, forever (a single
  // interval, not a self-rescheduling timeout keyed on `query` — that would
  // go permanently silent the first time a tick was skipped while paused).
  // Pauses while the pointer is over the explorer so reading a result isn't
  // interrupted; a manual click just changes `query` directly and the loop
  // continues from there on its next tick.
  useEffect(()=>{
    const id=setInterval(()=>{if(!queryPaused.current)setQuery(q=>(q+1)%c.queries.length)},4500);
    return ()=>clearInterval(id);
  },[]);
  // Entity/attribute/query strings stay untranslated on purpose: they are Arkiv
  // schema identifiers shared with the Remotion video through @hashpass/config,
  // not display copy.
  const flow=[[t('flow1'),t('flow1Sub')],[t('flow2'),t('flow2Sub')],[t('flow3'),t('flow3Sub')],[t('flow4'),t('flow4Sub')],[t('flow5'),t('flow5Sub')],[t('flow6'),t('flow6Sub')],[t('flow7'),t('flow7Sub')]];
  const publicData=[t('publicData1'),t('publicData2'),t('publicData3'),t('publicData4'),t('publicData5'),t('publicData6')];
  const privateData=[t('privateData1'),t('privateData2'),t('privateData3'),t('privateData4'),t('privateData5'),t('privateData6'),t('privateData7'),t('privateData8'),t('privateData9')];
  return <main className={styles.page}>
  <nav className={styles.nav}><img src={resolvedTheme==='light'?'/logo-full-hashpass-black-cyan.svg':'/logo-full-hashpass-white-cyan.svg'} alt="HashPass"/><span className={styles.navLabel}>OpenProof <ArkivBadge/></span><a href="#model">{t('dataModelLink')}</a><Controls/></nav>
  <section className={`${styles.hero} ${styles.wrap}`}><div><p className={styles.eyebrow}>{t('heroEyebrow')}</p><h1>{t('heroTitleBefore')}<em>{t('heroTitleEm')}</em>{t('heroTitleAfter')}</h1><p className={styles.lead}>{t('heroLead')}</p><div className={styles.actions}><a href="#model">{t('heroCtaModel')}</a><a href="#walkthrough">{t('heroCtaVideo')}</a></div><small>{t('heroDisclaimer')}</small></div><Passport t={t}/></section>
  <Section eyebrow={t('problemEyebrow')} title={t('problemTitle')}><div className={styles.three}>{[t('problem1'),t('problem2'),t('problem3')].map((x,i)=><article className={styles.card} key={x}><span>0{i+1}</span><h3>{x}</h3><p>{t('problemCaption')} <b>×</b> {t('problemCaptionAfter')}</p></article>)}</div></Section>
  <Section eyebrow={t('solutionEyebrow')} title={t('solutionTitle')}><Diagram flow={flow} t={t}/></Section>
  <Section id="model" eyebrow={t('modelEyebrow')} title={t('modelTitle')}><p className={styles.intro}>{t('modelIntro')}</p><div className={styles.entities}>{c.entities.map(e=><details className={`${styles.entity} ${styles[e.tone]}`} key={e.name}><summary><span>{e.name}</span><i>+</i></summary><div className={styles.entityBody}><div><p>{e.detail}</p><div className={styles.entityAttrs}>{e.attributes.map(a=><code key={a}>{a}</code>)}</div></div></div></details>)}</div></Section>
  <Section eyebrow={t('queryEyebrow')} title={t('queryTitle')}><div className={styles.explorer} onPointerEnter={()=>{queryPaused.current=true}} onPointerLeave={()=>{queryPaused.current=false}}><div className={styles.queryTabs}>{c.queries.map((q,i)=><button aria-pressed={i===query} onClick={()=>setQuery(i)} key={q.label}><span>0{i+1}</span>{q.label}</button>)}</div><div className={styles.results}><p>{t('queryFilterLabel')}</p><code>{c.queries[query].filter}</code><div className={styles.resultList}>{c.queries[query].rows.map(r=><div key={r[0]}><span>{r[0]}</span><b>{r[1]}</b></div>)}</div><small>{t('queryNote')}</small></div></div></Section>
  <Section eyebrow={t('lifecycleEyebrow')} title={t('lifecycleTitle')}><div className={styles.timeline}>{[t('lifecycle1'),t('lifecycle2'),t('lifecycle3'),t('lifecycle4'),t('lifecycle5')].map((x,i)=><div key={x}><span>{i+1}</span><b>{x}</b></div>)}</div><div className={styles.ownership}><p><code>$creator</code> {t('ownershipCreator')}</p><p><code>$owner</code> {t('ownershipOwner')}</p><p>{t('ownershipDuration',{years:String(c.lifetimes.claimYears)})}</p></div></Section>
  <Section eyebrow={t('privacyEyebrow')} title={t('privacyTitle')}><div className={styles.privacy}><List title={t('privacyPublicTitle')} items={publicData}/><List title={t('privacyPrivateTitle')} items={privateData}/></div></Section>
  <Section eyebrow={t('counterfactualEyebrow')} title={t('counterfactualTitle')}><div className={styles.four}>{[[t('cf1Title'),t('cf1Body')],[t('cf2Title'),t('cf2Body')],[t('cf3Title'),t('cf3Body')],[t('cf4Title'),t('cf4Body')]].map(x=><article className={styles.card} key={x[0]}><h3>{x[0]}</h3><p>{x[1]}</p></article>)}</div><blockquote>{t('counterfactualQuote')}</blockquote></Section>
  <section id="walkthrough" className={`${styles.final} ${styles.wrap}`}><p className={styles.eyebrow}>{t('finalEyebrow')}</p><h2>{t('finalTitle')}</h2><p>{t('finalLead')}</p><video className={styles.walkthroughVideo} controls preload="metadata" poster={`${MEDIA_BASE}/openproof-thumbnail.png`}><source src={`${MEDIA_BASE}/openproof-walkthrough.mp4`} type="video/mp4"/></video><div className={styles.actions}><a href="#model">{t('finalCtaModel')}</a><a href="/">{t('finalCtaExplore')}</a></div><small>{t('finalDisclaimer')}</small></section>
 </main>}
type T=(key:string,params?:Record<string,string>)=>string;
function Section({eyebrow,title,children,id}:{eyebrow:string,title:string,children:React.ReactNode,id?:string}){return <section id={id} className={`${styles.section} ${styles.wrap}`}><p className={styles.eyebrow}>{eyebrow}</p><h2>{title}</h2>{children}</section>}
function Passport({t}:{t:T}){return <article className={styles.passport}><header><span>OPENPROOF / PASSPORT</span><b>● VERIFIED</b></header><h2>wallet:demo-ana</h2><p>{t('passportOwned')}</p>{['Sample Conference Chile 2026','Sample Summit Colombia 2026','Community Builders Meetup'].map((x,i)=><div className={styles.credential} key={x}><i>{i+1}</i><span><b>{x}</b><small>{t('passportIssuedBy')}</small></span><strong>{i===2?t('passportExpirySoon'):t('passportYears')}</strong></div>)}</article>}
function Diagram({flow,t}:{flow:string[][],t:T}){return <div className={styles.diagram} role="img" aria-label={t('solutionTitle')}>{flow.map((n,i)=><div className={styles.node} tabIndex={0} key={n[0]}><span>{String(i+1).padStart(2,'0')}</span><b>{n[0]}</b><small>{n[1]}</small><aside>Entity: {i<3?'CheckInReceipt':'AttendanceClaim'}<br/>{t('diagramCreator')}<br/>{t('diagramOwner')}<br/>Query: eventId = “{c.eventId}”</aside></div>)}</div>}
function List({title,items}:{title:string,items:string[]}){return <article><h3>{title}</h3>{items.map(x=><p key={x}>✓ {x}</p>)}</article>}
function ArkivBadge(){return <span className={styles.arkivBadge}><span className={styles.arkivBracket}>[</span><b>ARKIV</b><span className={styles.arkivBracket}>]</span></span>}
// Mirrors the landing page Navbar's language picker + theme toggle pills so the
// two pages present the same controls in the same visual language.
function Controls(){
  const {resolvedTheme,setTheme}=useTheme();
  const locale=useLocale();
  const setLocale=useSetLocale();
  const availableLocales=useAvailableLocales();
  const [langOpen,setLangOpen]=useState(false);
  const isDark=resolvedTheme==='dark';
  return <div className={styles.controls}>
    <div className={styles.langWrap}>
      <button className={styles.pill} onClick={()=>setLangOpen(v=>!v)} aria-label="Select language" aria-expanded={langOpen}>
        <span className={styles.pillCode}>{locale.toUpperCase()}</span>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {langOpen&&<>
        <div className={styles.langScrim} onClick={()=>setLangOpen(false)}/>
        <div className={styles.langMenu}>
          {availableLocales.map(loc=>{const active=locale===loc.code;return <button key={loc.code} className={active?`${styles.langItem} ${styles.langItemActive}`:styles.langItem} onClick={()=>{setLocale(loc.code as SupportedLocale);setLangOpen(false);}}>
            <span>{loc.nativeName}</span><span className={styles.langCode}>{loc.code.toUpperCase()}</span>
          </button>})}
        </div>
      </>}
    </div>
    <button className={`${styles.pill} ${styles.themePill}`} onClick={()=>setTheme(isDark?'light':'dark')} aria-label="Toggle theme" title={isDark?'Switch to light':'Switch to dark'}>
      {isDark
        ?<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        :<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
    </button>
  </div>
}
