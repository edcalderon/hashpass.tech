// Re-export types for backward compatibility
export type { Speaker, AgendaItem, EventConfig, QuickAccessItem } from '../types/events';

import type { EventConfig } from '../types/events';

export const EVENTS: Record<string, EventConfig> = {
  'bsl2025': {
    id: 'bsl2025',
    name: 'BSL 2025',
    domain: 'bsl2025.hashpass.tech',
    website: 'https://blockchainsummit.la/',
    // UI display fields
    title: 'Blockchain Summit Latam 2025',
    subtitle: 'Universidad EAFIT, Medellín',
    image: 'https://blockchainsummit.la/wp-content/uploads/2025/09/bsl2025-banner.jpg',
    color: '#2196F3',
    // Event dates for countdown and display
    eventStartDate: '2025-11-12T09:00:00-05:00',
    eventEndDate: '2025-11-14T23:59:59-05:00', // Event finished - marked as completed
    eventDateString: 'November 12-14, 2025 • Medellín, Colombia',
    features: ['matchmaking', 'speakers', 'bookings', 'admin'],
    eventType: 'whitelabel',
    branding: {
      primaryColor: '#2196F3',
      secondaryColor: '#34A853',
      logo: '/assets/logos/bsl-logo.png',
      favicon: '/favicon.ico'
    },
    api: {
      basePath: '/api/bslatam',
      endpoints: {
        speakers: 'speakers',
        bookings: 'bookings',
        'verify-ticket': 'verify-ticket',
        'auto-match': 'auto-match',
        'agenda': 'agenda',
        'status': 'status'
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
      {
        id: 'agenda',
        title: 'Event Agenda',
        subtitle: '3 Days Schedule',
        icon: 'event',
        color: '#34A853',
        route: '/events/bsl2025/agenda'
      },
      {
        id: 'networking',
        title: 'Networking Center',
        subtitle: 'Connect & meet',
        icon: 'people-alt',
        color: '#4CAF50',
        route: '/events/bsl2025/networking'
      },
      {
        id: 'speakers',
        title: 'Featured Speakers',
        subtitle: 'Meet the experts',
        icon: 'people',
        color: '#007AFF',
        route: '/events/bsl2025/speakers/calendar'
      },
      {
        id: 'event-info',
        title: 'Event Information',
        subtitle: 'Details & Logistics',
        icon: 'info',
        color: '#FF9500',
        route: '/events/bsl2025/event-info'
      }
    ]
  },
  'default': {
    id: 'default',
    name: 'HashPass',
    domain: 'hashpass.tech',
    // UI display fields
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
      endpoints: {
        auth: '/api/auth',
        users: '/api/users'
      }
    },
    routes: {
      home: '/',
      speakers: '/(shared)/dashboard/explore',
      bookings: '/(shared)/dashboard/wallet'
    }
  }
} as const;

export type EventId = keyof typeof EVENTS;
