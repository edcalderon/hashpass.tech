'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight, CalendarDays, Check, ChevronDown, Compass, Copy,
  ExternalLink, Globe2, LayoutDashboard, MapPin, Menu, Plus,
  Search, Share2, Sparkles, Users, X,
} from 'lucide-react';
import styles from './events.module.css';

type View = 'discover' | 'calendar' | 'host' | 'profile';

// href values are each tour stop's real organizer site (same
// `blockchainsummit.la/<eventId>/` pattern the shared BSL event config in
// packages/config/src/events.ts already derives `website` from) -- never a
// fabricated/placeholder route, since no event-detail page exists yet for
// these cards to link to internally.
const upcomingEvents = [
  { month: 'MAY', day: '13', title: 'Blockchain Summit Latam · Perú', meta: 'Lima, Peru · May 13–15', tone: 'sunset', href: 'https://blockchainsummit.la/peru2026/' },
  { month: 'AUG', day: '05', title: 'Blockchain Summit Latam · Chile', meta: 'Santiago, Chile · Aug 5–7', tone: 'violet', href: 'https://blockchainsummit.la/chile2026/' },
  { month: 'NOV', day: '04', title: 'Blockchain Summit Latam · Colombia', meta: 'Bogotá, Colombia · Nov 4–6', tone: 'cyan', href: 'https://blockchainsummit.la/colombia2026/' },
] as const;

const benefits = [
  ['A page people remember', 'Your event, schedule, venue, and organizers in one polished, shareable home.'],
  ['RSVPs without friction', 'One clear link for registration, confirmations, calendar saves, and attendee updates.'],
  ['A community that compounds', 'Every event strengthens your organizer profile and your attendees’ public calendars.'],
] as const;

export function EventsExperience() {
  const [view, setView] = useState<View>('discover');
  const [onboarding, setOnboarding] = useState(false);
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const title = useMemo(() => ({
    discover: 'Find your next room.', calendar: 'Your calendar, made social.',
    host: 'Events you’re building.', profile: 'Your public presence.',
  }[view]), [view]);

  const openOnboarding = () => { setStep(1); setOnboarding(true); };
  const copyProfile = async () => {
    await navigator.clipboard?.writeText('https://hashpass.tech/events/@yourname');
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button className={styles.brand} onClick={() => setView('discover')} aria-label="HASHPASS Events home">
          <span className={styles.brandMark}>H</span><span>hashpass</span><b>events</b>
        </button>
        <nav className={`${styles.nav} ${mobileNav ? styles.navOpen : ''}`} aria-label="Main navigation">
          <NavButton icon={<Compass />} label="Discover" active={view === 'discover'} onClick={() => setView('discover')} />
          <NavButton icon={<CalendarDays />} label="Calendar" active={view === 'calendar'} onClick={() => setView('calendar')} />
          <NavButton icon={<LayoutDashboard />} label="Host" active={view === 'host'} onClick={() => setView('host')} />
        </nav>
        <div className={styles.headerActions}>
          <button className={styles.hostButton} onClick={openOnboarding}><Plus /> Create event</button>
          <button className={styles.avatar} onClick={() => setView('profile')} aria-label="Open your profile">YC</button>
          <button className={styles.menuButton} onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu /></button>
        </div>
      </header>

      <main>
        {view === 'discover' && <Discover title={title} onCreate={openOnboarding} onCalendar={() => setView('calendar')} />}
        {view === 'calendar' && <CalendarView title={title} />}
        {view === 'host' && <HostView title={title} onCreate={openOnboarding} />}
        {view === 'profile' && <ProfileView title={title} copied={copied} onCopy={copyProfile} />}
      </main>

      {onboarding && <Onboarding step={step} onStep={setStep} onClose={() => setOnboarding(false)} />}
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? styles.navActive : ''} onClick={onClick}>{icon}{label}</button>;
}

function Discover({ title, onCreate, onCalendar }: { title: string; onCreate: () => void; onCalendar: () => void }) {
  return <>
    <section className={styles.hero}>
      <div className={styles.orbOne} /><div className={styles.orbTwo} />
      <div className={styles.heroInner}>
        <span className={styles.eyebrow}><Sparkles /> Built for real-world connection</span>
        <h1>{title}</h1>
        <p>Discover gatherings worth showing up for—or create one people won’t want to miss.</p>
        <div className={styles.search}><Search /><input aria-label="Search events" placeholder="Search events, cities, or communities"/><button>Explore</button></div>
        <div className={styles.heroLinks}><button onClick={onCreate}>Host an event <ArrowRight /></button><button onClick={onCalendar}>Share your calendar</button></div>
      </div>
    </section>

    <section className={styles.content}>
      <div className={styles.sectionHead}><div><span className={styles.kicker}>COMING UP</span><h2>Events with momentum</h2></div><button className={styles.textButton}>View all <ArrowRight /></button></div>
      <div className={styles.eventGrid}>{upcomingEvents.map((event) => <a
        className={styles.eventCard}
        key={event.title}
        href={event.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${event.title} — opens the event page in a new tab`}
      >
        <div className={`${styles.eventArt} ${styles[event.tone]}`}><div className={styles.artGrid}/><span>BSL<br/>2026</span><b>LATAM<br/>TOUR</b></div>
        <div className={styles.eventInfo}><div className={styles.dateTile}><span>{event.month}</span><strong>{event.day}</strong></div><div><h3>{event.title}</h3><p><MapPin /> {event.meta}</p><small>By Blockchain Summit Latam</small></div></div>
      </a>)}</div>
    </section>

    {/* Standalone call-for-speakers banner -- Colombia Blockchain Week (Medellín,
        Dec 11-12) runs its own CFP and is a different event/organizer than the
        "Blockchain Summit Latam · Colombia" card above, so this is kept as its
        own clearly-labeled section rather than attached to that card. */}
    <section className={styles.speakerBanner}>
      <div className={styles.speakerBannerCard}>
        <div className={styles.speakerBannerText}>
          <span className={styles.kicker}>CALL FOR SPEAKERS</span>
          <h2>Become a speaker at Colombia Blockchain Week.</h2>
          <p>Share your work with Medellín’s blockchain community — applications for Colombia Blockchain Week 2026 are open now.</p>
        </div>
        <a
          className={styles.primary}
          href="https://colombiablockchainweek.com/ser-speaker#postulacion"
          target="_blank"
          rel="noopener noreferrer"
        >
          Apply to speak <ArrowRight />
        </a>
      </div>
    </section>

    <section className={styles.hostStory}>
      <div><span className={styles.kicker}>FOR ORGANIZERS</span><h2>Your community deserves more than a signup form.</h2><p>Give every gathering a beautiful home and every guest a reason to stay connected.</p><button className={styles.primary} onClick={onCreate}>Start hosting <ArrowRight /></button></div>
      <div className={styles.benefitList}>{benefits.map(([heading, body], index) => <div key={heading}><span>0{index + 1}</span><div><h3>{heading}</h3><p>{body}</p></div></div>)}</div>
    </section>
  </>;
}

function CalendarView({ title }: { title: string }) {
  return <section className={styles.page}><PageIntro eyebrow="CALENDAR" title={title} body="Collect your RSVPs in one place, follow calendars you trust, and let people know where you’ll be." />
    <div className={styles.calendarLayout}><aside className={styles.miniCalendar}><div><button>‹</button><b>October 2026</b><button>›</button></div><div className={styles.weekdays}>{['M','T','W','T','F','S','S'].map((d,i)=><span key={`${d}-${i}`}>{d}</span>)}</div><div className={styles.days}>{Array.from({length:35},(_,i)=><span className={i===17 ? styles.today : ''} key={i}>{i < 3 ? '' : i-2}</span>)}</div></aside>
      <div className={styles.agenda}><div className={styles.agendaHead}><div><h2>October 15</h2><p>Thursday · 2 events</p></div><button className={styles.secondary}><Share2 /> Share calendar</button></div>
        {upcomingEvents.slice(0,2).map((event,i)=><article key={event.title}><time>{i ? '4:30 PM' : '9:00 AM'}</time><div className={styles.timelineDot}/><div><span className={styles.status}>{i ? 'Going' : 'Saved'}</span><h3>{event.title}</h3><p><MapPin/> {event.meta}</p></div></article>)}
      </div></div></section>;
}

function HostView({ title, onCreate }: { title: string; onCreate: () => void }) {
  return <section className={styles.page}><PageIntro eyebrow="ORGANIZER STUDIO" title={title} body="Create, publish, and understand every event from one calm workspace." action={<button className={styles.primary} onClick={onCreate}><Plus/> New event</button>} />
    <div className={styles.metrics}>{[['0','Upcoming'],['0','Total RSVPs'],['—','Conversion'],['0','Followers']].map(([n,l])=><div key={l}><strong>{n}</strong><span>{l}</span></div>)}</div>
    <div className={styles.emptyState}><div className={styles.emptyIcon}><CalendarDays/></div><h2>Your first event starts here.</h2><p>Set the details, personalize the page, invite collaborators, and share your RSVP link.</p><button className={styles.primary} onClick={onCreate}>Create your first event <ArrowRight/></button></div>
  </section>;
}

function ProfileView({ title, copied, onCopy }: { title: string; copied: boolean; onCopy: () => void }) {
  return <section className={styles.profilePage}><PageIntro eyebrow="PUBLIC PROFILE" title={title} body="One link for who you are, the communities you organize, and everywhere you’re going." />
    <div className={styles.profileCard}><div className={styles.profileCover}/><div className={styles.profileBody}><div className={styles.bigAvatar}>YC</div><div className={styles.profileButtons}><button onClick={onCopy} className={styles.secondary}>{copied ? <Check/> : <Copy/>}{copied ? 'Copied' : 'Copy link'}</button><button className={styles.iconOnly} aria-label="Open public profile"><ExternalLink/></button></div><h2>Your community</h2><p className={styles.handle}>@yourname · Medellín, Colombia</p><p>Events, people, and ideas worth gathering around.</p><div className={styles.socialLinks}><span><Globe2/> yoursite.com</span><span><Users/> 0 followers</span></div><div className={styles.profileTabs}><button className={styles.profileTabActive}>Upcoming</button><button>Past</button><button>Hosting</button></div><div className={styles.profileEmpty}><CalendarDays/><p>Your public events and RSVPs will appear here.</p></div></div></div>
  </section>;
}

function PageIntro({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: React.ReactNode }) {
  return <div className={styles.pageIntro}><div><span className={styles.kicker}>{eyebrow}</span><h1>{title}</h1><p>{body}</p></div>{action}</div>;
}

function Onboarding({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const complete = step === 4;
  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div className={styles.modal}>
      <button className={styles.close} onClick={onClose} aria-label="Close"><X/></button>
      <div className={styles.modalAside}><div className={styles.brandMark}>H</div><p>ORGANIZER SETUP</p><h2>{complete ? 'Here’s a preview of the setup.' : 'A thoughtful event starts with a few details.'}</h2><ol>{['Your organization','Event basics','Public page'].map((label,i)=><li className={step > i+1 ? styles.done : step === i+1 ? styles.current : ''} key={label}><span>{step > i+1 ? <Check/> : i+1}</span>{label}</li>)}</ol></div>
      {/* This closing step is a preview of the organizer onboarding flow --
          nothing entered above is collected or persisted. Copy here must
          never claim a real draft/workspace was created until this is
          wired to an actual event-creation backend. */}
      <div className={styles.modalMain}>{complete ? <div className={styles.success}><div><Check/></div><span className={styles.kicker}>PREVIEW</span><h2 id="onboarding-title">That’s a preview of event setup.</h2><p>Nothing you entered was saved — full event creation is coming soon. We’ll let you know when it’s ready.</p><button className={styles.primary} onClick={onClose}>Back to Discover <ArrowRight/></button></div> : <>
        <div className={styles.stepCount}>STEP {step} OF 3</div><h2 id="onboarding-title">{step === 1 ? 'Tell us about the organizer.' : step === 2 ? 'What are you planning?' : 'Shape your public page.'}</h2><p className={styles.modalLead}>{step === 1 ? 'This becomes the public identity behind your events.' : step === 2 ? 'You can change every detail before publishing.' : 'Choose the link guests will remember.'}</p>
        {step === 1 && <div className={styles.form}><label>Organization name<input autoFocus placeholder="e.g. Your community"/></label><label>Your role<select defaultValue=""><option value="" disabled>Select your role</option><option>Founder</option><option>Event manager</option><option>Community lead</option></select><ChevronDown/></label><label>Organization type<div className={styles.choiceRow}>{['Community','Company','Independent'].map((x,i)=><button className={i===0 ? styles.choiceActive : ''} key={x}>{x}</button>)}</div></label></div>}
        {step === 2 && <div className={styles.form}><label>Event name<input autoFocus placeholder="Give your event a clear name"/></label><div className={styles.formRow}><label>Date<input type="date"/></label><label>Start time<input type="time"/></label></div><label>Location<input placeholder="Venue, city, or online"/></label></div>}
        {step === 3 && <div className={styles.form}><label>Event URL<div className={styles.urlField}><span>hashpass.tech/events/</span><input autoFocus placeholder="your-event"/></div></label><label>Who can RSVP?<div className={styles.choiceRow}>{['Everyone','Approval','Invite only'].map((x,i)=><button className={i===0 ? styles.choiceActive : ''} key={x}>{x}</button>)}</div></label><label className={styles.checkbox}><input type="checkbox" defaultChecked/><span><b>Show attendee list</b><small>Guests can discover who else is going.</small></span></label></div>}
        <div className={styles.modalFooter}>{step > 1 ? <button className={styles.secondary} onClick={() => onStep(step-1)}>Back</button> : <span/>}<button className={styles.primary} onClick={() => onStep(step+1)}>{step === 3 ? 'Create draft' : 'Continue'} <ArrowRight/></button></div>
      </>}</div>
    </div>
  </div>;
}
