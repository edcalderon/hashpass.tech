const mockSendMail = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();
type MockQuery = {
  select: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
  eq: (...args: unknown[]) => MockQuery;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: (...args: unknown[]) => ReturnType<typeof mockMaybeSingle>;
  error: null;
};
const mockQuery = {
  select: jest.fn((): MockQuery => mockQuery),
  update: jest.fn((): MockQuery => mockQuery),
  insert: jest.fn((): MockQuery => mockQuery),
  eq: (...args: unknown[]): MockQuery => { mockEq(...args); return mockQuery; },
  order: jest.fn((): MockQuery => mockQuery),
  limit: jest.fn((): MockQuery => mockQuery),
  maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args),
  error: null,
} as MockQuery;

jest.mock('../../../lib/server/smtp-transport', () => ({
  createTransactionalTransport: () => ({
    transport: { sendMail: (...args: unknown[]) => mockSendMail(...args) },
    from: 'HASHPASS <test@example.com>',
  }),
}));

import { sendAuthenticatorEmailCode } from '../../../lib/server/authenticator-email';

const db = { from: jest.fn(() => mockQuery) } as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockSendMail.mockResolvedValue(undefined);
});

it('applies the resend cooldown only to an unused setup email code', async () => {
  mockMaybeSingle.mockResolvedValue({ data: { created_at: new Date().toISOString() }, error: null });

  await expect(sendAuthenticatorEmailCode(db, 'person@example.com', 'test-service-key')).resolves.toBe('rate_limited');

  expect(mockEq).toHaveBeenCalledWith('used', false);
  expect(mockSendMail).not.toHaveBeenCalled();
});

it('marks a failed setup email as unavailable without leaving a live code behind', async () => {
  mockSendMail.mockRejectedValue(new Error('mail unavailable'));

  await expect(sendAuthenticatorEmailCode(db, 'person@example.com', 'test-service-key')).rejects.toThrow('authenticator_unavailable');

  expect(mockQuery.update).toHaveBeenCalledWith({ used: true });
  expect(mockEq).toHaveBeenCalledWith('used', false);
});
