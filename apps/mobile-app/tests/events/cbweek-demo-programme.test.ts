/// <reference types="jest" />

import { EVENTS } from '../../config/events';
import type { AgendaItem } from '../../../types/agenda';

describe('CBWeek 2026 demo programme', () => {
  const event = EVENTS.cbweek2026;

  it('provides an explicitly demo day-one schedule for the published main-conference hours', () => {
    expect(event.dayThemes?.['1']?.es).toContain('Programa demo');
    expect(event.agenda).toHaveLength(15);
    expect(event.agenda?.every((item: AgendaItem) => item.day === '1')).toBe(true);
    expect(event.agenda?.[0]).toMatchObject({
      time: '2026-12-12T08:30:00-05:00',
      type: 'registration',
    });
    expect(event.agenda?.at(-1)).toMatchObject({
      time: '2026-12-12T17:45:00-05:00',
      type: 'break',
    });
  });

  it('uses the ten topic pillars published by CBWeek instead of claiming an official timed agenda', () => {
    const programmeText = event.agenda?.map((item: AgendaItem) => `${item.title} ${item.description || ''}`).join(' ') || '';

    expect(programmeText).toContain('Blockchain, Bitcoin, Criptomonedas & Trading');
    expect(programmeText).toContain('Forex, Inversiones & Mercados Financieros');
    expect(programmeText).toContain('Exchanges & Brokers');
    expect(programmeText).toContain('Activos Digitales, Stablecoins, OTC, P2P, Liquidez, Wallets & Pagos Digitales');
    expect(programmeText).toContain('Tokenización, RWA, Web3, Fintech & Startups');
    expect(programmeText).toContain('Custodia, Servicios Institucionales & Soluciones B2B');
    expect(programmeText).toContain('DeFi, Regulación & Marco Legal LATAM');
    expect(programmeText).toContain('Educación Financiera & Web3');
    expect(programmeText).toContain('Inteligencia Artificial & Tecnologías Emergentes');
    expect(programmeText).toContain('Security, Compliance & Blockchain Analytics');
  });

  it('shows the requested active CBWeek demo speakers with event-owned images', () => {
    expect(event.speakers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Bryan Aguilar', title: 'CEO', company: 'LATAM Blockchain Events LLC', isActive: true, image: expect.stringContaining('/cbweek2026/speakers/bryan-aguilar.png') }),
      expect.objectContaining({ name: 'Lucero Dextre', title: 'COO', company: 'LATAM Blockchain Events LLC', isActive: true, image: expect.stringContaining('/cbweek2026/speakers/lucero-dextre.png') }),
      expect.objectContaining({ name: 'Edward Calderón', title: 'CEO', company: 'HASHPASS', isActive: true, image: expect.stringContaining('/cbweek2026/speakers/edward-calderon.png') }),
    ]));

    const speakerIds = new Set(event.speakers?.map((speaker: { id: string }) => speaker.id));
    expect(event.agenda?.flatMap((item: AgendaItem) => item.speakers || []).every((speakerId: string) => speakerIds.has(speakerId))).toBe(true);
  });
});
