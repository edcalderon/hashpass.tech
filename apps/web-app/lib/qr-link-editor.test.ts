import assert from 'node:assert/strict';
import test from 'node:test';
import type { QrLink } from '@hashpass/sdk';
import {
  beginQrLinkEdit,
  deleteConfirmationMatches,
  destinationInputFromUrl,
  paginateQrLinks,
  resolveQrLinkAvailability,
  toHttpsDestination,
} from './qr-link-editor';

const LINK: QrLink = {
  id: 'link-1',
  ownerId: 'owner-1',
  publicSlug: 'concert-2026',
  name: 'Concert 2026',
  description: 'VIP entry',
  destinationUrl: 'https://hashpass.club/concert',
  status: 'active',
  visualConfig: {
    foreground: '#071426',
    background: '#ffffff',
    modules: 'square',
    finderEye: 'rounded',
    logo: false,
    errorCorrection: 'Q',
    margin: 4,
    logoSize: 18,
  },
  campaign: { source: 'flyer', medium: 'print', campaign: 'summer' },
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

test('beginning an edit pre-fills the form and requests focus for the editor', () => {
  const session = beginQrLinkEdit(LINK);

  assert.deepEqual(session.form, {
    name: 'Concert 2026',
    publicSlug: 'concert-2026',
    destinationUrl: 'hashpass.club/concert',
    description: 'VIP entry',
    campaignSource: 'flyer',
    campaignMedium: 'print',
    campaignName: 'summer',
    availability: 'permanent',
    startsAt: '',
    expiresAt: '',
  });
  assert.equal(session.campaignOpen, true);
  assert.equal(session.focusEditor, true);
});

test('normalizes a domain-only input into an HTTPS destination', () => {
  assert.equal(toHttpsDestination('www.hashpass.club/events/summer'), 'https://www.hashpass.club/events/summer');
  assert.equal(destinationInputFromUrl('https://hashpass.club/invite?code=abc'), 'hashpass.club/invite?code=abc');
  assert.throws(() => toHttpsDestination('http://hashpass.club'));
  assert.throws(() => toHttpsDestination('hashpass'));
});

test('builds a permanent link or a valid scheduled availability range', () => {
  assert.deepEqual(resolveQrLinkAvailability('permanent', '', ''), { startsAt: null, expiresAt: null });

  const startsAt = '2030-06-01T09:00';
  const expiresAt = '2030-06-01T18:00';
  assert.deepEqual(resolveQrLinkAvailability('expiring', '', expiresAt), {
    startsAt: null,
    expiresAt: new Date(expiresAt).toISOString(),
  });
  assert.deepEqual(resolveQrLinkAvailability('scheduled', startsAt, expiresAt), {
    startsAt: new Date(startsAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  });
  assert.throws(() => resolveQrLinkAvailability('expiring', '', ''));
  assert.throws(() => resolveQrLinkAvailability('scheduled', startsAt, '2030-06-01T08:00'));
  assert.throws(() => resolveQrLinkAvailability('scheduled', '', expiresAt));
});

test('paginates QR links three at a time and clamps an unavailable page', () => {
  const links = Array.from({ length: 7 }, (_, index) => ({ ...LINK, id: `link-${index + 1}` }));

  assert.deepEqual(paginateQrLinks(links, 2), {
    currentPage: 2,
    pageCount: 3,
    items: links.slice(3, 6),
  });
  assert.deepEqual(paginateQrLinks(links.slice(0, 4), 3), {
    currentPage: 2,
    pageCount: 2,
    items: links.slice(3, 4),
  });
});

test('requires an explicit DELETE acknowledgement before a QR link can be removed', () => {
  assert.equal(deleteConfirmationMatches('DELETE'), true);
  assert.equal(deleteConfirmationMatches(' delete '), true);
  assert.equal(deleteConfirmationMatches('delete link'), false);
  assert.equal(deleteConfirmationMatches(''), false);
});
