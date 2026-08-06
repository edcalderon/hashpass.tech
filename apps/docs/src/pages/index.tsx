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
}

const SECTIONS: DocSection[] = [
  {
    title: 'Authentication',
    description: 'OAuth, Better Auth, Supabase identity bridging, and how a session resolves across every HASHPASS surface.',
    href: '/auth/',
    icon: '\u{1F510}',
    meta: 'auth/',
  },
  {
    title: 'Infrastructure',
    description: 'Environments, API Gateway, Lambda, storage, naming conventions, and the AWS account layout.',
    href: '/infra/',
    icon: '\u{1F5A5}️',
    meta: 'infra/',
  },
  {
    title: 'Deployment',
    description: 'How each domain actually ships — web, API, mobile — and exactly what triggers each pipeline.',
    href: '/deployment/',
    icon: '\u{1F680}',
    meta: 'deployment/',
  },
  {
    title: 'Reference',
    description: 'API architecture, mobile app internals, QR flows, performance notes, and release mechanics.',
    href: '/reference/',
    icon: '\u{1F4D8}',
    meta: 'reference/',
  },
  {
    title: 'Storybook',
    description: 'Component library setup, deployment, and how to contribute a new component.',
    href: '/storybook/',
    icon: '\u{1F4DA}',
    meta: 'storybook/',
  },
  {
    title: 'Guides',
    description: 'Onboarding walkthroughs published here and mirrored in Storybook for contributors.',
    href: '/guides/',
    icon: '\u{1F9ED}',
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
            docs.init
          </p>
          <h1 className={styles.title}>
            Everything running <span className={styles.accent}>your digital pass.</span>
          </h1>
          <p className={styles.subtitle}>
            Auth flows, infrastructure, deployment pipelines, and API references for the platform behind
            HASHPASS — kept current by the people who ship it.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} to="/overview">
              Browse the docs &rarr;
            </Link>
            <Link className={styles.btnSecondary} to="https://hashpass.tech">
              hashpass.tech
            </Link>
          </div>
          <p className={styles.heroCommand}>
            <strong>$</strong> docs --scope=hashpass.tech --status=current
          </p>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.sectionWrap}>
          <div className={styles.sectionHead}>
            <p className={styles.sectionEyebrow}>start here</p>
            <h2 className={styles.sectionTitle}>Jump into a section</h2>
          </div>
          <div className={styles.grid}>
            {SECTIONS.map((section) => (
              <Link key={section.href} to={section.href} className={styles.card}>
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
              <h3>Looking for the product, not the docs?</h3>
              <p>hashpass.tech is where passes, events, and wallets actually live.</p>
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
