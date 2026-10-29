import React from 'react';
import SpeakerStatusBadge from '../../components/SpeakerStatusBadge';

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => (params?.status ? `${key}:${params.status}` : key),
  }),
}));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

const { act, create } = require('react-test-renderer');

describe('SpeakerStatusBadge', () => {
  it('shows the status label and opens an explanation of every status', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SpeakerStatusBadge status="passive" />);
    });
    const badge = renderer!.root.findByProps({ testID: 'speaker-status-passive' });
    expect(renderer!.root.findAllByProps({ children: 'speakerView.status.passive.label' }).length).toBeGreaterThan(0);

    await act(async () => {
      badge.props.onPress();
    });
    for (const key of ['active', 'passive', 'dnd']) {
      expect(renderer!.root.findAllByProps({ children: `speakerView.status.${key}.description` }).length).toBe(1);
    }
  });

  it('uses a custom label and closes the explanation', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SpeakerStatusBadge status="active" label="Online" isDark />);
    });
    expect(renderer!.root.findAllByProps({ children: 'Online' }).length).toBeGreaterThan(0);
    await act(async () => {
      renderer!.root.findByProps({ testID: 'speaker-status-active' }).props.onPress();
    });
    expect(renderer!.root.findByProps({ transparent: true }).props.visible).toBe(true);
    await act(async () => {
      renderer!.root.findByProps({ transparent: true }).props.onRequestClose();
    });
    expect(renderer!.root.findByProps({ transparent: true }).props.visible).toBe(false);
  });

  it('marks a confirmed speaker with a check and a live dot, other statuses with info', async () => {
    let confirmed: ReturnType<typeof create>;
    await act(async () => {
      confirmed = create(<SpeakerStatusBadge status="active" />);
    });
    const icons = (renderer: ReturnType<typeof create>) =>
      renderer.root.findAllByType('MaterialIcons' as any).map((node: any) => node.props.name);
    expect(icons(confirmed!)).toContain('check');
    expect(icons(confirmed!)).not.toContain('info-outline');

    let passive: ReturnType<typeof create>;
    await act(async () => {
      passive = create(<SpeakerStatusBadge status="passive" />);
    });
    expect(icons(passive!)).toContain('info-outline');
    expect(icons(passive!)).not.toContain('check');
  });

  it('tints the pill with the status hue instead of drawing a dot', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SpeakerStatusBadge status="passive" />);
    });
    const flat = (style: any) => Object.assign({}, ...[].concat(style).flat(Infinity).filter(Boolean));
    const pill = flat(renderer!.root.findByProps({ testID: 'speaker-status-passive' }).props.style);
    expect(pill.backgroundColor).toMatch(/^#1d4ed8[0-9a-f]{2}$/i);
    expect(pill.borderColor).toMatch(/^#1d4ed8[0-9a-f]{2}$/i);
    expect(renderer!.root.findAll((node: any) => node.type === 'Animated.View')).toHaveLength(0);
  });
});
