import type { AgendaItem, EventConfig, Speaker } from '@hashpass/types';

export type { Speaker, AgendaItem, EventConfig } from '@hashpass/types';

const BSL_API_BASE_PATH = '/api/bsl';
// Speaker photos are hosted on our own S3 bucket (target AWS account), not
// scraped/hotlinked from blockchainsummit.la at runtime -- see
// hashpass-production-event-media-952191196420-us-east-2/events/chile2026/speakers/.
const CHILE2026_SPEAKER_IMAGE_BASE =
  'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/chile2026/speakers';
const BSL_DATABASE = {
  schema: 'bsl',
  tables: {
    speakers: 'bsl_speakers',
    bookings: 'bsl_bookings',
    attendees: 'bsl_attendees',
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
    dayThemes?: Record<string, { es: string; en: string }>;
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
  dayThemes: options.dayThemes,
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
      schema: 'bsl',
      tables: {
        speakers: 'bsl_speakers',
        bookings: 'bsl_bookings',
        attendees: 'bsl_attendees',
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
      { id: 'peru-day1-reg', day: '1', time: '08:00 - 09:00', title: 'Registro y café de bienvenida', type: 'registration' },
      { id: 'peru-day1-open', day: '1', time: '09:00 - 09:15', title: 'Palabras de apertura BSL Lima', type: 'keynote', speakers: ['paul-castillo'] },
      { id: 'peru-day1-keynote', day: '1', time: '09:20 - 09:50', title: 'Infraestructura financiera y crecimiento de pagos digitales en Perú', type: 'keynote', speakers: ['paul-castillo', 'milton-vega'] },
      { id: 'peru-day1-panel', day: '1', time: '10:00 - 10:45', title: 'Panel: regulación, banca central y open finance', type: 'panel', speakers: ['elmer-sanchez', 'vanesa-colonia', 'judith-vergara'] },
      { id: 'peru-day1-commercial', day: '1', time: '11:00 - 11:45', title: 'Panel: transformación digital de la banca comercial y mercados financieros', type: 'panel', speakers: ['magdalena-mahia', 'erick-ortiz', 'alexandre-borelli'] },
      { id: 'peru-day1-lunch', day: '1', time: '12:00 - 13:30', title: 'Almuerzo libre y networking estratégico', type: 'meal' },
      { id: 'peru-day2-assets', day: '2', time: '14:00 - 14:45', title: 'Activos digitales institucionales y mercados regulados', type: 'keynote', speakers: ['juan-jose-miranda', 'daniel-garcia'] },
      { id: 'peru-day2-compliance', day: '2', time: '15:00 - 15:45', title: 'Panel: compliance, custodia y expansión regional', type: 'panel', speakers: ['jaime-varela', 'alireza-siadat', 'judith-vergara'] },
      { id: 'peru-day3-convergence', day: '3', time: '16:00 - 16:45', title: 'Mesa de convergencia: infraestructura financiera y adopción institucional', type: 'panel', speakers: ['paul-castillo', 'fabiana-alvarado', 'omar-castelblanco'] },
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
    // Verified against https://blockchainsummit.la/chile2026/ -- these are
    // this stop's own published day themes, not the original bsl2025 hub
    // event's (which agenda.tsx's getTabTheme was previously hardcoded to
    // show for every tour-stop event regardless of which one was open).
    dayThemes: {
      '1': { es: 'Regulación, Supervisión y Evolución Institucional', en: 'Regulation, Supervision and Institutional Evolution' },
      '2': { es: 'Tokenización, Stablecoins y Nueva Infraestructura Financiera', en: 'Tokenization, Stablecoins and New Financial Infrastructure' },
      '3': { es: 'Integración Financiera Global y Sistema Financiero 2030', en: 'Global Financial Integration and the Financial System of 2030' },
    },
    speakers: [
      { id: 'alberto-naudon', name: 'Alberto Naudon', title: 'Vice President', company: 'Banco Central de Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/alberto-naudon.webp` },
      { id: 'alvaro-clarke', name: 'Álvaro Clarke', title: 'Executive Director of Executive Education', company: 'Facultad de Economía y Negocios, Universidad de Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/alvaro-clarke.webp` },
      { id: 'claudia-sotelo', name: 'Claudia Sotelo', title: 'Head Financial Innovation Center', company: 'Comisión para el Mercado Financiero (CMF), Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/claudia-sotelo.webp` },
      { id: 'francisco-del-olmo', name: 'Francisco Del Olmo', title: 'Subdirector responsible for Fintech and Cybersecurity', company: 'CNMV Spain', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/francisco-del-olmo.webp` },
      { id: 'renzo-alvarado', name: 'Renzo Alvarado', title: 'Principal Supervisor of Market Risk, Liquidity and Investments', company: 'SBS Peru', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/renzo-alvarado.webp` },
      { id: 'juan-carlos-reyes', name: 'Juan Carlos Reyes', title: 'President', company: 'Comisión Nacional de Activos Digitales (CNAD), El Salvador', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/juan-carlos-reyes.webp` },
      { id: 'camila-santana', name: 'Camila Santana', title: 'Chief Compliance Officer', company: 'Banco Revolut', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/camila-santana.webp` },
      { id: 'daniel-do-nascimento-petiz', name: 'Daniel do Nascimento Petiz', title: 'Auditor', company: 'Banco Central do Brasil (BACEN)', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/daniel-do-nascimento-petiz.webp` },
      { id: 'ximena-rojas', name: 'Ximena Rojas', title: 'VP Legal and Public Affairs', company: 'Khipu', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/ximena-rojas.webp` },
      { id: 'jose-manuel-mena', name: 'José Manuel Mena', title: 'President', company: 'Asociación de Bancos e Instituciones Financieras (ABIF)', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/jose-manuel-mena.webp` },
      { id: 'juan-pablo-cordoba', name: 'Juan Pablo Córdoba', title: 'CEO', company: 'nuam', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/juan-pablo-cordoba.webp` },
      { id: 'sarina-gowland', name: 'Sarina Gowland', title: 'Sales Director', company: 'Fireblocks', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/sarina-gowland.webp` },
      { id: 'luisa-cardenas', name: 'Luisa Cárdenas', title: 'CEO', company: 'SURED', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/luisa-cardenas.webp` },
      { id: 'juan-pablo-rodriguez', name: 'Juan Pablo Rodríguez', title: 'Partner', company: 'RICS Management Colombia and Guatemala', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/juan-pablo-rodriguez.webp` },
      { id: 'antonio-sundas', name: 'Antonio Sundas', title: 'Senior Growth Manager', company: 'Crypto Finance Group – Deutsche Börse Group', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/antonio-sundas.webp` },
      { id: 'steffen-harting', name: 'Steffen Härting', title: 'Senior Manager', company: 'Deloitte: Crypto Asset Markets', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/steffen-harting.webp` },
      { id: 'regina-pedroso', name: 'Regina Pedroso', title: 'Executive Director', company: 'ABToken', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/regina-pedroso.webp` },
      { id: 'maria-luisa-acuna', name: 'María Luisa Acuña', title: 'Cybersecurity Lead Managing Director', company: 'Accenture Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/maria-luisa-acuna.webp` },
      { id: 'willian-santos', name: 'Willian Santos', title: 'Compliance Manager - Chief Compliance Officer', company: 'Banco W', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/willian-santos.webp` },
      { id: 'rafael-teruszkin', name: 'Rafael Teruszkin', title: 'Head Latam', company: 'Bitpanda Technology Solutions', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/rafael-teruszkin.webp` },
      { id: 'mauricio-jara', name: 'Mauricio Jara', title: 'Director', company: 'Departamento de Administración, FEN-UChile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/mauricio-jara.webp` },
      { id: 'albi-rodriguez', name: 'Albi Rodríguez', title: 'Senior Web3 & DLT Consultant', company: 'Independent', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/albi-rodriguez.webp` },
      { id: 'guillermo-acuna', name: 'Guillermo Acuña', title: 'Co-founder and CTO', company: 'Koywe', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/guillermo-acuna.webp` },
      { id: 'sylvia-sanchez', name: 'Sylvia Sánchez', title: 'Project Manager', company: 'Ava Labs', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/sylvia-sanchez.webp` },
      { id: 'erick-ortiz', name: 'Erick Ortiz', title: 'Blockchain Advisor / Project Manager Digital Payments', company: 'BBVA Perú', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/erick-ortiz.webp` },
      { id: 'jose-gabriel-carrasco', name: 'José Gabriel Carrasco', title: 'President', company: 'FinteChile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/jose-gabriel-carrasco.webp` },
      { id: 'judith-vergara', name: 'Judith Vergara', title: 'Director of Executive Education', company: 'Universidad EAFIT', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/judith-vergara.webp` },
      { id: 'aldo-fuertes', name: 'Aldo Fuertes', title: 'Executive Director', company: 'Core Capital Group', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/aldo-fuertes.webp` },
      { id: 'vicente-lazen', name: 'Vicente Lazen', title: 'Consultant in capital markets and digital assets', company: 'Symbioflow.io', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/vicente-lazen.webp` },
      { id: 'ana-garces', name: 'Ana Garcés', title: 'Chief Compliance Officer', company: 'Banco BHD', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/ana-garces.webp` },
      { id: 'jaime-bunzli', name: 'Jaime Bünzli', title: 'CEO', company: 'Buda.com', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/jaime-bunzli.webp` },
      { id: 'guido-messi', name: 'Guido Messi', title: 'Head of Corporate Development', company: 'Ripio', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/guido-messi.webp` },
      { id: 'daniel-aguilar', name: 'Daniel Aguilar', title: 'Co Founder & COO', company: 'Trokera', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/daniel-aguilar.webp` },
      { id: 'lissa-parra', name: 'Lissa Parra', title: 'Principal Associate', company: 'Estudio de Abogados Garrigues Colombia', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/lissa-parra.webp` },
      { id: 'claudio-calderon', name: 'Claudio Calderón', title: 'Leader of Strategic Projects', company: 'Depósito Central de Valores (DCV), Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/claudio-calderon.webp` },
      { id: 'juan-antonio-figueroa', name: 'Juan Antonio Figueroa', title: 'Executive Director', company: 'ChilePay', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/juan-antonio-figueroa.webp` },
      { id: 'daniel-hernandez', name: 'Daniel Hernández', title: 'Principal Associate', company: 'Estudio de Abogados Garrigues Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/daniel-hernandez.webp` },
      { id: 'ignacio-araya', name: 'Ignacio Araya', title: 'Commercial Law Professor', company: 'USACH and Universidad de Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/ignacio-araya.webp` },
      { id: 'omar-castelblanco', name: 'Omar Castelblanco', title: 'Co Founder & CEO', company: 'Relámpago Payments', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/omar-castelblanco.webp` },
      { id: 'alexandre-borelli', name: 'Alexandre Borelli', title: 'CEO Latin America', company: 'Alcazar Group', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/alexandre-borelli.webp` },
      { id: 'nathaly-diniz', name: 'Nathaly Diniz', title: 'Chief Revenue Officer', company: 'Lumx', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/nathaly-diniz.webp` },
      { id: 'juan-jose-miranda', name: 'Juan José Miranda', title: 'Director Innovation Center IC Blockchain/DLT/web3 & QC', company: 'IBIOL NTT DATA', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/juan-jose-miranda.webp` },
      { id: 'roberto-darrigrandi', name: 'Roberto Darrigrandi', title: 'Partner', company: 'Altadirección Capital Latam', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/roberto-darrigrandi.webp` },
      { id: 'stephanie-sanchez', name: 'Stephanie Sánchez', title: 'MissCryptoLawyer / Founder & CEO', company: 'BlockRock', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/stephanie-sanchez.webp` },
      { id: 'camilo-suarez', name: 'Camilo Suárez', title: 'Co Founder & CEO', company: 'Vurelo', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/camilo-suarez.webp` },
      { id: 'sebastian-zapata', name: 'Sebastián Zapata', title: 'Head of Legal', company: 'Bitso', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/sebastian-zapata.webp` },
      { id: 'david-diaz', name: 'David Díaz', title: 'Assistant Professor', company: 'Departamento de Administración, FEN-UChile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/david-diaz.webp` },
      { id: 'karol-benavides', name: 'Karol Benavides', title: 'Regional Head – LATAM Partnerships & Strategy', company: 'Fiskil', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/karol-benavides.webp` },
      { id: 'camilo-romero', name: 'Camilo Romero', title: 'Consultant in Digital Financial Infrastructure', company: 'Colombia', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/camilo-romero.webp` },
      { id: 'bernardo-janot', name: 'Bernardo Janot', title: 'LATAM Lead', company: 'IBM Digital Asset Haven', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/bernardo-janot.webp` },
      { id: 'jose-manuel-souto', name: 'José Manuel Souto', title: 'International Consultant in Compliance and Crypto Assets', company: 'Grupo Vishab and PRIUS Consulting', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/jose-manuel-souto.webp` },
      { id: 'fernando-quiros', name: 'Fernando Quirós', title: 'Managing Editor', company: 'Cointelegraph en Español', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/fernando-quiros.webp` },
      { id: 'leandro-pereira', name: 'Leandro Pereira', title: 'VP of LATAM', company: 'Dfns', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/leandro-pereira.webp` },
      { id: 'alexis-franco', name: 'Alexis Franco', title: 'President', company: 'Cámara Blockchain Chile', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/alexis-franco.webp` },
      { id: 'paula-bermudez', name: 'Paula Bermúdez', title: 'Lawyer - Founder & CEO', company: 'Digitalaw (Colombia)', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/paula-bermudez.webp` },
      { id: 'jorge-corredor', name: 'Jorge Corredor', title: 'Assistant Professor and Consultant', company: 'Universidad Externado Colombia', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/jorge-corredor.webp` },
      { id: 'gerardo-lagos', name: 'Gerardo Lagos', title: 'Co-Founder', company: 'ObsidiaLab', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/gerardo-lagos.webp` },
      { id: 'angel-di-matteo', name: 'Angel Di Matteo', title: 'Co-Founder and Editor', company: 'DiarioBitcoin', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/angel-di-matteo.webp` },
      { id: 'michelle-arguelles', name: 'Michelle Arguelles', title: 'CEO', company: 'M.A Global Accounting', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/michelle-arguelles.webp` },
      { id: 'rodrigo-sainz', name: 'Rodrigo Sainz', title: 'Founder & CEO', company: 'Blockchain Summit Latam', image: `${CHILE2026_SPEAKER_IMAGE_BASE}/rodrigo-sainz.webp` },
      { id: 'pedro-zegers', name: 'Pedro Zegers', title: 'Executive Director', company: 'ChilePay' },
      { id: 'tomas-dominguez', name: 'Tomás Domínguez', title: 'Head of Crypto', company: 'Koywe' },
    ],
    agenda: [
      { id: 'chile-day1-welcome-cocktail-registration-coffee', day: '1', time: '08:30-09:30', title: 'Welcome cocktail, registration, coffee & sponsor booths opening', type: 'registration' },
      { id: 'chile-day1-opening-remarks', day: '1', time: '09:30-09:40', title: 'Opening remarks', type: 'keynote', speakers: ['rodrigo-sainz'] },
      { id: 'chile-day1-open-finance-and-regulatory', day: '1', time: '09:45-10:10', title: 'Open Finance and regulatory transformation of Chilean financial system', type: 'keynote', speakers: ['claudia-sotelo'] },
      { id: 'chile-day1-mica-regulatory-sandboxes-and', day: '1', time: '10:15-10:40', title: 'MiCA, regulatory sandboxes and evolution of European financial markets', type: 'keynote', speakers: ['francisco-del-olmo'] },
      { id: 'chile-day1-digital-transformation-of-banking', day: '1', time: '10:45-11:10', title: 'Digital transformation of banking and Latin American financial system evolution', type: 'keynote', speakers: ['jose-manuel-mena'] },
      { id: 'chile-day1-digital-assets-el-salvador', day: '1', time: '11:15-11:40', title: 'Digital Assets, El Salvador\'s experience', type: 'keynote', speakers: ['juan-carlos-reyes'] },
      { id: 'chile-day1-building-new-financial-infrastructure', day: '1', time: '11:45-12:05', title: 'Building new financial infrastructure: European perspectives', type: 'keynote', speakers: ['steffen-harting'] },
      { id: 'chile-day1-networking-coffee-lunch-sponsor', day: '1', time: '12:00-13:00', title: 'Networking + Coffee lunch + sponsor booths', type: 'meal' },
      { id: 'chile-day1-virtual-asset-market-regulation', day: '1', time: '13:00-13:25', title: 'Virtual asset market regulation: comparative perspectives and international evolution', type: 'keynote', speakers: ['daniel-do-nascimento-petiz'] },
      { id: 'chile-day1-panel-financial-infrastructure-and', day: '1', time: '13:30-14:20', title: 'Panel: Financial infrastructure and banking system transformation', type: 'panel', speakers: ['judith-vergara', 'erick-ortiz', 'willian-santos', 'juan-antonio-figueroa', 'pedro-zegers'] },
      { id: 'chile-day1-compliance-licenses-and-international', day: '1', time: '14:25-14:50', title: 'Compliance, licenses and international expansion: building global financial institutions', type: 'keynote', speakers: ['camila-santana'] },
      { id: 'chile-day1-panel-new-global-financial', day: '1', time: '14:55-15:45', title: 'Panel: New global financial architecture: regulation, infrastructure and system transformation', type: 'panel', speakers: ['david-diaz', 'juan-carlos-reyes', 'daniel-do-nascimento-petiz', 'francisco-del-olmo', 'renzo-alvarado'] },
      { id: 'chile-day1-extended-networking-day-1', day: '1', time: '15:45-16:30', title: 'Extended networking + Day 1 closing', type: 'break' },
      { id: 'chile-day2-welcome-coffee-networking-sponsor', day: '2', time: '08:30-09:30', title: 'Welcome coffee + networking + sponsor booths opening', type: 'registration' },
      { id: 'chile-day2-from-traditional-payments-to', day: '2', time: '09:30-09:55', title: 'From traditional payments to new financial infrastructure: inclusion, interoperability and digital assets', type: 'keynote', speakers: ['luisa-cardenas'] },
      { id: 'chile-day2-panel-capital-markets-in', day: '2', time: '10:00-10:50', title: 'Panel: Capital markets in transformation: tokenization, new digital assets and institutional adoption', type: 'panel', speakers: ['roberto-darrigrandi', 'alexandre-borelli', 'rafael-teruszkin', 'aldo-fuertes', 'antonio-sundas'] },
      { id: 'chile-day2-from-innovation-to-infrastructure', day: '2', time: '10:55-11:20', title: 'From innovation to infrastructure: AI, blockchain and financial core modernization', type: 'keynote', speakers: ['juan-jose-miranda'] },
      { id: 'chile-day2-tokenization-evolution-of-the', day: '2', time: '11:25-11:50', title: 'Tokenization: Evolution of the financial market', type: 'keynote', speakers: ['rodrigo-sainz'] },
      { id: 'chile-day2-stablecoins-beyond-the-dollar', day: '2', time: '11:55-12:20', title: 'Stablecoins, beyond the dollar', type: 'keynote', speakers: ['guillermo-acuna'] },
      { id: 'chile-day2-networking-coffee-lunch-sponsor', day: '2', time: '12:00-13:00', title: 'Networking + Coffee lunch + sponsor booths', type: 'meal' },
      { id: 'chile-day2-workshop-cross-border-payments', day: '2', time: '11:00-12:00', title: 'Workshop: Your agent operates, you sign: cross-border payments with AI and stablecoins', type: 'panel', speakers: ['tomas-dominguez'], location: 'Room H202 - Floor 2' },
      { id: 'chile-day2-panel-stablecoins-as-financial', day: '2', time: '13:00-13:50', title: 'Panel: Stablecoins as financial infrastructure and banking system integration: compliance risks and challenges', type: 'panel', speakers: ['juan-pablo-rodriguez', 'guido-messi', 'camila-santana', 'omar-castelblanco', 'leandro-pereira'] },
      { id: 'chile-day2-cybersecurity-landscape-financial-sector', day: '2', time: '13:55-14:20', title: 'Cybersecurity landscape in the financial sector', type: 'keynote', speakers: ['maria-luisa-acuna'] },
      { id: 'chile-day2-panel-new-global-financial', day: '2', time: '14:25-15:15', title: 'Panel: New global financial architecture: cross-border payments, stablecoins and tokenized financial infrastructure evolution', type: 'panel', speakers: ['camilo-romero', 'luisa-cardenas', 'sarina-gowland', 'jaime-bunzli', 'bernardo-janot'] },
      { id: 'chile-day2-aml-monitoring-and-fraud', day: '2', time: '15:20-15:45', title: 'AML monitoring and fraud prevention synergies in the compliance world', type: 'keynote', speakers: ['willian-santos'] },
      { id: 'chile-day2-extended-networking-day-2', day: '2', time: '15:45-16:30', title: 'Extended networking + Day 2 closing', type: 'break' },
      { id: 'chile-day3-welcome-coffee-networking-sponsor', day: '3', time: '08:30-09:30', title: 'Welcome coffee + networking + sponsor booths opening', type: 'registration' },
      { id: 'chile-day3-chile-facing-the-new', day: '3', time: '09:30-09:55', title: 'Global stablecoins, stability and innovation', type: 'keynote', speakers: ['alberto-naudon'] },
      { id: 'chile-day3-panel-digital-assets-architecture', day: '3', time: '10:00-10:50', title: 'Panel: Digital assets architecture: regulation, market and institutional adoption', type: 'panel', speakers: ['paula-bermudez', 'daniel-hernandez', 'sylvia-sanchez', 'ximena-rojas', 'ignacio-araya'] },
      { id: 'chile-day3-fireside-chat-from-innovation', day: '3', time: '10:55-11:20', title: 'Fireside chat: From innovation to infrastructure: building programmable financial systems', type: 'panel', speakers: ['albi-rodriguez', 'francisco-del-olmo'] },
      { id: 'chile-day3-panel-convergence-between-banking', day: '3', time: '11:25-12:15', title: 'Panel: Convergence between banking, capital markets and digital assets: emerging models and opportunities for the financial system', type: 'panel', speakers: ['mauricio-jara', 'juan-pablo-cordoba', 'jose-manuel-souto', 'regina-pedroso', 'vicente-lazen'] },
      { id: 'chile-day3-panel-financial-system-2030', day: '3', time: '12:20-13:10', title: 'Panel: Financial System 2030: how will money, capital and financial infrastructure be redefined?', type: 'panel', speakers: ['alvaro-clarke', 'jose-gabriel-carrasco', 'alexis-franco', 'guillermo-acuna', 'claudio-calderon'] },
      { id: 'chile-day3-conclusions-and-closing', day: '3', time: '13:15-13:30', title: 'Conclusions and closing', type: 'keynote', speakers: ['mauricio-jara', 'rodrigo-sainz'] },
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
      { id: 'colombia-day1-reg', day: '1', time: '08:00 - 09:00', title: 'Registro y bienvenida institucional', type: 'registration' },
      { id: 'colombia-day1-open', day: '1', time: '09:00 - 09:20', title: 'Apertura BSL Bogotá', type: 'keynote', speakers: ['leonardo-villar'] },
      { id: 'colombia-day1-central-bank', day: '1', time: '09:30 - 10:00', title: 'Infraestructura financiera y pagos modernos', type: 'keynote', speakers: ['leonardo-villar'] },
      { id: 'colombia-day1-regulation', day: '1', time: '10:15 - 11:00', title: 'Marco regulatorio y banca central en la era digital', type: 'panel', speakers: ['liz-bejarano', 'albi-rodriguez', 'judith-vergara'] },
      { id: 'colombia-day2-open-finance', day: '2', time: '11:15 - 12:00', title: 'Open finance, tokenización y mercados institucionales', type: 'panel', speakers: ['rafael-gago', 'andres-meneses', 'ana-maria-zuluaga'] },
      { id: 'colombia-day2-lunch', day: '2', time: '12:00 - 13:30', title: 'Almuerzo libre y networking estratégico', type: 'meal' },
      { id: 'colombia-day2-strategy', day: '2', time: '14:00 - 14:45', title: 'Diálogo estratégico entre sector público, banca y mercados', type: 'panel', speakers: ['rafael-teruszkin', 'william-duran', 'daniel-aguilar'] },
      { id: 'colombia-day2-close', day: '2', time: '15:00 - 15:30', title: 'Cierre: impacto económico, innovación e inclusión', type: 'keynote', speakers: ['pablo-santos', 'arlette-salas'] },
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
      basePath: '/api/bsl',
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
      schema: 'bsl',
      tables: {
        speakers: 'bsl_speakers',
        bookings: 'bsl_bookings',
        attendees: 'bsl_attendees'
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
      { id: '56', name: 'Edward Calderón', title: 'CEO', company: 'HASHPASS' },
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
    name: 'HASHPASS',
    domain: 'hashpass.tech',
    title: 'HASHPASS',
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
