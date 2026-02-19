// Example: How to add a new event to your white-label platform
// This file shows the pattern for adding new events

import { EventConfig } from './events';

// Example: Adding a new tech conference event
export const TECHCONF2025_CONFIG: EventConfig = {
  id: 'techconf2025',
  name: 'Tech Conf 2025',
  domain: 'techconf2025.hashpass.tech',
  features: ['networking', 'agenda', 'speakers'],
  branding: {
    primaryColor: '#FF6B35',
    secondaryColor: '#FF8E53',
    logo: '/assets/logos/techconf-logo.svg',
    favicon: '/favicon-techconf.ico'
  },
  api: {
    basePath: '/api/techconf',
    endpoints: {
      speakers: '/api/techconf/speakers',
      agenda: '/api/techconf/agenda',
      networking: '/api/techconf/networking'
    }
  },
  routes: {
    home: '/techconf/home',
    speakers: '/techconf/speakers',
    bookings: '/techconf/networking'
  },
  database: {
    schema: 'techconf',
    tables: {
      speakers: 'techconf_speakers',
      sessions: 'techconf_sessions',
      attendees: 'techconf_attendees'
    }
  }
};

// To add this event:
// 1. Add it to the EVENTS object in events.ts
// 2. Create the corresponding API routes in app/api/techconf/
// 3. Create the UI components in app/techconf/
// 4. Update amplify.yml redirects to include /techconf/*
// 5. Deploy to techconf2025.hashpass.tech domain

/*
DEPLOYMENT WORKFLOW FOR NEW EVENTS:

1. Create new branch:
   git checkout -b techconf2025
   
2. Add event configuration to events.ts:
   'techconf2025': TECHCONF2025_CONFIG
   
3. Create event-specific files:
   - app/techconf/home.tsx
   - app/api/techconf/speakers+api.ts
   - etc.
   
4. Update amplify.yml:
   - source: '/techconf/*'
     status: 200
     target: '/index.html'
   
5. Deploy:
   ./deploy-techconf.sh
   
6. Configure domain:
   - Point techconf2025.hashpass.tech to your deployment
   
This approach gives you:
✅ Isolated deployments per event
✅ Shared core functionality
✅ Event-specific customizations
✅ Easy scaling to new events
✅ Maintainable codebase
*/
