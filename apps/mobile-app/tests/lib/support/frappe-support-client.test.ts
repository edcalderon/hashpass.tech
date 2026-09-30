/// <reference types="jest" />

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockRuntimeApiBaseUrl = jest.fn();

jest.mock('../../../lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
  getRuntimeApiBaseUrl: (...args: unknown[]) => mockRuntimeApiBaseUrl(...args),
}));

import { Platform } from 'react-native';
import {
  createSupportTicket,
  closeSupportTicket,
  getSupportAttachmentUrl,
  getSupportTicket,
  sendSupportAttachment,
  sendSupportMessage,
} from '../../../lib/support/frappe-support-client';

const BASE_PATH = '/v1/support/frappe/tickets';

describe('lib/support/frappe-support-client', () => {
  const originalPlatformOs = Platform.OS;

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
    mockRuntimeApiBaseUrl.mockReset();
  });

  afterEach(() => {
    Platform.OS = originalPlatformOs;
  });

  describe('createSupportTicket', () => {
    it('posts the ticket fields plus a web captcha token and source on web', async () => {
      Platform.OS = 'web';
      const ticket = { id: 'HD-0001', subject: 'Help', status: 'Open', priority: 'Medium', raisedBy: 'a@example.com', createdAt: 't1', updatedAt: 't1' };
      mockPost.mockResolvedValue({ success: true, data: { ticket } });

      const result = await createSupportTicket({
        email: 'a@example.com',
        subject: 'Help',
        message: 'I need help',
        context: 'agenda screen',
        captchaToken: 'solved-token',
      });

      expect(result).toEqual(ticket);
      expect(mockPost).toHaveBeenCalledWith(
        BASE_PATH,
        {
          email: 'a@example.com',
          subject: 'Help',
          message: 'I need help',
          context: 'agenda screen',
          captchaToken: 'solved-token',
          source: 'web',
        },
        { skipEventSegment: true },
      );
    });

    it('omits the captcha token and declares itself native on non-web platforms', async () => {
      Platform.OS = 'ios';
      const ticket = { id: 'HD-0001', subject: 'Help', status: 'Open', priority: 'Medium', raisedBy: 'a@example.com', createdAt: 't1', updatedAt: 't1' };
      mockPost.mockResolvedValue({ success: true, data: { ticket } });

      await createSupportTicket({ email: 'a@example.com', subject: 'Help', message: 'I need help' });

      expect(mockPost).toHaveBeenCalledWith(
        BASE_PATH,
        {
          email: 'a@example.com',
          subject: 'Help',
          message: 'I need help',
          context: undefined,
          captchaToken: undefined,
          source: 'native',
        },
        { skipEventSegment: true },
      );
    });

    it('rejects with the server-provided data.message when creation fails', async () => {
      mockPost.mockResolvedValue({ success: false, data: { message: 'Rate limited' } });

      await expect(
        createSupportTicket({ email: 'a@example.com', subject: 'Help', message: 'x' }),
      ).rejects.toThrow('Rate limited');
    });

    it('falls back to response.error, then to a generic message, when nothing else is available', async () => {
      mockPost.mockResolvedValue({ success: false, error: 'Network down' });
      await expect(
        createSupportTicket({ email: 'a@example.com', subject: 'Help', message: 'x' }),
      ).rejects.toThrow('Network down');

      mockPost.mockResolvedValue({ success: false });
      await expect(
        createSupportTicket({ email: 'a@example.com', subject: 'Help', message: 'x' }),
      ).rejects.toThrow('Unable to create ticket');
    });
  });

  describe('getSupportTicket', () => {
    it('fetches the ticket by id with the email as a query param and returns ticket + messages', async () => {
      const ticket = { id: 'HD-0001', subject: 'Help', status: 'Open', priority: 'Medium', raisedBy: 'a@example.com', createdAt: 't1', updatedAt: 't1' };
      const messages = [{ id: 'c1', content: 'hi', commentedBy: null, createdAt: 't1' }];
      mockGet.mockResolvedValue({ success: true, data: { ticket, messages } });

      const result = await getSupportTicket('HD-0001', 'a@example.com');

      expect(result).toEqual({ ticket, messages });
      expect(mockGet).toHaveBeenCalledWith(
        `${BASE_PATH}/HD-0001`,
        { skipEventSegment: true, params: { email: 'a@example.com' } },
      );
    });

    it('rejects when the ticket cannot be loaded', async () => {
      mockGet.mockResolvedValue({ success: false });
      await expect(getSupportTicket('HD-9999', 'a@example.com')).rejects.toThrow(
        'Unable to load ticket',
      );
    });
  });

  describe('sendSupportMessage', () => {
    it('posts the reply content and returns the created message on success', async () => {
      const message = { id: 'c2', content: 'a reply', commentedBy: null, createdAt: 't2' };
      mockPost.mockResolvedValue({ success: true, data: { message } });

      const result = await sendSupportMessage({
        ticketId: 'HD-0001',
        email: 'a@example.com',
        content: 'a reply',
      });

      expect(result).toEqual(message);
      expect(mockPost).toHaveBeenCalledWith(
        `${BASE_PATH}/HD-0001`,
        { email: 'a@example.com', content: 'a reply' },
        { skipEventSegment: true },
      );
    });

    it('rejects when the message cannot be sent', async () => {
      mockPost.mockResolvedValue({ success: false });
      await expect(
        sendSupportMessage({ ticketId: 'HD-0001', email: 'a@example.com', content: 'a reply' }),
      ).rejects.toThrow('Unable to send message');
    });
  });

  describe('sendSupportAttachment', () => {
    it('posts the email and File as multipart data without JSON serialization', async () => {
      const message = { id: 'c3', content: 'attachment', commentedBy: null, createdAt: 't3' };
      mockPost.mockResolvedValue({ success: true, data: { message } });
      const file = new File(['png'], 'receipt.png', { type: 'image/png' });
      await expect(sendSupportAttachment({ ticketId: 'HD/0001', email: 'a@example.com', file })).resolves.toEqual(message);
      const [path, form, options] = mockPost.mock.calls[0];
      expect(path).toBe(`${BASE_PATH}/HD%2F0001`);
      expect(form).toBeInstanceOf(FormData);
      expect(form.get('email')).toBe('a@example.com');
      expect(form.get('file')).toEqual(expect.objectContaining({ name: 'receipt.png', type: 'image/png', size: 3 }));
      expect(options).toEqual({ skipEventSegment: true });
    });

    it('uses the server error or safe fallback when an attachment upload fails', async () => {
      mockPost.mockResolvedValue({ success: false, data: { message: 'Attachment rejected' } });
      await expect(sendSupportAttachment({ ticketId: 'HD-0001', email: 'a@example.com', file: new File(['x'], 'x.png') })).rejects.toThrow('Attachment rejected');
      mockPost.mockResolvedValue({ success: false });
      await expect(sendSupportAttachment({ ticketId: 'HD-0001', email: 'a@example.com', file: new File(['x'], 'x.png') })).rejects.toThrow('Unable to send attachment');
    });
  });

  describe('closeSupportTicket', () => {
    it('patches a ticket and returns the closed result', async () => {
      const ticket = { id: 'HD-0001', subject: 'Help', status: 'Closed', priority: 'Medium', raisedBy: 'a@example.com', createdAt: 't1', updatedAt: 't2' };
      mockPatch.mockResolvedValue({ success: true, data: { ticket } });
      await expect(closeSupportTicket('HD/0001', 'a@example.com')).resolves.toEqual(ticket);
      expect(mockPatch).toHaveBeenCalledWith(`${BASE_PATH}/HD%2F0001`, { email: 'a@example.com' }, { skipEventSegment: true });
    });

    it('uses the generic error when a close request has no detail', async () => {
      mockPatch.mockResolvedValue({ success: false });
      await expect(closeSupportTicket('HD-0001', 'a@example.com')).rejects.toThrow('Unable to cancel ticket');
    });
  });

  it('builds an encoded, backend-relative attachment proxy URL', () => {
    mockRuntimeApiBaseUrl.mockReturnValue('https://api.hashpass.tech/');
    expect(getSupportAttachmentUrl('HD/0001', 'a+b@example.com', 'FILE/123'))
      .toBe('https://api.hashpass.tech/v1/support/frappe/tickets/HD%2F0001/attachment?email=a%2Bb%40example.com&file=FILE%2F123');
    mockRuntimeApiBaseUrl.mockReturnValue('');
    expect(getSupportAttachmentUrl('HD-0001', 'a@example.com', 'FILE-1')).toContain('/api/v1/support/frappe/tickets/HD-0001/attachment?');
  });
});
