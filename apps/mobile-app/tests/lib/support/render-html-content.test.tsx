/// <reference types="jest" />
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

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
});
