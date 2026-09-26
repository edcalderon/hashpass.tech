import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Linking } from 'react-native';
import LegalDocumentContent from '../../components/LegalDocumentContent';
import {
  fetchCanonicalLegalDocument,
  getBundledLegalDocument,
  isLegalDocument,
  type LegalDocument,
} from '../../lib/legal-documents';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false }),
}));

const sampleDocument: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  description: 'Privacy details',
  revision: '26 September 2026',
  sourcePath: 'apps/docs/docs/legal/privacy-policy.md',
  sourceUrl: 'https://hashpass.club/documentation/legal/privacy-policy/',
  blocks: [
    { type: 'heading', text: 'Your privacy' },
    { type: 'paragraph', text: 'Plain paragraph' },
    { type: 'quote', text: 'Important notice' },
    { type: 'list', items: ['First item', 'Second item'] },
    { type: 'list', items: [] },
  ],
};

const response = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: jest.fn().mockResolvedValue(body),
}) as unknown as Response;

let view: ReactTestRenderer | undefined;
const originalFetch = globalThis.fetch;

const rendered = (): ReactTestRenderer => {
  if (!view) throw new Error('Expected the legal content to be rendered.');
  return view;
};

beforeEach(() => {
  globalThis.fetch = jest.fn();
  jest.mocked(Linking.openURL).mockClear();
});

afterEach(() => {
  if (view) act(() => view?.unmount());
  view = undefined;
  jest.restoreAllMocks();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

it('keeps complete bundled documents available as the offline fallback', () => {
  const privacy = getBundledLegalDocument('privacy');
  const terms = getBundledLegalDocument('terms');

  expect(isLegalDocument(privacy, 'privacy')).toBe(true);
  expect(isLegalDocument(terms, 'terms')).toBe(true);
  expect(privacy.blocks.length).toBeGreaterThan(20);
  expect(terms.blocks.length).toBeGreaterThan(40);
});

it('rejects malformed canonical documents without replacing binding copy', () => {
  expect(isLegalDocument(null, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, id: 'terms' }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, title: 7 }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, revision: null }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, sourceUrl: null }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, blocks: null }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, blocks: [null] }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, blocks: [{ type: 'list', items: [7] }] }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, blocks: [{ type: 'paragraph' }] }, 'privacy')).toBe(false);
  expect(isLegalDocument({ ...sampleDocument, blocks: [{ type: 'unknown', text: 'Nope' }] }, 'privacy')).toBe(false);
});

it('fetches and validates canonical JSON from the public Club artifact', async () => {
  const controller = new AbortController();
  jest.mocked(globalThis.fetch).mockResolvedValue(response(sampleDocument));

  await expect(fetchCanonicalLegalDocument('privacy', controller.signal)).resolves.toEqual(sampleDocument);
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://hashpass.club/documentation/legal-content/privacy.json',
    { headers: { Accept: 'application/json' }, signal: controller.signal },
  );
});

it('rejects failed and malformed canonical responses', async () => {
  jest.mocked(globalThis.fetch)
    .mockResolvedValueOnce(response({}, false, 503))
    .mockResolvedValueOnce(response({ ...sampleDocument, id: 'terms' }));

  await expect(fetchCanonicalLegalDocument('privacy')).rejects.toThrow('HTTP 503');
  await expect(fetchCanonicalLegalDocument('privacy')).rejects.toThrow('invalid shape');
});

it('renders every canonical block type and opens the source document', async () => {
  jest.mocked(globalThis.fetch).mockResolvedValue(response(sampleDocument));

  await act(async () => {
    view = create(<LegalDocumentContent type="privacy" />);
    await Promise.resolve();
  });

  expect(rendered().root.findByProps({ children: 'Your privacy' })).toBeTruthy();
  expect(rendered().root.findByProps({ children: 'Plain paragraph' })).toBeTruthy();
  expect(rendered().root.findByProps({ children: 'Important notice' })).toBeTruthy();
  expect(rendered().root.findByProps({ children: 'First item' })).toBeTruthy();
  expect(rendered().root.findAllByProps({ children: '•' })).toHaveLength(2);

  act(() => view?.root.findByProps({ accessibilityRole: 'link' }).props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith(sampleDocument.sourceUrl);
});

it('keeps a newer bundled policy when the deployed Club artifact is stale', async () => {
  const staleDocument: LegalDocument = {
    ...sampleDocument,
    revision: '24 September 2026',
    blocks: [{ type: 'paragraph', text: 'Outdated binding copy' }],
  };
  jest.mocked(globalThis.fetch).mockResolvedValue(response(staleDocument));

  await act(async () => {
    view = create(<LegalDocumentContent type="privacy" />);
    await Promise.resolve();
  });

  expect(rendered().root.findAllByProps({ children: 'Outdated binding copy' })).toHaveLength(0);
  expect(JSON.stringify(rendered().toJSON())).toContain('25 September 2026');
});

it('keeps the bundled policy when equal revision labels contain different text', async () => {
  const mismatchedDocument: LegalDocument = {
    ...sampleDocument,
    revision: '25 September 2026',
    blocks: [{ type: 'paragraph', text: 'Same-date stale binding copy' }],
  };
  jest.mocked(globalThis.fetch).mockResolvedValue(response(mismatchedDocument));

  await act(async () => {
    view = create(<LegalDocumentContent type="privacy" />);
    await Promise.resolve();
  });

  expect(rendered().root.findAllByProps({ children: 'Same-date stale binding copy' })).toHaveLength(0);
});

it('accepts a deployed Club policy with a newer revision', async () => {
  const newerDocument: LegalDocument = {
    ...sampleDocument,
    revision: '26 September 2026',
    blocks: [{ type: 'paragraph', text: 'Newer binding copy' }],
  };
  jest.mocked(globalThis.fetch).mockResolvedValue(response(newerDocument));

  await act(async () => {
    view = create(<LegalDocumentContent type="privacy" />);
    await Promise.resolve();
  });

  expect(rendered().root.findByProps({ children: 'Newer binding copy' })).toBeTruthy();
});

it.each([
  'not a revision',
  '25 Smarch 2026',
  '99 September 2026',
])('ignores a deployed Club policy with invalid revision %s', async (revision) => {
  const invalidDocument: LegalDocument = {
    ...sampleDocument,
    revision,
    blocks: [{ type: 'paragraph', text: 'Invalid binding copy' }],
  };
  jest.mocked(globalThis.fetch).mockResolvedValue(response(invalidDocument));

  await act(async () => {
    view = create(<LegalDocumentContent type="privacy" />);
    await Promise.resolve();
  });

  expect(rendered().root.findAllByProps({ children: 'Invalid binding copy' })).toHaveLength(0);
});

it('does not fetch while an inactive drawer uses its bundled fallback', async () => {
  await act(async () => {
    view = create(<LegalDocumentContent type="terms" active={false} />);
  });

  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(rendered().root.findByProps({ accessibilityRole: 'link' })).toBeTruthy();
});

it('keeps the fallback on network errors and ignores abort errors', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('offline'));

  await act(async () => {
    view = create(<LegalDocumentContent type="privacy" />);
    await Promise.resolve();
  });
  expect(warn).toHaveBeenCalledWith(
    '[Legal] Using bundled canonical document fallback.',
    expect.any(Error),
  );

  act(() => view?.unmount());
  view = undefined;
  warn.mockClear();
  const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
  jest.mocked(globalThis.fetch).mockRejectedValueOnce(abortError);

  await act(async () => {
    view = create(<LegalDocumentContent type="terms" />);
    await Promise.resolve();
  });
  expect(warn).not.toHaveBeenCalled();
});

it('aborts an in-flight canonical request when the content unmounts', async () => {
  jest.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => undefined));

  await act(async () => {
    view = create(<LegalDocumentContent type="privacy" />);
  });
  const signal = jest.mocked(globalThis.fetch).mock.calls[0][1]?.signal;

  act(() => view?.unmount());
  view = undefined;
  expect(signal?.aborted).toBe(true);
});
