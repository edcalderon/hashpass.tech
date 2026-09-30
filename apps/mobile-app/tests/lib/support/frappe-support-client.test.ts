/// <reference types="jest" />

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../../lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { Platform } from 'react-native';
import {
  createSupportTicket,
  getSupportTicket,
  sendSupportMessage,
} from '../../../lib/support/frappe-support-client';

const BASE_PATH = '/v1/support/frappe/tickets';

describe('lib/support/frappe-support-client', () => {
  const originalPlatformOs = Platform.OS;

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
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
});
