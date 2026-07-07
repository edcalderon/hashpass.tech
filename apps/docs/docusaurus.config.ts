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
  tagline: 'Current documentation for HASHPASS',
  favicon: 'img/logo.svg',
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
      title: 'HASHPASS Docs',
      logo: {
        alt: 'HASHPASS Docs',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
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
            { label: 'Overview', to: '/' },
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
      ],
      copyright: `Copyright © ${new Date().getFullYear()} HASHPASS`,
    },
  },
};

export default config;
