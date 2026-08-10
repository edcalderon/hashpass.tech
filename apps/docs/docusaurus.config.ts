function normalizeBaseUrl(value: string): string {
  if (value === '/') {
    return '/';
  }

  return value.endsWith('/') ? value : `${value}/`;
}

const siteUrl = process.env.HASHPASS_DOCS_URL ?? 'https://hashpass.club';
const baseUrl = normalizeBaseUrl(process.env.HASHPASS_DOCS_BASE_URL ?? '/');

const config = {
  title: 'HASHPASS Docs',
  tagline: 'The documentation behind the HASHPASS platform',
  favicon: 'img/favicon.ico',
  url: siteUrl,
  baseUrl,
  organizationName: 'hashpass-tech',
  projectName: 'hashpass.tech',
  onBrokenLinks: 'throw',
  future: {
    v4: true,
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/hashpass-tech/hashpass.tech/tree/main/apps/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: '',
      logo: {
        alt: 'HASHPASS',
        src: 'img/logo-hashpass-light.svg',
        srcDark: 'img/logo-hashpass-dark.svg',
        href: '/',
        width: 132,
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://hashpass.tech',
          label: 'HASHPASS',
          position: 'right',
        },
        {
          href: 'https://github.com/hashpass-tech/hashpass.tech',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Overview', to: '/overview' },
            { label: 'Auth', to: '/auth/' },
            { label: 'Infra', to: '/infra/' },
            { label: 'Storybook', to: '/storybook/' },
          ],
        },
        {
          title: 'Repository',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/hashpass-tech/hashpass.tech',
            },
          ],
        },
        {
          title: 'HASHPASS',
          items: [
            { label: 'hashpass.tech', href: 'https://hashpass.tech' },
            { label: 'Terms of Service', href: 'https://hashpass.tech/terms' },
            { label: 'Privacy Policy', href: 'https://hashpass.tech/privacy' },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} HASHPASS. All rights reserved. · <a href="https://hashpass.tech/terms" style="color:inherit;">Terms</a> · <a href="https://hashpass.tech/privacy" style="color:inherit;">Privacy</a>`,
    },
  },
};

export default config;
