/// <reference types="jest" />
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Linking, Text } from 'react-native';

import { SupportRichText } from '../../../lib/support/render-html-content';

let view: ReactTestRenderer;
afterEach(() => {
  if (view) act(() => view.unmount());
});

function renderedText(html: string): string {
  act(() => {
    view = create(<SupportRichText html={html} />);
  });
  return view.root
    .findAllByType(Text)
    .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
    .join('');
}

describe('SupportRichText', () => {
  it('strips a straightforward <script> block entirely', () => {
    expect(renderedText('<p>hi</p><script>alert(1)</script><p>bye</p>')).toBe('hibye');
  });

  it('strips a <script> tag reconstituted from leftover fragments after one pass', () => {
    // A single, non-looped `replace` on this input only removes the inner
    // "<script>middle</script>" span (nearest non-greedy match), leaving
    // "<scr" and "ipt>" adjacent -- which splice back together into a
    // literal "<script>" that a single `.replace()` call never re-scans, so
    // "content</script>" survives into the tokenizer as real text. Looping
    // stripDangerousBlocks to a fixed point catches that reconstituted tag
    // on the next pass. Guards the CodeQL "incomplete multi-character
    // sanitization" finding.
    const payload = '<p>safe</p><scr<script>middle</script>ipt>content</script><p>after</p>';
    expect(renderedText(payload)).toBe('safeafter');
  });

  it('strips <style> blocks the same way', () => {
    expect(renderedText('<p>a</p><style>body{color:red}</style><p>b</p>')).toBe('ab');
  });

  it('renders only text from allowed formatting and block tags, decoding entities and list markers', () => {
    expect(renderedText('<p><strong>Bold</strong> &amp; <em>italic</em><br><code>const x = 1</code></p><ul><li>First&nbsp;item</li><li><u>Second</u></li></ul><img src="https://untrusted.example/image.png">'))
      .toBe('Bold & italicconst x = 1•  First item•  Second');
  });

  it('opens ordinary links through Linking without interpreting unrecognized markup', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    act(() => { view = create(<SupportRichText html={'<span>safe</span> <a href="https://hashpass.tech/docs?x=1&amp;y=2">docs</a>'} />); });
    const link = view.root.findAllByType(Text).find((node) => typeof node.props.onPress === 'function');
    expect(link).toBeDefined();
    await act(async () => { await link!.props.onPress(); });
    expect(openURL).toHaveBeenCalledWith('https://hashpass.tech/docs?x=1&y=2');
    openURL.mockRestore();
  });

  it('sends opaque attachment tokens to the supplied handler instead of opening them as URLs', () => {
    const onAttachmentPress = jest.fn();
    act(() => { view = create(<SupportRichText html={'<p><a href="hashpass-attachment://FILE-123">invoice.pdf</a></p>'} onAttachmentPress={onAttachmentPress} />); });
    const attachment = view.root.findAllByType(Text).find((node) => typeof node.props.onPress === 'function');
    expect(attachment).toBeDefined();
    act(() => attachment!.props.onPress());
    expect(onAttachmentPress).toHaveBeenCalledWith('FILE-123', 'invoice.pdf');
  });

  it('returns nothing for empty or entirely dangerous content', () => {
    act(() => { view = create(<SupportRichText html={'<script>alert(1)</script><style>p{display:none}</style>'} />); });
    expect(view.toJSON()).toBeNull();
  });
});
