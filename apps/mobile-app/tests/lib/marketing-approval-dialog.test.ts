import { confirmMarketingCampaignAction, showMarketingCampaignResult } from '../../lib/marketing-approval-dialog';

describe('marketing campaign decision dialogs', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  it('uses browser confirmation and submits only after confirmation', () => {
    const confirm = jest.fn().mockReturnValue(true);
    const alert = jest.fn();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm, alert } });
    const onConfirm = jest.fn();

    confirmMarketingCampaignAction('web', 'Approve campaign?', 'Review the details.', 'Approve', 'Cancel', false, onConfirm);

    expect(confirm).toHaveBeenCalledWith('Approve campaign?\n\nReview the details.');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not submit when the reviewer cancels the browser confirmation', () => {
    const confirm = jest.fn().mockReturnValue(false);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm, alert: jest.fn() } });
    const onConfirm = jest.fn();

    confirmMarketingCampaignAction('web', 'Decline campaign?', 'Review the details.', 'Decline', 'Cancel', true, onConfirm);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows completion feedback through the browser alert', () => {
    const alert = jest.fn();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: jest.fn(), alert } });

    showMarketingCampaignResult('web', 'Decision saved', 'The campaign was approved.');

    expect(alert).toHaveBeenCalledWith('Decision saved\n\nThe campaign was approved.');
  });
});
