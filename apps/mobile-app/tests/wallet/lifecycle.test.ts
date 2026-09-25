import { AppState, Platform } from 'react-native';
import { bindWalletLifecycle } from '../../lib/wallet/lifecycle';

it('invalidates outstanding sensitive operations on background and disposal', () => {
  (Platform as any).OS = 'android';
  let listener: (state: string) => void = () => {};
  const remove = jest.fn();
  (AppState.addEventListener as jest.Mock).mockImplementationOnce((_event, fn) => {
    listener = fn; return { remove };
  });
  const wallet = { lock: jest.fn() };
  const dispose = bindWalletLifecycle(wallet);
  listener('active');
  expect(wallet.lock).not.toHaveBeenCalled();
  listener('background');
  expect(wallet.lock).toHaveBeenCalledTimes(1);
  dispose();
  expect(wallet.lock).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(1);
  (Platform as any).OS = 'web';
});
