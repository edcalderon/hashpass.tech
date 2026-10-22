const mockRpc = jest.fn();
const mockReady = jest.fn();
const mockSend = jest.fn();
jest.mock('../../../lib/supabase-server', () => ({ getSupabaseServerForRequest: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }) }));
jest.mock('../../../lib/email', () => ({ marketingSenderReady: () => mockReady(), sendMarketingMessage: (...args: unknown[]) => mockSend(...args) }));
import { marketingRunnerAuthorized, runMarketingBatch } from '../../../lib/server/marketing-worker';
import { POST } from '../../../app/api/marketing/dispatch+api';
import pack from '../../../config/marketing/bsl2026.json';
const token = 'test-runner-token-at-least-32-characters';
const delivery = { id: 'delivery-1', campaign_id: 'campaign-1', event_id: 'colombia2026', claim_token: 'claim-1', unsubscribe_token: 'optout-1', email: 'fixture@example.com', locale: 'es', content: pack.messages[0].content };
const req = (secret = token, host = 'api.hashpass.tech') => new Request(`https://${host}/api/marketing/dispatch`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
beforeEach(() => {
  jest.clearAllMocks(); process.env.MARKETING_RUNNER_TOKEN = token;
  mockReady.mockResolvedValue(true); mockSend.mockResolvedValue({ status: 'accepted', messageId: 'msg' });
  mockRpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'marketing_claim' ? [delivery] : true }));
});
afterEach(() => { jest.useRealTimers(); delete process.env.MARKETING_RUNNER_TOKEN; });
it('rejects missing, weak and incorrect scheduler tokens before database or SMTP access', async () => {
  expect(marketingRunnerAuthorized(req(), 'short')).toBe(false);
  expect(marketingRunnerAuthorized(req('a'.repeat(token.length)))).toBe(false);
  expect((await runMarketingBatch(req('invalid'))).status).toBe(401); expect(mockRpc).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});
it('checks sender before claiming and reports queue outages', async () => {
  mockReady.mockResolvedValueOnce(false); expect((await runMarketingBatch(req())).status).toBe(503); expect(mockRpc).not.toHaveBeenCalled();
  mockRpc.mockResolvedValue({ error: {} }); expect((await runMarketingBatch(req())).status).toBe(503);
});
it('renders localized copy and acknowledges SMTP acceptance with the claim token', async () => {
  const response = await runMarketingBatch(req());
  expect(mockRpc).toHaveBeenCalledWith('marketing_claim', { p_limit: 4 });
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: delivery.email, subject: delivery.content.es.subject, unsubscribeUrl: expect.stringContaining(delivery.unsubscribe_token) }));
  expect(mockRpc).toHaveBeenCalledWith('marketing_ack', { p_id: delivery.id, p_claim: delivery.claim_token, p_status: 'accepted', p_message_id: 'msg', p_error: null });
  expect(await response.json()).toEqual({ data: { claimed: 1, accepted: 1, failed: 0, unknown: 0, skipped: 0 } });
});
it('skips recipients paused or unsubscribed after queueing', async () => {
  mockRpc.mockImplementation(async (name: string) => ({ data: name === 'marketing_claim' ? [delivery] : false }));
  const response = await runMarketingBatch(req()); expect(mockSend).not.toHaveBeenCalled(); expect((await response.json()).data.skipped).toBe(1);
});
it('does not submit when the immediate consent check fails', async () => {
  mockRpc.mockImplementation(async (name: string) => name === 'marketing_claim' ? { data: [delivery] } : { error: {} });
  const response = await runMarketingBatch(req()); expect(mockSend).not.toHaveBeenCalled(); expect((await response.json()).data.unknown).toBe(1);
});
it('records unknown acknowledgements and never resubmits', async () => {
  mockRpc.mockImplementation(async (name: string) => name === 'marketing_claim' ? { data: [delivery] } : name === 'marketing_ack' ? { error: {} } : { data: true });
  const response = await runMarketingBatch(req()); expect(mockSend).toHaveBeenCalledTimes(1); expect((await response.json()).data.unknown).toBe(1);
});
it.each(['failed', 'unknown'])('persists provider outcome %s without automatic retries', async status => {
  mockSend.mockResolvedValue({ status, errorCode: 'provider_error' });
  const response = await runMarketingBatch(req()); expect((await response.json()).data[status]).toBe(1); expect(mockSend).toHaveBeenCalledTimes(1);
});
it('bounds SMTP timeout and preserves uncertainty', async () => {
  jest.useFakeTimers(); mockSend.mockImplementation(() => new Promise(() => {}));
  const pending = runMarketingBatch(req()); await jest.advanceTimersByTimeAsync(8100);
  expect((await (await pending).json()).data.unknown).toBe(1);
  expect(mockRpc).toHaveBeenCalledWith('marketing_ack', expect.objectContaining({ p_status: 'unknown', p_error: 'provider_timeout_reconcile' }));
});
it('handles thrown transport failures as unknown', async () => {
  mockSend.mockRejectedValue(new Error('transport')); expect((await (await runMarketingBatch(req())).json()).data.unknown).toBe(1);
});
it('keeps future campaigns generic and development opt-outs on the development API', async () => {
  mockRpc.mockImplementation(async (name: string) => ({ data: name === 'marketing_claim' ? [{ ...delivery, event_id: 'future-event', locale: 'en' }] : true }));
  await runMarketingBatch(req(token, 'api-dev.hashpass.tech'));
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('HASHPASS UPDATES'), unsubscribeUrl: expect.stringContaining('https://api-dev.hashpass.tech/') }));
});
it('supports empty queues and catches unexpected route failures', async () => {
  mockRpc.mockResolvedValue({ data: [] }); expect((await (await runMarketingBatch(req())).json()).data.claimed).toBe(0);
  mockReady.mockRejectedValue(new Error('config')); expect((await POST(req())).status).toBe(503);
});
