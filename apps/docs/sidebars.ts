const sidebars = {
  docsSidebar: [
    'README',
    {
      type: 'category',
      label: 'Authentication',
      items: [
        'auth/README',
        'auth/AUTHENTICATION',
        'auth/AUTH_FLOW',
        'auth/AUTH_STRUCTURE',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: ['deployment/README', 'deployment/amplify/AMPLIFY-API-ROUTES'],
    },
    {
      type: 'category',
      label: 'Infrastructure',
      items: [
        'infra/README',
        'infra/CLOUDINARY_CONFIG',
        'infra/INFRA_NAMING_GUIDE',
        'infra/MAKE_S3_BUCKET_PUBLIC',
        'infra/SPEAKER_AVATARS_S3_SETUP',
        {
          type: 'category',
          label: 'API Gateway',
          items: [
            'infra/api-gateway/README',
            'infra/api-gateway/API-GATEWAY-SETUP',
            'infra/api-gateway/API-GATEWAY-DNS-FIX',
            'infra/api-gateway/API-GATEWAY-TROUBLESHOOTING',
          ],
        },
        {
          type: 'category',
          label: 'Environment',
          items: [
            'infra/env/ENVIRONMENT_STRATEGY',
            'infra/env/ENVIRONMENT_VARIABLES',
          ],
        },
        {
          type: 'category',
          label: 'Lambda',
          items: [
            'infra/lambda/README',
            'infra/lambda/LAMBDA-CI-CD-QUICK-START',
            'infra/lambda/LAMBDA-CI-CD-SETUP',
          ],
        },
        {
          type: 'category',
          label: 'Security',
          items: [
            'infra/security/wazuh-integration-guide',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: ['guides/README', 'guides/user-onboarding', 'guides/speaker-onboarding'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/README',
        {
          type: 'category',
          label: 'Performance',
          items: ['reference/performance/PERFORMANCE_OPTIMIZATIONS'],
        },
        {
          type: 'category',
          label: 'QR',
          items: ['reference/qr/qr-system'],
        },
        {
          type: 'category',
          label: 'Release',
          items: ['reference/release/versioning-guide'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Storybook',
      items: [
        'storybook/README',
        'storybook/storybook-setup',
        'storybook/storybook-guides',
        'storybook/storybook-deployment',
      ],
    },
  ],
};

export default sidebars;
