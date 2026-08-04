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
        'auth/USER_REGISTRY',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: ['deployment/README'],
    },
    {
      type: 'category',
      label: 'Infrastructure',
      items: [
        'infra/README',
        'infra/CLOUDINARY_CONFIG',
        'infra/INFRA_NAMING_GUIDE',
        {
          type: 'category',
          label: 'Migration',
          items: ['infra/migrations/aws-account-cutover'],
        },
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
          label: 'Admin',
          items: [
            'reference/admin/admin-event-control-center',
            'reference/admin/bsl-schema-source-of-truth',
            'reference/admin/bsl-schema-relational-audit',
          ],
        },
        {
          type: 'category',
          label: 'Mobile App',
          items: [
            'reference/mobile-app/native-module-version-pinning',
            'reference/mobile-app/local-android-debugging',
            'reference/mobile-app/drawer-navigation-gotchas',
            'reference/mobile-app/svg-native-image-rendering-gotcha',
            'reference/mobile-app/event-scoped-api-client',
            'reference/mobile-app/event-api-architecture',
            'reference/mobile-app/db-user-id-pattern',
            'reference/mobile-app/eas-update-ota',
          ],
        },
        {
          type: 'category',
          label: 'Release',
          items: [
            'reference/release/RELEASE_WORKFLOW',
            'reference/release/PLAY_CONSOLE_RELEASE_FLOW',
            'reference/release/versioning-guide',
          ],
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
