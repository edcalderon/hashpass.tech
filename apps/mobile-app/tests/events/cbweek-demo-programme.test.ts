/// <reference types="jest" />

import { EVENTS } from '../../config/events';
import type { AgendaItem } from '../../../types/agenda';

type DemoSpeaker = {
  id: string;
  name: string;
  isActive?: boolean;
  isPastEditionReference?: boolean;
};

describe('CBWeek 2026 demo programme', () => {
  const event = EVENTS.cbweek2026;

  it('anchors eventStartDate to day 1 so day N maps to each block\'s real calendar date', () => {
    const start = event.eventStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
    for (const item of event.agenda ?? []) {
      const dayNumber = parseInt(String(item.day), 10);
      const expected = new Date(Number(start[1]), Number(start[2]) - 1, Number(start[3]) + dayNumber - 1);
      const iso = String(item.time).match(/^(\d{4})-(\d{2})-(\d{2})/)!;
      expect([expected.getFullYear(), expected.getMonth() + 1, expected.getDate()])
        .toEqual([Number(iso[1]), Number(iso[2]), Number(iso[3])]);
    }
  });

  it('lists only the officially published Welcome Drink and Main Day hours (Colombia time)', () => {
    expect(event.dayThemes?.['1']?.es).toContain('Welcome Drink');
    expect(event.dayThemes?.['2']?.es).toContain('Main Day');
    expect(event.agenda).toHaveLength(2);
    expect(event.agenda?.[0]).toMatchObject({
      id: 'cbweek2026-official-welcome-drink',
      time: '2026-12-11T19:30:00-05:00',
      duration_minutes: 270,
      day: '1',
      location: expect.stringContaining('Mamba Negra'),
    });
    expect(event.agenda?.[1]).toMatchObject({
      id: 'cbweek2026-official-main-day',
      time: '2026-12-12T07:30:00-05:00',
      duration_minutes: 630,
      day: '2',
      location: expect.stringContaining('InterContinental'),
    });
  });

  it('does not invent sessions: no demo ids or speaker assignments in the bundled agenda', () => {
    const items = (event.agenda || []) as AgendaItem[];
    expect(items.some((item) => item.id.includes('demo'))).toBe(false);
    expect(items.flatMap((item) => item.speakers || [])).toHaveLength(0);
  });

  it('shows the requested active CBWeek demo speakers with event-owned images', () => {
    expect(event.speakers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Bryan Aguilar', title: 'CEO', company: 'LATAM Blockchain Events LLC', isActive: true, image: expect.stringContaining('/cbweek2026/speakers/bryan-aguilar.png') }),
      expect.objectContaining({ name: 'Lucero Dextre', title: 'COO', company: 'LATAM Blockchain Events LLC', isActive: true, image: expect.stringContaining('.s3.us-east-2.amazonaws.com/events/cbweek2026/speakers/lucero-dextre.png') }),
      expect.objectContaining({ name: 'Edward Calderón', title: 'CEO', company: 'HASHPASS', isActive: true, image: expect.stringContaining('.s3.us-east-2.amazonaws.com/events/cbweek2026/speakers/edward-calderon.png') }),
    ]));

    const speakerIds = new Set(event.speakers?.map((speaker: { id: string }) => speaker.id));
    expect(event.agenda?.flatMap((item: AgendaItem) => item.speakers || []).every((speakerId: string) => speakerIds.has(speakerId))).toBe(true);
  });

  it('keeps official past-edition speakers visibly separate from the three active demo speakers', () => {
    const speakers = (event.speakers || []) as DemoSpeaker[];
    const activeSpeakers = speakers.filter((speaker) => speaker.isActive);
    const pastEditionSpeakers = speakers.filter((speaker) => speaker.isPastEditionReference);

    expect(activeSpeakers.map((speaker) => speaker.name)).toEqual([
      'Lucero Dextre',
      'Bryan Aguilar',
      'Edward Calderón',
    ]);
    expect(pastEditionSpeakers).toHaveLength(26);
    expect(pastEditionSpeakers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Charles Hoskinson',
        isActive: false,
        isPastEditionReference: true,
        image: expect.stringContaining('/cbweek2026/speakers/past-editions/charles-hoskinson.webp'),
      }),
      expect.objectContaining({
        name: 'Patrick O’Neill',
        isActive: false,
        isPastEditionReference: true,
        image: expect.stringContaining('/cbweek2026/speakers/past-editions/patrick-oneill.webp'),
      }),
    ]));
  });
});
