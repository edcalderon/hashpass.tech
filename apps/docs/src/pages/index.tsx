import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './index.module.css';

interface DocSection {
  title: string;
  description: string;
  href: string;
  icon: string;
  meta: string;
  featured?: boolean;
}

const SECTIONS: DocSection[] = [
  {
    title: 'Developer SDK',
    description: 'Start a runtime-neutral integration for support, QR sign-in, and tracked links with the official client.',
    href: '/developers/',
    icon: 'SDK',
    meta: 'developers/',
    featured: true,
  },
  {
    title: 'Brand and Media',
    description: 'Download HASHPASS logos, read brand usage guidance, and prepare partner or press materials.',
    href: '/media-kit',
    icon: 'BR',
    meta: 'media-kit/',
  },
  {
    title: 'Authentication',
    description: 'OAuth, Better Auth, Supabase identity bridging, and how a session resolves across every HASHPASS surface.',
    href: '/auth/',
    icon: 'ID',
    meta: 'auth/',
  },
  {
    title: 'Infrastructure',
    description: 'Environments, API Gateway, Lambda, storage, naming conventions, and the AWS account layout.',
    href: '/infra/',
    icon: 'OP',
    meta: 'infra/',
  },
  {
    title: 'Deployment',
    description: 'How each domain actually ships — web, API, mobile — and exactly what triggers each pipeline.',
    href: '/deployment/',
    icon: 'RL',
    meta: 'deployment/',
  },
  {
    title: 'Reference',
    description: 'API architecture, mobile app internals, QR flows, performance notes, and release mechanics.',
    href: '/reference/',
    icon: 'RF',
    meta: 'reference/',
  },
  {
    title: 'Storybook',
    description: 'Component library setup, deployment, and how to contribute a new component.',
    href: '/storybook/',
    icon: 'UI',
    meta: 'storybook/',
  },
  {
    title: 'Guides',
    description: 'Onboarding walkthroughs published here and mirrored in Storybook for contributors.',
    href: '/guides/',
    icon: 'GD',
    meta: 'guides/',
  },
];

export default function Home(): React.ReactElement {
  const logoSrc = useBaseUrl('img/logo-hashpass-dark.svg');

  return (
    <Layout
      title="HASHPASS Docs"
      description="The documentation behind the HASHPASS platform — passes, identity, and the infrastructure running it."
    >
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <img src={logoSrc} alt="HASHPASS" className={styles.heroLogo} />
          <p className={styles.eyebrow}>
            <span className={styles.dot} />
            HASHPASS / Developer Hub
          </p>
          <h1 className={styles.title}>
            Build the trusted layer for <span className={styles.accent}>every pass.</span>
          </h1>
          <p className={styles.subtitle}>
            Integrate secure identity, QR journeys, and support into the experiences people carry with them.
            Then run every HASHPASS surface with the same operational playbook.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} to="/developers/sdk-quickstart">
              Start with the SDK <span aria-hidden="true">→</span>
            </Link>
            <Link className={styles.btnSecondary} to="/overview">
              Explore platform docs
            </Link>
          </div>
          <div className={styles.signalRow} aria-label="Developer documentation focus areas">
            <span><b>01</b> SDK</span>
            <span><b>02</b> QR sign-in</span>
            <span><b>03</b> Support APIs</span>
          </div>
        </div>
        <div className={styles.heroOrbit} aria-hidden="true" />
      </header>

      <main className={styles.main}>
        <section className={styles.developerStrip} aria-labelledby="developer-path-title">
          <div className={styles.developerIntro}>
            <p className={styles.sectionEyebrow}>developer path</p>
            <h2 id="developer-path-title">From one client to a real integration.</h2>
            <p>Use the SDK in web, React Native, server, or CLI runtimes. Keep credentials in your host storage and let the SDK handle transport, typed errors, retries, and idempotency.</p>
            <Link className={styles.inlineLink} to="/developers/">
              View the developer guide <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.codePanel} aria-label="SDK installation example">
            <div className={styles.codeTopline}>
              <span className={styles.codeDots}><i /><i /><i /></span>
              <span>quickstart.ts</span>
            </div>
            <pre><code><span className={styles.codeMuted}>$</span> pnpm add @hashpass-tech/sdk{`\n\n`}<span className={styles.codeKeyword}>import</span> {'{ createHashpass }'} <span className={styles.codeKeyword}>from</span> <span className={styles.codeString}>'@hashpass-tech/sdk'</span>;{`\n\n`}<span className={styles.codeKeyword}>const</span> hashpass = createHashpass({'{'}{`\n`}  appId: <span className={styles.codeString}>'your-public-app-id'</span>,{`\n`}{'}'});</code></pre>
            <Link className={styles.codeLink} to="/developers/sdk-quickstart">Open quickstart <span aria-hidden="true">↗</span></Link>
          </div>
        </section>

        <div className={styles.sectionWrap}>
          <div className={styles.sectionHead}>
            <p className={styles.sectionEyebrow}>documentation map</p>
            <h2 className={styles.sectionTitle}>Choose the work in front of you.</h2>
          </div>
          <div className={styles.grid}>
            {SECTIONS.map((section) => (
              <Link key={section.href} to={section.href} className={`${styles.card} ${section.featured ? styles.featuredCard : ''}`}>
                <span className={styles.cardIcon}>{section.icon}</span>
                <p className={styles.cardTitle}>{section.title}</p>
                <p className={styles.cardDesc}>{section.description}</p>
                <span className={styles.cardMeta}>{section.meta}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className={styles.callout}>
          <div className={styles.calloutCard}>
            <div className={styles.calloutText}>
              <p className={styles.sectionEyebrow}>product experience</p>
              <h3>Ready to see the platform in motion?</h3>
              <p>Explore passes, events, and wallet journeys on the public HASHPASS app.</p>
            </div>
            <Link className={styles.btnPrimary} to="https://hashpass.tech">
              Go to HASHPASS &rarr;
            </Link>
          </div>
        </div>
      </main>
    </Layout>
  );
}
