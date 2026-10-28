import {
  applyLukasClick,
  createInitialLukasRewardState,
  LUKAS_REWARD_CAP,
  resolveLukasAnimationLevel,
} from '../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/lukas-rewards';

describe('LUKAS landing reward interaction', () => {
  it('awards one LUKAS on the first click', () => {
    const result = applyLukasClick(createInitialLukasRewardState(), 1_000, () => 0);

    expect(result.awarded).toBe(1);
    expect(result.state.total).toBe(1);
    expect(result.reachedCap).toBe(false);
  });

  it('adds a bounded cadence bonus for rapid clicks', () => {
    const first = applyLukasClick(createInitialLukasRewardState(), 1_000, () => 0);
    const second = applyLukasClick(first.state, 1_400, () => 0.99);

    expect(second.awarded).toBe(3);
    expect(second.state.total).toBe(4);
    expect(second.state.streak).toBe(1);
  });

  it('never awards beyond the ten-LUKAS cap', () => {
    const full = {
      ...createInitialLukasRewardState(),
      total: LUKAS_REWARD_CAP,
      clickCount: LUKAS_REWARD_CAP,
      lastClickAt: 2_000,
      streak: 4,
    };

    const result = applyLukasClick(full, 2_100, () => 1);

    expect(result.awarded).toBe(0);
    expect(result.state).toEqual(full);
    expect(result.reachedCap).toBe(true);
  });

  it('downgrades full effects when the system requests reduced motion', () => {
    expect(resolveLukasAnimationLevel('full', true)).toBe('reduced');
    expect(resolveLukasAnimationLevel('reduced', false)).toBe('reduced');
    expect(resolveLukasAnimationLevel('none', true)).toBe('none');
  });
});
