/// <reference types="jest" />

import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import ScheduleConfirmationModal from '../../components/ScheduleConfirmationModal';
import AgendaActionResultModal from '../../components/AgendaActionResultModal';

jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: {} }) }));
jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

const texts = (r: ReturnType<typeof create>) =>
  r.root.findAllByType(Text).map((n) => n.children.join(''));
const buttons = (r: ReturnType<typeof create>) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');

describe('agenda dialogs', () => {
  const render = async (element: React.ReactElement) => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(element); });
    return renderer!;
  };

  it('unconfirm uses a labelled bookmark control, a Cancel action and one danger action', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const onToggleFavorite = jest.fn();
    const r = await render(
      <ScheduleConfirmationModal
        visible
        title="Welcome Coffee"
        location="Hall principal"
        startTime={new Date('2026-10-29T13:00:00Z')}
        isConfirmed
        isAgendaEvent
        isFavorite={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onToggleFavorite={onToggleFavorite}
        onViewAgenda={jest.fn()}
      />,
    );
    const all = texts(r);
    expect(all).toEqual(expect.arrayContaining(['Cancel', 'Bookmark', 'Check your agenda first']));
    expect(all.some((t) => t.includes('Welcome Coffee'))).toBe(true);
    const byLabel = (label: string) => buttons(r).find((n) => n.props.accessibilityLabel === label)!;
    await act(async () => byLabel('Cancel').props.onPress());
    await act(async () => byLabel('Bookmark').props.onPress());
    expect(onCancel).toHaveBeenCalled();
    expect(onToggleFavorite).toHaveBeenCalled();
  });

  it('confirm path has no agenda-first link and shows a success action', async () => {
    const r = await render(
      <ScheduleConfirmationModal
        visible
        title="Keynote"
        startTime={new Date('2026-10-29T13:00:00Z')}
        isConfirmed={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        onViewAgenda={jest.fn()}
      />,
    );
    expect(texts(r)).not.toContain('Check your agenda first');
    expect(texts(r)).toContain('Cancel');
  });

  it('result modal offers Close and Check your agenda for both directions', async () => {
    for (const added of [true, false]) {
      const onViewAgenda = jest.fn();
      const r = await render(
        <AgendaActionResultModal visible added={added} onClose={jest.fn()} onViewAgenda={onViewAgenda} />,
      );
      expect(texts(r)).toEqual(expect.arrayContaining(['Close', 'Check your agenda']));
      const go = buttons(r).find((n) => n.props.accessibilityLabel === 'Check your agenda')!;
      await act(async () => go.props.onPress());
      expect(onViewAgenda).toHaveBeenCalled();
    }
  });
});
