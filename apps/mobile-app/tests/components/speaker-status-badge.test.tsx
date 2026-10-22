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
      renderer = create(<SpeakerStatusBadge status="idle" />);
    });
    const badge = renderer!.root.findByProps({ testID: 'speaker-status-idle' });
    expect(renderer!.root.findAllByProps({ children: 'speakerView.status.idle.label' }).length).toBeGreaterThan(0);

    await act(async () => {
      badge.props.onPress();
    });
    for (const key of ['active', 'idle', 'dnd']) {
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
});
