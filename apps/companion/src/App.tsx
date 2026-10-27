import { Suspense, lazy, useState } from 'react';
import { Icon, PixelWord, Sprite, Stars, useInView, useReveal } from './Pixel';
import { capabilities, houseRules, proposedGuestTurns, stageKeys } from './content';
import { BUILD_INFO, CURRENT_VERSION, getCompanionVersionLabel } from './config/version';
import { CompanionSettings } from './settings/CompanionSettings';
import { useSettings } from './settings/SettingsContext';
import type { CapabilityValue, DemoAction, IconKey, PetMood } from './types';

const QuestGame = lazy(() => import('./game/QuestGame').then((m) => ({ default: m.QuestGame })));
const IntroFilm = lazy(() => import('./film/IntroFilm').then((m) => ({ default: m.IntroFilm })));

const stageOrder = stageKeys;
const demoIcons: Record<string, IconKey> = { ask: 'book', ics: 'download', chat: 'chat' };
const stageIcons: IconKey[] = ['star', 'book', 'calendar'];

const demoActions: DemoAction[] = [
  { id: 'ask', unlocks: 'curious', mood: 'think' },
  { id: 'ics', unlocks: 'helpful', mood: 'cheer' },
  { id: 'chat', unlocks: null, mood: 'hi' },
];

function Hero() {
  const { t } = useSettings();
  const [ref, inView] = useInView<HTMLElement>();
  const [mode, setMode] = useState<'none' | 'quest' | 'film'>('none');
  return (
    <header className="hero" ref={ref} data-paused={inView ? 'false' : 'true'}>
      <Stars />
      <div className="cloud cloud--a" aria-hidden="true"><Sprite name="cloud" /></div>
      <div className="cloud cloud--b" aria-hidden="true"><Sprite name="cloud" /></div>
      <div className="hero__bar">
        <CompanionSettings />
      </div>
      <div className="wrap hero__inner">
        <p className="tag">
          <span className="tag__dot" aria-hidden="true" /> {t('hero.tag')}
        </p>
        <h1 className="hero__title">
          <span className="sr">HASHPASS Companion</span>
          <span className="hero__brand" aria-hidden="true">HASHPASS</span>
          <PixelWord className="hero__word" text="COMPANION" />
        </h1>
        <p className="hero__lede">{t('hero.lede')}</p>
        <ul className="perks" aria-label={t('hero.perks')}>
          <li><Icon name="chat" /> {t('hero.ask')}</li>
          <li><Icon name="calendar" /> {t('hero.plan')}</li>
          <li><Icon name="star" /> {t('hero.grow')}</li>
        </ul>
        <div className="hero__cta">
          <button type="button" className="btn btn--play" onClick={() => setMode('quest')}>
            <span className="btn__tri" aria-hidden="true" /> {t('hero.play')}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setMode('film')}>
            <Icon name="book" /> {t('hero.film')}
          </button>
          <a className="btn btn--ghost" href="#grow">{t('hero.meet')}</a>
          <a className="btn btn--ghost" href="#start">{t('hero.guests')}</a>
        </div>
        <div className="hero__stage">
          <div className="bubble" role="presentation" aria-hidden="true">{t('hero.bubble')}</div>
          <Sprite name="hatchling" className="pet pet--hero" />
          <div className="ground" aria-hidden="true" />
        </div>
      </div>
      {mode === 'quest' && (
        <Suspense fallback={<p className="quest-loading" role="status">{t('hero.loading')}</p>}>
          <QuestGame onClose={() => setMode('none')} />
        </Suspense>
      )}
      {mode === 'film' && (
        <Suspense fallback={<p className="quest-loading" role="status">{t('hero.loading')}</p>}>
          <IntroFilm onClose={() => setMode('none')} onStartQuest={() => setMode('quest')} />
        </Suspense>
      )}
    </header>
  );
}

function Evolution() {
  const { t } = useSettings();
  const [reached, setReached] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [mood, setMood] = useState<PetMood>('idle');
  const currentKey = stageKeys[reached];

  const perform = (action: DemoAction) => {
    const target = action.unlocks ? stageOrder.indexOf(action.unlocks) : -1;
    if (target > reached) setReached(target);
    setMood(action.mood);
    setSaid(t(`demo.${action.id}.reply`));
  };

  return (
    <section className="section" id="grow" aria-labelledby="grow-title">
      <div className="wrap">
        <p className="eyebrow">{t('evo.eyebrow')}</p>
        <h2 id="grow-title" className="h2">{t('evo.title')}</h2>
        <p className="lead">{t('evo.lead')}</p>

        <ol className="stages">
          {stageKeys.map((key, i) => (
            <li key={key} className={`card stage${i <= reached ? ' stage--on' : ''}`} aria-current={i === reached ? 'step' : undefined}>
              <div className="stage__art" data-stage={key}>
                <Sprite name={key} className="pet pet--card" />
              </div>
              <p className="stage__num"><Icon name={stageIcons[i]} /> {t('stage.label', { n: i + 1 })}</p>
              <h3 className="h3">{t(`stage.${key}.name`)}</h3>
              <p className="stage__trigger">{t(`stage.${key}.trigger`)}</p>
              <p className="muted">{t(`stage.${key}.note`)}</p>
            </li>
          ))}
        </ol>

        <div className="card demo" aria-labelledby="demo-title">
          <div className="demo__pet" data-mood={mood}>
            <Sprite name={currentKey} className="pet pet--demo" />
            <p className="demo__name">{t(`stage.${currentKey}.name`)}</p>
          </div>
          <div className="demo__body">
            <h3 id="demo-title" className="h3">{t('demo.title')}</h3>
            <p className="demo__say" role="status" aria-live="polite">{said ?? t('demo.initial')}</p>
            <div className="demo__actions">
              {demoActions.map((a) => (
                <button key={a.id} type="button" className="btn btn--tint" onClick={() => perform(a)}>
                  <Icon name={demoIcons[a.id]} /> {t(`demo.${a.id}.label`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="link"
              onClick={() => {
                setReached(0);
                setMood('idle');
                setSaid(t('demo.resetSay'));
              }}
            >
              {t('demo.reset')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function GuestStart() {
  const { t } = useSettings();
  const reveal = useReveal<HTMLDivElement>();
  return (
    <section className="section section--dark" id="start" aria-labelledby="start-title">
      <div className="wrap split" ref={reveal}>
        <div>
          <p className="eyebrow">{t('guest.eyebrow')}</p>
          <h2 id="start-title" className="h2">{t('guest.title')}</h2>
          <ul className="ticks">
            <li><Icon name="chat" /> {t('guest.t1')}</li>
            <li><Icon name="calendar" /> {t('guest.t2')}</li>
            <li><Icon name="lock" /> {t('guest.t3')}</li>
          </ul>
        </div>
        <div className="card meter" aria-labelledby="meter-title">
          <h3 id="meter-title" className="h3">{t('guest.meter')}</h3>
          <div className="hearts" role="img" aria-label={t('guest.aria', { n: proposedGuestTurns })}>
            {Array.from({ length: proposedGuestTurns }, (_, i) => (
              <span key={i} className="heart" />
            ))}
          </div>
          <p className="meter__line">
            <strong>{t('guest.turns', { n: proposedGuestTurns })}</strong> {t('guest.per')}
          </p>
          <p className="muted">{t('guest.proposed')}</p>
          <button type="button" className="btn btn--primary btn--block" disabled aria-describedby="id-note">
            {t('guest.cta')}
          </button>
          <p id="id-note" className="muted meter__note">{t('guest.note')}</p>
        </div>
      </div>
    </section>
  );
}

function Mark({ value }: { value: CapabilityValue }) {
  const { t } = useSettings();
  if (value === 'yes') return <span className="mark"><Icon name="check" /> <span className="sr">{t('cap.yes')}</span></span>;
  if (value === 'no') return <span className="mark"><Icon name="cross" /> <span className="sr">{t('cap.no')}</span></span>;
  return <span className="mark"><Icon name="clock" /> {t('cap.later')}</span>;
}

function Capabilities() {
  const { t } = useSettings();
  return (
    <section className="section" id="compare" aria-labelledby="cap-title">
      <div className="wrap">
        <p className="eyebrow">{t('cap.eyebrow')}</p>
        <h2 id="cap-title" className="h2">{t('cap.title')}</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label={t('cap.region')}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('cap.feature')}</th>
                <th scope="col">{t('cap.guest')}</th>
                <th scope="col">{t('cap.member')}</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(row.key)}</th>
                  <td className={row.guest === 'yes' ? 'yes' : 'no'}><Mark value={row.guest} /></td>
                  <td className={row.member === 'yes' ? 'yes' : 'soon'}><Mark value={row.member} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Rules() {
  const { t } = useSettings();
  const reveal = useReveal<HTMLDivElement>();
  return (
    <section className="section section--tint" aria-labelledby="rules-title">
      <div className="wrap" ref={reveal}>
        <p className="eyebrow">{t('rules.eyebrow')}</p>
        <h2 id="rules-title" className="h2">{t('rules.title')}</h2>
        <ul className="rules">
          {houseRules.map((rule) => (
            <li key={rule.id} className="card rule">
              <span className="rule__icon"><Icon name={rule.icon} /></span>
              <h3 className="h3">{t(`${rule.id}.title`)}</h3>
              <p className="muted">{t(`${rule.id}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const footerColumns = [
  {
    title: 'foot.col.companion',
    links: [
      { label: 'foot.link.pet', href: '#grow' },
      { label: 'foot.link.guests', href: '#start' },
      { label: 'foot.link.compare', href: '#compare' },
    ],
  },
  {
    title: 'foot.col.hashpass',
    links: [
      { label: 'foot.link.site', href: 'https://hashpass.tech' },
      { label: 'foot.link.club', href: 'https://hashpass.club' },
      { label: 'foot.link.roadmap', href: 'https://github.com/hashpass-tech/hashpass.tech/issues/469' },
    ],
  },
  {
    title: 'foot.col.legal',
    links: [
      { label: 'foot.link.privacy', href: 'https://hashpass.club/documentation/legal/privacy-policy/' },
      { label: 'foot.link.terms', href: 'https://hashpass.club/documentation/legal/terms-of-service/' },
      { label: 'foot.link.delete', href: 'https://hashpass.tech/delete-account' },
    ],
  },
];

function Footer() {
  const { t } = useSettings();
  const year = new Date().getFullYear();
  const versionTitle = t('foot.build', { build: CURRENT_VERSION.buildNumber, date: CURRENT_VERSION.releaseDate, type: CURRENT_VERSION.releaseType, commit: BUILD_INFO.gitCommit });
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__top">
          <div className="footer__brand">
            <Sprite name="curious" className="pet pet--foot" />
            <div>
              <p className="footer__name">HASHPASS Companion</p>
              <p className="footer__blurb">{t('foot.blurb')}</p>
            </div>
          </div>
          <nav className="footer__cols" aria-label={t('foot.nav')}>
            {footerColumns.map((col) => (
              <div key={col.title}>
                <p className="footer__head">{t(col.title)}</p>
                <ul className="footer__links">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {t(link.label)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="footer__bar">
          <span>{t('foot.rights', { year })}</span>
          <span className="footer__meta">
            <span className="chip chip--stage">{t('foot.staging')}</span>
            <span className="chip" title={versionTitle}>
              {getCompanionVersionLabel()} · {CURRENT_VERSION.releaseType}
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  const { t } = useSettings();
  return (
    <>
      <a className="skip" href="#grow">{t('app.skip')}</a>
      <Hero />
      <main>
        <Evolution />
        <GuestStart />
        <Capabilities />
        <Rules />
      </main>
      <Footer />
    </>
  );
}
