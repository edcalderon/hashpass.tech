import { Alert } from 'react-native';
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

  it('uses a native confirmation with cancel and approve actions', () => {
    const onConfirm = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    confirmMarketingCampaignAction('ios', 'Approve?', 'Details', 'Approve', 'Keep pending', false, onConfirm);

    const actions = alert.mock.calls[0][2]!;
    expect(alert).toHaveBeenCalledWith('Approve?', 'Details', expect.any(Array));
    expect(actions[0]).toEqual(expect.objectContaining({ text: 'Keep pending', style: 'cancel' }));
    expect(actions[1]).toEqual(expect.objectContaining({ text: 'Approve', style: 'default' }));
    actions[0].onPress?.();
    expect(onConfirm).not.toHaveBeenCalled();
    actions[1].onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('marks native declines destructive and shows native result feedback', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    confirmMarketingCampaignAction('android', 'Decline?', 'Details', 'Decline', 'Cancel', true, jest.fn());
    expect(alert.mock.calls[0][2]?.[1]).toEqual(expect.objectContaining({ text: 'Decline', style: 'destructive' }));

    showMarketingCampaignResult('android', 'Saved', 'The decision was recorded.');
    expect(alert).toHaveBeenLastCalledWith('Saved', 'The decision was recorded.');
    alert.mockRestore();
  });
});
