/// <reference types="jest" />
import { validateBookingInput } from '../../lib/bsl/validation';

describe('validateBookingInput', () => {
  it('rejects missing fields', () => {
    expect(validateBookingInput({})).toBe('speakerId is required');
  });
  it('rejects invalid time order', () => {
    const err = validateBookingInput({ speakerId: 's', attendeeId: 'a', start: '2025-11-13T10:10:00Z', end: '2025-11-13T10:00:00Z' });
    expect(err).toBe('end must be after start');
  });
  it('accepts valid input', () => {
    const err = validateBookingInput({ speakerId: 's', attendeeId: 'a', start: '2025-11-13T10:00:00Z', end: '2025-11-13T10:10:00Z' });
    expect(err).toBeNull();
  });
});


