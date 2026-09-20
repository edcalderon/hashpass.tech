import React from 'react';
import { act, create } from 'react-test-renderer';
let mockParams: Record<string, unknown> = {};
jest.mock('expo-router', () => ({ Redirect: 'Redirect', useLocalSearchParams: () => mockParams }));
import EventsIndexRedirect from '../../app/events/index';
it.each([{}, { eventId: 'hash-poker' }])('redirects legacy discovery while preserving valid event context: %j', params => {
  mockParams = params;
  let view: ReturnType<typeof create>;
  act(() => { view = create(<EventsIndexRedirect />); });
  expect(view!.root.findByType('Redirect' as any).props.href).toEqual({ pathname: '/dashboard/explore', params });
  act(() => view!.unmount());
});
