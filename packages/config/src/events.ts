import type { AgendaItem, EventConfig, Speaker } from '@hashpass/types';

export type { Speaker, AgendaItem, EventConfig } from '@hashpass/types';

const BSL_API_BASE_PATH = '/api/bslatam';
const BSL_DATABASE = {
  schema: 'bslatam',
  tables: {
    speakers: 'bslatam_speakers',
    bookings: 'bslatam_bookings',
    attendees: 'bslatam_attendees',
  },
} as const;

const BSL_SHARED_API_ENDPOINTS = {
  speakers: 'speakers',
  bookings: 'bookings',
  'verify-ticket': 'verify-ticket',
  'auto-match': 'auto-match',
  agenda: 'agenda',
  status: 'status',
} as const;

const BSL_HUB_BRANDING = {
  primaryColor: '#00A9E0',
  secondaryColor: '#06111F',
  logo: '/assets/logos/bsl/bsl-ontour-pro.svg',
  favicon: '/favicon.ico',
} as const;

const BSL_TOUR_SHARED_FEATURES = ['matchmaking', 'speakers', 'bookings', 'admin'] as const;

const makeTourQuickAccess = (eventId: string) => [
  {
    id: 'agenda',
    title: 'Event Agenda',
    subtitle: 'Schedule',
    icon: 'event',
    color: '#34A853',
    route: `/events/${eventId}/agenda`,
  },
  {
    id: 'networking',
    title: 'Networking Center',
    subtitle: 'Connect & meet',
    icon: 'people-alt',
    color: '#4CAF50',
    route: `/events/${eventId}/networking`,
  },
  {
    id: 'speakers',
    title: 'Featured Speakers',
    subtitle: 'Meet the experts',
    icon: 'people',
    color: '#007AFF',
    route: `/events/${eventId}/speakers/calendar`,
  },
  {
    id: 'event-info',
    title: 'Event Information',
    subtitle: 'Details & Logistics',
    icon: 'info',
    color: '#FF9500',
    route: `/events/${eventId}/event-info`,
  },
] as const;

const makeTourHubQuickAccess = () => [
  {
    id: 'peru2026',
    title: 'Peru 2026',
    subtitle: 'Lima • May 13-15',
    icon: 'location-on',
    color: '#D11A2A',
    route: '/events/peru2026/home',
  },
  {
    id: 'chile2026',
    title: 'Chile 2026',
    subtitle: 'Santiago • Aug 5-7',
    icon: 'location-on',
    color: '#FF5B5B',
    route: '/events/chile2026/home',
  },
  {
    id: 'colombia2026',
    title: 'Colombia 2026',
    subtitle: 'Bogotá • Nov 5-6',
    icon: 'location-on',
    color: '#F5C542',
    route: '/events/colombia2026/home',
  },
  {
    id: 'bsl2025',
    title: 'BSL 2025 Archive',
    subtitle: 'Medellín • Legacy edition',
    icon: 'history',
    color: '#60A5FA',
    route: '/events/bsl2025/home',
  },
] as const;

const makeTourStopConfig = (
  eventId: 'peru2026' | 'chile2026' | 'colombia2026',
  options: {
    name: string;
    title: string;
    subtitle: string;
    color: string;
    eventStartDate: string;
    eventEndDate: string;
    eventDateString: string;
    city: string;
    country: string;
    venue: string;
    summary: string;
    stopOrder: number;
    image: string;
    brandingLogo: string;
    speakers: Speaker[];
    agenda: AgendaItem[];
  }
): EventConfig => ({
  id: eventId,
  name: options.name,
  domain: `${eventId}.hashpass.tech`,
  website: `https://blockchainsummit.la/${eventId}/`,
  title: options.title,
  subtitle: options.subtitle,
  image: options.image,
  color: options.color,
  eventStartDate: options.eventStartDate,
  eventEndDate: options.eventEndDate,
  eventDateString: options.eventDateString,
  features: [...BSL_TOUR_SHARED_FEATURES],
  eventType: 'whitelabel',
  branding: {
    primaryColor: options.color,
    secondaryColor: '#06111F',
    logo: options.brandingLogo,
    favicon: '/favicon.ico',
  },
  api: {
    basePath: BSL_API_BASE_PATH,
    endpoints: { ...BSL_SHARED_API_ENDPOINTS },
  },
  routes: {
    home: `/events/${eventId}/home`,
    speakers: `/events/${eventId}/speakers`,
    bookings: `/events/${eventId}/my-bookings`,
    admin: `/events/${eventId}/admin`,
  },
  database: BSL_DATABASE,
  speakers: options.speakers,
  agenda: options.agenda,
  tour: {
    hubEventId: 'bsl',
    role: 'stop',
    stopOrder: options.stopOrder,
    city: options.city,
    country: options.country,
    venue: options.venue,
    summary: options.summary,
  },
  quickAccessItems: makeTourQuickAccess(eventId) as any,
});

export const EVENTS: Record<string, EventConfig> = {
  'bsl': {
    id: 'bsl',
    name: 'Blockchain Summit Latam On Tour',
    domain: 'bsl.hashpass.tech',
    website: 'https://blockchainsummit.la/',
    title: 'BSL On Tour',
    subtitle: 'Peru, Chile and Colombia 2026 roadshow',
    image: '/assets/logos/bsl/bsl-ontour-pro.svg',
    color: '#00A9E0',
    eventDateString: 'BSL On Tour • 2026',
    features: ['matchmaking', 'speakers', 'bookings', 'admin', 'wallet'],
    eventType: 'whitelabel',
    branding: {
      ...BSL_HUB_BRANDING,
    },
    api: {
      basePath: BSL_API_BASE_PATH,
      endpoints: { ...BSL_SHARED_API_ENDPOINTS }
    },
    routes: {
      home: '/events/bsl/home',
      speakers: '/events/bsl/speakers',
      bookings: '/events/bsl/my-bookings',
      admin: '/events/bsl/admin'
    },
    database: {
      schema: 'bslatam',
      tables: {
        speakers: 'bslatam_speakers',
        bookings: 'bslatam_bookings',
        attendees: 'bslatam_attendees',
        wallets: 'wallet_auth'
      }
    },
    tour: {
      hubEventId: 'bsl',
      role: 'hub',
      summary: 'Institutional roadshow across Peru, Chile and Colombia',
    },
    quickAccessItems: makeTourHubQuickAccess() as any
  },
  'peru2026': makeTourStopConfig('peru2026', {
    name: 'BSL Perú 2026',
    title: 'Blockchain Summit Latam Perú 2026',
    subtitle: 'Universidad del Pacífico, Lima',
    color: '#D11A2A',
    eventStartDate: '2026-05-13T09:00:00-05:00',
    eventEndDate: '2026-05-15T23:59:59-05:00',
    eventDateString: 'May 13-15, 2026 • Lima, Perú',
    city: 'Lima',
    country: 'Peru',
    venue: 'Universidad del Pacífico',
    summary: 'Banco Central de Reserva del Perú and institutional finance.',
    stopOrder: 1,
    image: '/assets/logos/bsl/bsl-peru-pro.svg',
    brandingLogo: '/assets/logos/bsl/bsl-peru-pro.svg',
    speakers: [
      { id: 'paul-castillo', name: 'Paul Castillo', title: 'Gerente General', company: 'Banco Central de Reserva del Perú' },
      { id: 'elmer-sanchez', name: 'Elmer Sánchez', title: 'Gerencia de Operaciones Monetarias y Estabilidad Financiera', company: 'Banco Central de Reserva del Perú' },
      { id: 'milton-vega', name: 'Milton Vega', title: 'Deputy Manager Payments and Financial Infraestructures', company: 'Central Bank Peru' },
      { id: 'vanesa-colonia', name: 'Vanesa Colonia', title: 'Coordinadora de Evaluación', company: 'UIF Perú / SBS / AFP' },
      { id: 'judith-vergara', name: 'Judith Vergara', title: 'Director of Executive Education', company: 'School of Finance, Economics and Government @ Universidad EAFIT' },
      { id: 'magdalena-mahia', name: 'Magdalena Mahia', title: 'Team Lead Regulatory & Risk Compliance', company: 'Lemon' },
      { id: 'erick-ortiz', name: 'Erick Ortiz', title: 'Blockchain Advisor / Project Manager Digital Payments', company: 'BBVA Perú' },
      { id: 'juan-jose-miranda', name: 'Juan José Miranda', title: 'Director Innovation Center IC Blockchain/DLT/web3 & QC', company: 'IBIOL NTT DATA' },
      { id: 'alexandre-borelli', name: 'Alexandre Borelli', title: 'CEO Latin America', company: 'Alcazar Group' },
      { id: 'daniel-garcia', name: 'Daniel García', title: 'Superintendente Adjunto de Investigación, Desarrollo e Innovación', company: 'SMV' },
      { id: 'jaime-varela', name: 'Jaime Varela', title: 'Growth Manager Latam', company: 'Binance' },
      { id: 'alireza-siadat', name: 'Alireza Siadat', title: 'Head of Strategy and Policy', company: '1inch' },
      { id: 'fabiana-alvarado', name: 'Fabiana Alvarado', title: 'Asociada Senior', company: 'Damma Legal Advisors' },
      { id: 'omar-castelblanco', name: 'Omar Castelblanco', title: 'Co Founder & CEO', company: 'Relámpago Payments' },
    ],
    agenda: [
      { id: 'peru-day1-reg', time: '08:00 - 09:00', title: 'Registro y café de bienvenida', type: 'registration' },
      { id: 'peru-day1-open', time: '09:00 - 09:15', title: 'Palabras de apertura BSL Lima', type: 'keynote', speakers: ['paul-castillo'] },
      { id: 'peru-day1-keynote', time: '09:20 - 09:50', title: 'Infraestructura financiera y crecimiento de pagos digitales en Perú', type: 'keynote', speakers: ['paul-castillo', 'milton-vega'] },
      { id: 'peru-day1-panel', time: '10:00 - 10:45', title: 'Panel: regulación, banca central y open finance', type: 'panel', speakers: ['elmer-sanchez', 'vanesa-colonia', 'judith-vergara'] },
      { id: 'peru-day1-commercial', time: '11:00 - 11:45', title: 'Panel: transformación digital de la banca comercial y mercados financieros', type: 'panel', speakers: ['magdalena-mahia', 'erick-ortiz', 'alexandre-borelli'] },
      { id: 'peru-day1-lunch', time: '12:00 - 13:30', title: 'Almuerzo libre y networking estratégico', type: 'meal' },
      { id: 'peru-day2-assets', time: '14:00 - 14:45', title: 'Activos digitales institucionales y mercados regulados', type: 'keynote', speakers: ['juan-jose-miranda', 'daniel-garcia'] },
      { id: 'peru-day2-compliance', time: '15:00 - 15:45', title: 'Panel: compliance, custodia y expansión regional', type: 'panel', speakers: ['jaime-varela', 'alireza-siadat', 'judith-vergara'] },
      { id: 'peru-day3-convergence', time: '16:00 - 16:45', title: 'Mesa de convergencia: infraestructura financiera y adopción institucional', type: 'panel', speakers: ['paul-castillo', 'fabiana-alvarado', 'omar-castelblanco'] },
    ],
  }),
  'chile2026': makeTourStopConfig('chile2026', {
    name: 'BSL Chile 2026',
    title: 'Blockchain Summit Latam Chile 2026',
    subtitle: 'Universidad de Chile - FEN, Santiago',
    color: '#FF5B5B',
    eventStartDate: '2026-08-05T09:00:00-04:00',
    eventEndDate: '2026-08-07T23:59:59-04:00',
    eventDateString: 'August 5-7, 2026 • Santiago, Chile',
    city: 'Santiago',
    country: 'Chile',
    venue: 'Universidad de Chile - FEN - Alta Dirección',
    summary: 'Digital finance, payments modernization, and institutional regulation with Banco Central de Chile.',
    stopOrder: 2,
    image: '/assets/logos/bsl/bsl-chile-pro.svg',
    brandingLogo: '/assets/logos/bsl/bsl-chile-pro.svg',
    speakers: [
      { id: 'alberto-naudon', name: 'Alberto Naudon', title: 'Vicepresidente', company: 'Banco Central de Chile' },
      { id: 'rodrigo-sainz', name: 'Rodrigo Sainz', title: 'Founder & CEO', company: 'Blockchain Summit Latam' },
      { id: 'camilo-suarez', name: 'Camilo Suárez', title: 'Co Founder & CEO', company: 'Vurelo' },
      { id: 'alireza-siadat', name: 'Alireza Siadat', title: 'Head of Strategy and Policy', company: '1inch' },
      { id: 'daniel-mangabeira', name: 'Daniel Mangabeira', title: 'Vice President Strategy & Policy, Brazil & Latin America', company: 'Circle' },
      { id: 'steffen-harting', name: 'Steffen Härting', title: 'Senior Manager', company: 'Deloitte: Crypto Asset Markets' },
    ],
    agenda: [
      { id: 'chile-day1-reg', time: '08:00 - 09:00', title: 'Registro y bienvenida ejecutiva', type: 'registration' },
      { id: 'chile-day1-open', time: '09:00 - 09:20', title: 'Apertura BSL Santiago', type: 'keynote', speakers: ['rodrigo-sainz'] },
      { id: 'chile-day1-central-bank', time: '09:30 - 10:00', title: 'Finanzas digitales y estabilidad con el Banco Central de Chile', type: 'keynote', speakers: ['alberto-naudon'] },
      { id: 'chile-day1-payments', time: '10:15 - 11:00', title: 'Infraestructura y sistema de pagos: modernización del mercado chileno', type: 'panel', speakers: ['camilo-suarez', 'alireza-siadat'] },
      { id: 'chile-day2-regulation', time: '11:15 - 12:00', title: 'Estabilidad, regulación y transformación institucional', type: 'panel', speakers: ['daniel-mangabeira', 'steffen-harting'] },
      { id: 'chile-day2-networking', time: '12:00 - 13:30', title: 'Almuerzo libre y conexiones de alto nivel', type: 'meal' },
      { id: 'chile-day3-strategy', time: '14:00 - 14:45', title: 'Convergencia entre sector público y privado', type: 'panel', speakers: ['rodrigo-sainz', 'camilo-suarez', 'alberto-naudon'] },
      { id: 'chile-day3-close', time: '15:00 - 15:30', title: 'Cierre: desarrollo financiero estructural y próximos pasos', type: 'keynote', speakers: ['alireza-siadat'] },
    ],
  }),
  'colombia2026': makeTourStopConfig('colombia2026', {
    name: 'BSL Colombia 2026',
    title: 'Blockchain Summit Latam Colombia 2026',
    subtitle: 'Bogotá, Colombia',
    color: '#F5C542',
    eventStartDate: '2026-11-05T09:00:00-05:00',
    eventEndDate: '2026-11-06T23:59:59-05:00',
    eventDateString: 'November 5-6, 2026 • Bogotá, Colombia',
    city: 'Bogotá',
    country: 'Colombia',
    venue: 'Bogotá, Colombia',
    summary: 'Institutional and regulatory summit for the Andean region with Banco de la República.',
    stopOrder: 3,
    image: '/assets/logos/bsl/bsl-colombia-pro.svg',
    brandingLogo: '/assets/logos/bsl/bsl-colombia-pro.svg',
    speakers: [
      { id: 'leonardo-villar', name: 'Leonardo Villar', title: 'Gerente General', company: 'Banco de la República' },
      { id: 'arlette-salas', name: 'Arlette Salas', title: 'LATAM Growth Lead', company: 'Hive / H.E.R DAO Venezuela' },
      { id: 'rafael-gago', name: 'Rafael Gago', title: 'Director Comercial, Gerencia de Ideación e Incubación', company: 'nuam exchange' },
      { id: 'andres-meneses', name: 'Andrés Meneses', title: 'Founder', company: 'Orbyt X' },
      { id: 'rafael-teruszkin', name: 'Rafael Teruszkin', title: 'Head Latam', company: 'Bitpanda Technology Solutions' },
      { id: 'liz-bejarano', name: 'Liz Bejarano', title: 'Directora Financiera y de Riesgo', company: 'Asobancaria' },
      { id: 'albi-rodriguez', name: 'Albi Rodríguez', title: 'Senior Web3 & DLT Consultant', company: 'Independent' },
      { id: 'judith-vergara', name: 'Judith Vergara', title: 'Director of Executive Education', company: 'Universidad EAFIT' },
      { id: 'william-duran', name: 'William Durán', title: 'CO-CEO & Founder', company: 'Minteo' },
      { id: 'daniel-aguilar', name: 'Daniel Aguilar', title: 'Co Founder & COO', company: 'Trokera' },
      { id: 'pablo-santos', name: 'Pablo Santos', title: 'Founder & CEO', company: 'Finaktiva' },
      { id: 'ana-maria-zuluaga', name: 'Ana María Zuluaga', title: 'Head of Open Finance Office', company: 'Grupo Aval' },
    ],
    agenda: [
      { id: 'colombia-day1-reg', time: '08:00 - 09:00', title: 'Registro y bienvenida institucional', type: 'registration' },
      { id: 'colombia-day1-open', time: '09:00 - 09:20', title: 'Apertura BSL Bogotá', type: 'keynote', speakers: ['leonardo-villar'] },
      { id: 'colombia-day1-central-bank', time: '09:30 - 10:00', title: 'Infraestructura financiera y pagos modernos', type: 'keynote', speakers: ['leonardo-villar'] },
      { id: 'colombia-day1-regulation', time: '10:15 - 11:00', title: 'Marco regulatorio y banca central en la era digital', type: 'panel', speakers: ['liz-bejarano', 'albi-rodriguez', 'judith-vergara'] },
      { id: 'colombia-day2-open-finance', time: '11:15 - 12:00', title: 'Open finance, tokenización y mercados institucionales', type: 'panel', speakers: ['rafael-gago', 'andres-meneses', 'ana-maria-zuluaga'] },
      { id: 'colombia-day2-lunch', time: '12:00 - 13:30', title: 'Almuerzo libre y networking estratégico', type: 'meal' },
      { id: 'colombia-day2-strategy', time: '14:00 - 14:45', title: 'Diálogo estratégico entre sector público, banca y mercados', type: 'panel', speakers: ['rafael-teruszkin', 'william-duran', 'daniel-aguilar'] },
      { id: 'colombia-day2-close', time: '15:00 - 15:30', title: 'Cierre: impacto económico, innovación e inclusión', type: 'keynote', speakers: ['pablo-santos', 'arlette-salas'] },
    ],
  }),
  'bsl2025': {
    id: 'bsl2025',
    name: 'BSL 2025',
    domain: 'bsl2025.hashpass.tech',
    website: 'https://blockchainsummit.la/',
    title: 'Blockchain Summit Latam 2025',
    subtitle: 'Universidad EAFIT, Medellín',
    image: '/assets/images/bsl2025-hero.svg',
    color: '#2196F3',
    eventStartDate: '2025-11-12T09:00:00-05:00',
    eventEndDate: '2025-11-14T23:59:59-05:00',
    eventDateString: 'November 12-14, 2025 • Medellín, Colombia',
    features: ['matchmaking', 'speakers', 'bookings', 'admin'],
    eventType: 'whitelabel',
    branding: {
      primaryColor: '#2196F3',
      secondaryColor: '#34A853',
      logo: '/assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.svg',
      favicon: '/favicon.ico'
    },
    api: {
      basePath: '/api/bslatam',
      endpoints: {
        speakers: 'speakers',
        bookings: 'bookings',
        'verify-ticket': 'verify-ticket',
        'auto-match': 'auto-match',
        agenda: 'agenda',
        status: 'status'
      }
    },
    routes: {
      home: '/events/bsl2025/home',
      speakers: '/events/bsl2025/speakers',
      bookings: '/events/bsl2025/my-bookings',
      admin: '/events/bsl2025/admin'
    },
    database: {
      schema: 'bslatam',
      tables: {
        speakers: 'bslatam_speakers',
        bookings: 'bslatam_bookings',
        attendees: 'bslatam_attendees'
      }
    },
    tour: {
      hubEventId: 'bsl',
      role: 'archive',
      stopOrder: 99,
      city: 'Medellín',
      country: 'Colombia',
      venue: 'Universidad EAFIT',
      summary: 'Archived 2025 edition of Blockchain Summit Latam.',
    },
    speakers: [
      { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Claudia Restrepo', title: 'Rectora', company: 'EAFIT' },
      { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Leonardo Villar', title: 'Gerente General', company: 'Banco de la República' },
      { id: '550e8400-e29b-41d4-a716-446655440003', name: 'César Ferrari', title: 'Superintendente Financiero de Colombia', company: 'Superintendencia Financiera' },
      { id: '550e8400-e29b-41d4-a716-446655440004', name: 'Alberto Naudon', title: 'Consejero', company: 'Banco Central de Chile' },
      { id: '550e8400-e29b-41d4-a716-446655440005', name: 'José Outumuro', title: 'Director Institutional sales EMEA', company: 'Crypto.com' },
      { id: '550e8400-e29b-41d4-a716-446655440006', name: 'Efraín Barraza', title: 'Regional Expansion Manager - Latam', company: 'Tether' },
      { id: '550e8400-e29b-41d4-a716-446655440007', name: 'Sandra Meza', title: 'Vicepresidente Control Interno y Cumplimiento', company: 'BBVA' },
      { id: '550e8400-e29b-41d4-a716-446655440008', name: 'Sebastián Durán', title: 'Subdirector de Regulación', company: 'Superintendencia Financiera de Colombia' },
      { id: '550e8400-e29b-41d4-a716-446655440009', name: 'Rocelo Lopes', title: 'CEO', company: 'SmartPay' },
      { id: '550e8400-e29b-41d4-a716-446655440010', name: 'Ana Garcés', title: 'Chief Compliance Officer', company: 'Banco BHD' },
      { id: '550e8400-e29b-41d4-a716-446655440011', name: 'Juan Carlos Reyes', title: 'Presidente', company: 'Comisión Nacional de Activos Digitales (CNAD) El Salvador' },
      { id: '550e8400-e29b-41d4-a716-446655440012', name: 'Gabriel Santos', title: 'Presidente Ejecutivo', company: 'Colombia FinTech' },
      { id: '550e8400-e29b-41d4-a716-446655440013', name: 'César Tamayo', title: 'Dean, School of Finance, Economics & Government', company: 'Universidad EAFIT' },
      { id: '550e8400-e29b-41d4-a716-446655440014', name: 'Daniel Mangabeira', title: 'Vice President Strategy & Policy, Brazil & Latin America', company: 'Circle' },
      { id: '550e8400-e29b-41d4-a716-446655440015', name: 'Juan Pablo Rodríguez', title: 'Socio de rics management', company: 'Colombia y Guatemala' },
      { id: '550e8400-e29b-41d4-a716-446655440016', name: 'Willian Santos', title: 'Gerente de Compliance - Oficial de Cumplimiento', company: 'Banco W' },
      { id: '550e8400-e29b-41d4-a716-446655440017', name: 'Rocío Alvarez-Ossorio', title: 'Founder & CEO', company: 'Hator' },
      { id: '550e8400-e29b-41d4-a716-446655440018', name: 'Steffen Härting', title: 'Senior Manager', company: 'Deloitte: Crypto Asset Markets' },
      { id: '550e8400-e29b-41d4-a716-446655440019', name: 'Diego Fernández', title: 'Gerente Corporativo de Innovación', company: 'nuam' },
      { id: '550e8400-e29b-41d4-a716-446655440020', name: 'Andres Florido', title: 'Senior Manager - Blockchain & AI Assurance', company: 'Deloitte' },
      { id: '550e8400-e29b-41d4-a716-446655440021', name: 'Liz Bejarano', title: 'Directora Financiera y de Riesgo', company: 'Asobancaria' },
      { id: '550e8400-e29b-41d4-a716-446655440022', name: 'Andrés Meneses', title: 'Founder', company: 'Orbyt X' },
      { id: '550e8400-e29b-41d4-a716-446655440023', name: 'Luther Maday', title: 'Head of Payments', company: 'Algorand Foundation' },
      { id: '550e8400-e29b-41d4-a716-446655440024', name: 'Rafael Teruszkin', title: 'Head Latam', company: 'Bitpanda Technology Solutions' },
      { id: '550e8400-e29b-41d4-a716-446655440025', name: 'Albi Rodríguez', title: 'Senior Web3 & DLT Consultant', company: 'Independent' },
      { id: '26', name: 'Judith Vergara', title: 'Director of Executive Education', company: 'Universidad EAFIT' },
      { id: '27', name: 'William Durán', title: 'CO-CEO & Founder', company: 'Minteo' },
      { id: '28', name: 'Daniel Aguilar', title: 'Co Founder & COO', company: 'Trokera' },
      { id: '29', name: 'Rafael Gago', title: 'Director Comercial, Gerencia de Ideación e Incubación', company: 'nuam exchange' },
      { id: '30', name: 'Pablo Santos', title: 'Founder & CEO', company: 'Finaktiva' },
      { id: '31', name: 'Ana María Zuluaga', title: 'Head of Open Finance Office', company: 'Grupo Aval' },
      { id: '32', name: 'Alireza Siadat', title: 'Head of Strategy and Policy', company: '1inch' },
      { id: '33', name: 'Omar Castelblanco', title: 'Co Founder & CEO', company: 'Relámpago Payments' },
      { id: '34', name: 'Juan Pablo Salazar', title: 'Head of Legal, Regulatory Affairs y Compliance', company: 'Ripio USA y Colombia' },
      { id: '35', name: 'Pedro Gutiérrez', title: 'Head of Partnerships', company: 'LNET' },
      { id: '36', name: 'Marcos Carpio', title: 'Co-Founder & CFO', company: 'Tokelab' },
      { id: '37', name: 'Nathaly Diniz', title: 'Chief Revenue Officer', company: 'Lumx' },
      { id: '38', name: 'Santiago Mejía', title: 'Chief Sales Officer', company: 'Lulo bank' },
      { id: '39', name: 'Andrés González', title: 'Co Founder & CEO', company: 'indahouse' },
      { id: '40', name: 'Stephanie Sánchez', title: 'Asociada', company: 'Fayca' },
      { id: '41', name: 'Albert Prat', title: 'Fundador', company: 'Beself Brands' },
      { id: '42', name: 'Mónica Arellano', title: 'Managing Director - Stablecoins', company: 'Anchorage' },
      { id: '43', name: 'Camilo Suárez', title: 'Co Founder & CEO', company: 'Vurelo' },
      { id: '44', name: 'Daniel Marulanda', title: 'Co Founder & CEO', company: 'Trokera' },
      { id: '45', name: 'Carlos Salinas', title: 'Head of Digital Assets', company: 'Mora Banc' },
      { id: '46', name: 'David Yao', title: 'Principal', company: 'LBanks Labs' },
      { id: '47', name: 'María Fernanda Marín', title: 'Compliance Officer', company: 'DJIRO' },
      { id: '48', name: 'Kieve Huffman', title: 'Founder and Chief Revenue Officer', company: 'Engager' },
      { id: '49', name: 'Matias Marmisolle', title: 'Co Founder & CEO', company: 'Anzi Finance' },
      { id: '50', name: 'Karol Benavides', title: 'Regional Head – LATAM Partnerships & Strategy', company: 'Fiskil' },
      { id: '51', name: 'Camilo Romero', title: 'Co Fundador y CEO', company: 'Spyral Labs' },
      { id: '52', name: 'José Manuel Souto', title: 'Consultor Internacional en Compliance y Criptoactivos', company: 'Grupo Vishab y PRIUS Consulting' },
      { id: '53', name: 'Edison Montoya', title: 'Director', company: 'Finhub EAFIT' },
      { id: '54', name: 'Fernando Quirós', title: 'Managing Editor', company: 'Cointelegraph en Español' },
      { id: '55', name: 'Mariangel García', title: 'Co-Founder', company: 'Women In Investment Network' },
      { id: '56', name: 'Edward Calderón', title: 'CEO', company: 'HashPass' },
      { id: '57', name: 'Roberto Darrigrandi', title: 'Socio', company: 'Altadirección Capital Latam' },
      { id: '58', name: 'Ed Marquez', title: 'Head of Developer Relations', company: 'Hashgraph' },
      { id: '59', name: 'Diego Osuna', title: 'CEO y Co Founder', company: 'MonaBit' },
      { id: '60', name: 'Paula Bermúdez', title: 'Abogada - Founder & CEO', company: 'Digitalaw' },
      { id: '61', name: 'Gerardo Lagos', title: 'Co-Founder', company: 'ObsidiaLab' },
      { id: '62', name: 'Mireya Acosta', title: 'Co founder', company: 'ColocaPayments' },
      { id: '63', name: '0xj4an', title: 'Advisor', company: 'Celo Colombia' },
      { id: '64', name: 'Camilo Serna', title: 'Head of Product', company: 'Kravata' },
      { id: '65', name: 'Michelle Arguelles', title: 'CEO', company: 'M.A Global Accounting' },
      { id: '66', name: 'Sebastián Ramírez', title: 'Developer', company: 'TuCOP' },
      { id: '67', name: 'Ximena Monclou', title: 'Abogada y Contadora', company: 'Celo Colombia' },
      { id: '68', name: 'Oscar Moratto', title: 'Director General', company: 'Beyond Risk SAS' },
      { id: '69', name: 'Rodrigo Sainz', title: 'Founder & CEO', company: 'Blockchain Summit Latam' }
    ],
    agenda: [
      { id: '1', time: '08:00 - 09:00', title: 'Registro y café de bienvenida', type: 'registration' },
      { id: '2', time: '09:00 - 09:15', title: 'Palabras de apertura – Rectora de la Universidad EAFIT', type: 'keynote', speakers: ['Claudia Restrepo'] },
      { id: '3', time: '09:20 – 09:45', title: 'Keynote – "Red regional de pruebas para dinero tokenizado"', type: 'keynote' },
      { id: '4', time: '09:50 – 10:25', title: 'Keynote – "Infraestructura Financiera Global del Futuro"', type: 'keynote' },
      { id: '5', time: '10:35 – 11:05', title: 'Keynote – Colombia Fintech – "El Rol de las Fintech en la Adopción del Dinero Digital en América Latina"', type: 'keynote', speakers: ['Gabriel Santos'] },
      { id: '6', time: '11:10 – 11:45', title: 'Keynote – Superintendencia Financiera de Colombia – "El futuro de la supervisión y regulación financiera en la era digital"', type: 'keynote', speakers: ['César Ferrari'] },
      { id: '7', time: '11:50 – 13:00', title: 'Panel – "CBDCs y el Futuro del Dinero en LatAm"', type: 'panel' },
      { id: '8', time: '13:00 – 14:30', title: 'Almuerzo Libre', type: 'meal' },
      { id: '9', time: '14:35 – 15:05', title: 'Keynote – "Activos Digitales, Blockchain y Tokenización de Activos"', type: 'keynote' },
      { id: '10', time: '15:10 – 16:20', title: 'Panel (Bancos Comerciales) – "Transformación Digital de la Banca Tradicional"', type: 'panel' },
      { id: '11', time: '16:25 – 17:35', title: 'Panel (Reguladores) – "Marco regulatorio para la innovación financiera en LatAm"', type: 'panel' },
      { id: '12', time: '17:40 – 18:30', title: 'Panel – "El Futuro del Dinero Digital: Innovación, Confianza y Colaboración en LATAM"', type: 'panel' }
    ],
    quickAccessItems: [
      { id: 'agenda', title: 'Event Agenda', subtitle: '3 Days Schedule', icon: 'event', color: '#34A853', route: '/events/bsl2025/agenda' },
      { id: 'networking', title: 'Networking Center', subtitle: 'Connect & meet', icon: 'people-alt', color: '#4CAF50', route: '/events/bsl2025/networking' },
      { id: 'speakers', title: 'Featured Speakers', subtitle: 'Meet the experts', icon: 'people', color: '#007AFF', route: '/events/bsl2025/speakers/calendar' },
      { id: 'event-info', title: 'Event Information', subtitle: 'Details & Logistics', icon: 'info', color: '#FF9500', route: '/events/bsl2025/event-info' }
    ]
  },
  'default': {
    id: 'default',
    name: 'HashPass',
    domain: 'hashpass.tech',
    title: 'HashPass',
    subtitle: 'Digital Identity & Wallet Platform',
    image: '/assets/images/hashpass-banner.jpg',
    color: '#6366f1',
    features: ['auth', 'dashboard', 'wallet'],
    eventType: 'hashpass',
    branding: {
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      logo: '/assets/logos/hashpass/logo-full-hashpass-white.svg',
      favicon: '/favicon.ico'
    },
    api: {
      basePath: '/api',
      endpoints: { auth: '/api/auth', users: '/api/users' }
    },
    routes: {
      home: '/',
      speakers: '/(shared)/dashboard/explore',
      bookings: '/(shared)/dashboard/wallet'
    }
  }
} as const;

export type EventId = keyof typeof EVENTS;
