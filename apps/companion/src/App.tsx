import { Suspense, lazy, useState } from 'react';
import { PixelWord, Sprite, Stars, useInView } from './Pixel';
import { capabilities, houseRules, proposedGuestTurns, stages } from './content';
import { BUILD_INFO, CURRENT_VERSION, getCompanionVersionLabel } from './config/version';
import type { DemoAction, PetMood, StageKey } from './types';

const QuestGame = lazy(() => import('./game/QuestGame').then((m) => ({ default: m.QuestGame })));

const stageOrder: StageKey[] = ['hatchling', 'curious', 'helpful'];

const demoActions: DemoAction[] = [
  { id: 'ask', label: 'Ask about the programme', unlocks: 'curious', mood: 'think', reply: 'Answered from the event catalog. I feel more curious!' },
  { id: 'ics', label: 'Download a calendar draft', unlocks: 'helpful', mood: 'cheer', reply: 'Draft saved. That was a real action, so I grew.' },
  { id: 'chat', label: 'Just chat', unlocks: null, mood: 'hi', reply: 'Fun! But chatting alone never changes my stage.' },
];

function Hero() {
  const [ref, inView] = useInView<HTMLElement>();
  const [playing, setPlaying] = useState(false);
  return (
    <header className="hero" ref={ref} data-paused={inView ? 'false' : 'true'}>
      <Stars />
      <div className="cloud cloud--a" aria-hidden="true"><Sprite name="cloud" /></div>
      <div className="cloud cloud--b" aria-hidden="true"><Sprite name="cloud" /></div>
      <div className="wrap hero__inner">
        <p className="tag">
          <span className="tag__dot" aria-hidden="true" /> Staging preview · not live yet
        </p>
        <h1 className="hero__title">
          <span className="sr">HASHPASS Companion</span>
          <span className="hero__brand" aria-hidden="true">HASHPASS</span>
          <PixelWord className="hero__word" text="COMPANION" />
        </h1>
        <p className="hero__lede">
          A tiny pixel pet that helps you plan your conference. Ask it about the programme, sketch a day in your calendar, and watch it grow
          with every real thing you finish.
        </p>
        <p className="hero__hint">New here? A short platformer shows how it works. No sign-in, nothing is saved.</p>
        <div className="hero__cta">
          <button type="button" className="btn btn--play" onClick={() => setPlaying(true)}>
            <span className="btn__tri" aria-hidden="true" /> Play the quest
          </button>
          <a className="btn btn--primary" href="#grow">Meet your pet</a>
          <a className="btn btn--ghost" href="#start">How guests start</a>
        </div>
        <div className="hero__stage">
          <div className="bubble" role="presentation" aria-hidden="true">Hi! I just hatched.</div>
          <Sprite name="hatchling" className="pet pet--hero" />
          <div className="ground" aria-hidden="true" />
        </div>
      </div>
      {playing && (
        <Suspense fallback={<p className="quest-loading" role="status">Loading the quest…</p>}>
          <QuestGame onClose={() => setPlaying(false)} />
        </Suspense>
      )}
    </header>
  );
}

function Evolution() {
  const [reached, setReached] = useState(0);
  const [said, setSaid] = useState('Pick something to do. This is a local preview: nothing is sent anywhere.');
  const [mood, setMood] = useState<PetMood>('idle');
  const current = stages[reached];

  const perform = (action: DemoAction) => {
    const target = action.unlocks ? stageOrder.indexOf(action.unlocks) : -1;
    if (target > reached) setReached(target);
    setMood(action.mood);
    setSaid(action.reply);
  };

  return (
    <section className="section" id="grow" aria-labelledby="grow-title">
      <div className="wrap">
        <p className="eyebrow">Evolution</p>
        <h2 id="grow-title" className="h2">Three stages, earned one real action at a time</h2>
        <p className="lead">Messages do not level a pet up. Finishing something useful does.</p>

        <ol className="stages">
          {stages.map((stage, i) => (
            <li key={stage.key} className={`card stage${i <= reached ? ' stage--on' : ''}`} aria-current={i === reached ? 'step' : undefined}>
              <div className="stage__art" data-stage={stage.key}>
                <Sprite name={stage.key} className="pet pet--card" />
              </div>
              <p className="stage__num">Stage {i + 1}</p>
              <h3 className="h3">{stage.name}</h3>
              <p className="stage__trigger">{stage.trigger}</p>
              <p className="muted">{stage.note}</p>
            </li>
          ))}
        </ol>

        <div className="card demo" aria-labelledby="demo-title">
          <div className="demo__pet" data-mood={mood}>
            <Sprite name={stages[reached].key} className="pet pet--demo" />
            <p className="demo__name">{current.name}</p>
          </div>
          <div className="demo__body">
            <h3 id="demo-title" className="h3">Try it: feed your pet</h3>
            <p className="demo__say" role="status" aria-live="polite">{said}</p>
            <div className="demo__actions">
              {demoActions.map((a) => (
                <button key={a.id} type="button" className="btn btn--tint" onClick={() => perform(a)}>
                  {a.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="link"
              onClick={() => {
                setReached(0);
                setMood('idle');
                setSaid('Back to an egg-fresh Hatchling.');
              }}
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function GuestStart() {
  return (
    <section className="section section--dark" id="start" aria-labelledby="start-title">
      <div className="wrap split">
        <div>
          <p className="eyebrow">Guests first</p>
          <h2 id="start-title" className="h2">No account needed to begin</h2>
          <p className="lead">
            Open the Companion, ask a conference question or draft your day in a calendar file. Create a HASHPASS ID only when you want to keep
            things.
          </p>
          <ul className="ticks">
            <li>Ask about talks, speakers and venues</li>
            <li>Download an <abbr title="iCalendar">.ics</abbr> draft of your day</li>
            <li>Works in a private window, nothing to install</li>
          </ul>
        </div>
        <div className="card meter" aria-labelledby="meter-title">
          <h3 id="meter-title" className="h3">Your guest allowance</h3>
          <div className="hearts" role="img" aria-label={`${proposedGuestTurns} of ${proposedGuestTurns} AI turns remaining, example`}>
            {Array.from({ length: proposedGuestTurns }, (_, i) => (
              <span key={i} className="heart" />
            ))}
          </div>
          <p className="meter__line">
            <strong>{proposedGuestTurns} AI turns</strong> per rolling 24 hours
          </p>
          <p className="muted">
            Proposed limit, not live yet. When it ships, the server counts every turn and the remaining allowance is always on screen.
          </p>
          <button type="button" className="btn btn--primary btn--block" disabled aria-describedby="id-note">
            Continue with HASHPASS ID
          </button>
          <p id="id-note" className="muted meter__note">Sign-in is not connected on this preview.</p>
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section className="section" id="compare" aria-labelledby="cap-title">
      <div className="wrap">
        <p className="eyebrow">What you get</p>
        <h2 id="cap-title" className="h2">Guest or HASHPASS ID</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Guest and HASHPASS ID capabilities">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Guest</th>
                <th scope="col">HASHPASS ID</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={row.guest === 'Included' ? 'yes' : 'no'}>{row.guest}</td>
                  <td className={row.member === 'Included' ? 'yes' : 'soon'}>{row.member}</td>
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
  return (
    <section className="section section--tint" aria-labelledby="rules-title">
      <div className="wrap">
        <p className="eyebrow">House rules</p>
        <h2 id="rules-title" className="h2">Small pet, firm promises</h2>
        <ul className="rules">
          {houseRules.map((rule) => (
            <li key={rule.title} className="card rule">
              <h3 className="h3">{rule.title}</h3>
              <p className="muted">{rule.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const footerColumns = [
  {
    title: 'Companion',
    links: [
      { label: 'Meet your pet', href: '#grow' },
      { label: 'How guests start', href: '#start' },
      { label: 'Guest or HASHPASS ID', href: '#compare' },
    ],
  },
  {
    title: 'HASHPASS',
    links: [
      { label: 'hashpass.tech', href: 'https://hashpass.tech' },
      { label: 'Club', href: 'https://hashpass.club' },
      { label: 'Source and roadmap', href: 'https://github.com/hashpass-tech/hashpass.tech/issues/469' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', href: 'https://hashpass.club/documentation/legal/privacy-policy/' },
      { label: 'Terms of service', href: 'https://hashpass.club/documentation/legal/terms-of-service/' },
      { label: 'Delete account', href: 'https://hashpass.tech/delete-account' },
    ],
  },
];

function Footer() {
  const year = new Date().getFullYear();
  const versionTitle = `Build ${CURRENT_VERSION.buildNumber} · Released ${CURRENT_VERSION.releaseDate} · ${CURRENT_VERSION.releaseType} · commit ${BUILD_INFO.gitCommit}`;
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__top">
          <div className="footer__brand">
            <Sprite name="curious" className="pet pet--foot" />
            <div>
              <p className="footer__name">HASHPASS Companion</p>
              <p className="footer__blurb">
                A pixel pet for conference days. In staging: the pet, conversation, calendar drafts and HASHPASS ID sign-in on this page are
                previews, not working features, and this site collects no data.
              </p>
            </div>
          </div>
          <nav className="footer__cols" aria-label="Footer">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <p className="footer__head">{col.title}</p>
                <ul className="footer__links">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="footer__bar">
          <span>© {year} HASHPASS. All rights reserved.</span>
          <span className="footer__meta">
            <span className="chip chip--stage">Staging</span>
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
  return (
    <>
      <a className="skip" href="#grow">Skip to content</a>
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
