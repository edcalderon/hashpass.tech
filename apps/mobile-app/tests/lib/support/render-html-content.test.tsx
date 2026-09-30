/// <reference types="jest" />
import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { Linking, Text } from 'react-native';

import { ATTACHMENT_LINK_SCHEME, SupportRichText } from '../../../lib/support/render-html-content';

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

// The line-level <Text> wraps a bullet string plus nested segment <Text>
// instances; a "leaf" segment Text has only string children, so filtering on
// that separates individual formatted spans (with their real style/onPress)
// from the line wrapper found alongside them by findAllByType.
function leafSegments(): ReactTestInstance[] {
  return view.root.findAllByType(Text).filter((node) => node.children.every((child) => typeof child === 'string'));
}

function leafText(node: ReactTestInstance): string {
  return node.children.filter((child): child is string => typeof child === 'string').join('');
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

  // decodeEntities: numeric decimal/hex + named fallback
  describe('entity decoding', () => {
    it('decodes decimal numeric entities to the right codepoint', () => {
      expect(renderedText('<p>&#65;&#8211;</p>')).toBe('A–');
    });

    it('decodes hex numeric entities (lowercase and uppercase x)', () => {
      expect(renderedText('<p>&#x41;&#X2014;</p>')).toBe('A—');
    });

    it('leaves a bogus numeric entity (not a real codepoint) as-is', () => {
      // &#xZZZZ; doesn't match the regex at all (no hex digits), but
      // &#999999999; does match and yields a non-finite Number, which should
      // fall back to the original matched text verbatim.
      expect(renderedText('<p>&#999999999;</p>')).toBe('&#999999999;');
    });

    it('decodes named entities from the allowlist', () => {
      expect(renderedText('<p>&amp;&lt;&gt;&quot;&apos;&nbsp;</p>')).toBe('&<>\"\' ');
    });

    it('leaves unknown named entities untouched', () => {
      expect(renderedText('<p>&doesnotexist;</p>')).toBe('&doesnotexist;');
    });
  });

  // Block tags and the list-item bullet
  describe('block tags and lists', () => {
    it('pushes a line on <br> and on block-tag close, including list items with their bullet', () => {
      act(() => {
        view = create(<SupportRichText html="<p>first</p><p>second<br/>third</p><ul><li>alpha</li><li>beta</li></ul>" />);
      });
      const joined = view.root
        .findAllByType(Text)
        .map((n) => n.children.filter((c) => typeof c === 'string').join(''))
        .join('');
      expect(joined).toContain('first');
      expect(joined).toContain('second');
      expect(joined).toContain('third');
      expect(joined).toContain('•  alpha');
      expect(joined).toContain('•  beta');
    });

    it('drops Frappe-style trailing empty <p></p> blocks', () => {
      expect(renderedText('<p>hi</p><p></p>')).toBe('hi');
    });

    it('self-closing block tags flush a line too', () => {
      expect(renderedText('<p>alpha</p><div/>')).toBe('alpha');
    });
  });

  // Inline formatting: bold/italic/underline/code tags
  describe('inline formatting', () => {
    it('marks <strong>/<b> text as bold, <em>/<i> as italic, <u> as underline, <code>/<pre> as code', () => {
      act(() => {
        view = create(
          <SupportRichText html="<p><b>one</b> <strong>two</strong> <em>three</em> <i>four</i> <u>five</u> <code>six</code> <pre>seven</pre></p>" />,
        );
      });
      const leaves = leafSegments();
      const labels = leaves.map(leafText);
      expect(labels).toContain('one');
      expect(labels).toContain('six');
      expect(labels).toContain('seven');

      const styleOf = (label: string) => {
        const node = leaves.find((n) => leafText(n) === label)!;
        return node.props.style as Record<string, unknown>;
      };

      expect(styleOf('one').fontWeight).toBe('700');
      expect(styleOf('two').fontWeight).toBe('700');
      expect(styleOf('three').fontStyle).toBe('italic');
      expect(styleOf('four').fontStyle).toBe('italic');
      expect(styleOf('five').textDecorationLine).toBe('underline');
      expect(styleOf('six').fontFamily).toBe('monospace');
      expect(styleOf('seven').fontFamily).toBe('monospace');
    });

    it('drops unrecognized tags (img, span, etc.) silently with no error', () => {
      // The span is dropped but its inner text is preserved; the dropped
      // <img /> tag leaves a gap between the surrounding whitespace tokens,
      // which is intentional -- we never synthesize new text from tag
      // attributes, and we never collapse adjacent text tokens.
      expect(renderedText('<p>before <span class="x">mid</span> <img src="x" /> after</p>')).toBe('before mid  after');
    });

    it('treats a malformed tag (no tag name) as unrecognized and drops it', () => {
      // `</>` is tokenized as a tag but has no tag name -- the regex falls
      // through to tag='' and the tag is silently ignored like any other
      // unrecognized one.
      expect(renderedText('<p>a</>b</p>')).toBe('ab');
    });
  });

  // Anchor parsing (with/without href, closing tag, href entity decoding)
  describe('anchors', () => {
    it('renders a link with a decoded href, underlines it, and opens it on press', async () => {
      const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      try {
        act(() => {
          view = create(<SupportRichText html='<p><a href="https://hashpass.tech/api?a=1&amp;b=2">visit</a></p>' linkColor="#1234ff" />);
        });
        const linkLeaf = leafSegments().find((n) => leafText(n) === 'visit')!;
        expect(linkLeaf).toBeTruthy();
        const style = linkLeaf.props.style as Record<string, unknown>;
        expect(style.textDecorationLine).toBe('underline');
        expect(style.color).toBe('#1234ff');
        // The underlying href must survive entity decoding so the ampersand
        // survives &amp; → "&" round-tripping.
        await act(async () => {
          await linkLeaf.props.onPress();
        });
        expect(openUrl).toHaveBeenCalledTimes(1);
        expect(openUrl).toHaveBeenCalledWith('https://hashpass.tech/api?a=1&b=2');
      } finally {
        openUrl.mockRestore();
      }
    });

    it('handles a link with no href (hrefStack pushes null), then popping on </a>', () => {
      act(() => {
        view = create(<SupportRichText html='<p><a>no href</a> after</p>' />);
      });
      const leaves = leafSegments();
      const noHref = leaves.find((n) => leafText(n) === 'no href')!;
      // No href means no underline and no onPress handler.
      expect((noHref.props.style as Record<string, unknown>).textDecorationLine).toBeUndefined();
      expect(noHref.props.onPress).toBeUndefined();
    });

    it('decodes a single-quoted href via the second capture group', async () => {
      const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      try {
        act(() => {
          view = create(<SupportRichText html="<p><a href='https://hashpass.tech'>x</a></p>" />);
        });
        const linkLeaf = leafSegments().find((n) => leafText(n) === 'x')!;
        await act(async () => {
          await linkLeaf.props.onPress();
        });
        expect(openUrl).toHaveBeenCalledWith('https://hashpass.tech');
      } finally {
        openUrl.mockRestore();
      }
    });
  });

  // Empty-html short-circuit returns null
  it('returns null when given no html at all', () => {
    act(() => {
      view = create(<SupportRichText html="" />);
    });
    expect(view.toJSON()).toBeNull();
  });

  // Attachment link chip rendering + onPress wiring
  describe('attachment chips', () => {
    it('renders an attachment-link segment as a chip with the paperclip glyph and fires onAttachmentPress with the file token and label', async () => {
      const onPress = jest.fn();
      act(() => {
        view = create(
          <SupportRichText
            html={`<p><a href="${ATTACHMENT_LINK_SCHEME}token-xyz">invoice.pdf</a></p>`}
            linkColor="#0a0"
            onAttachmentPress={onPress}
          />,
        );
      });
      const chipLeaf = leafSegments().find((n) => leafText(n).includes('invoice.pdf'))!;
      expect(chipLeaf).toBeTruthy();
      expect(leafText(chipLeaf)).toBe('📎 invoice.pdf');
      const style = chipLeaf.props.style as Record<string, unknown>[];
      // attachmentChip style object contributes fontWeight: 600; plus the
      // link color is forwarded from linkColor.
      const flat = Object.assign({}, ...style);
      expect(flat.fontWeight).toBe('600');
      expect(flat.color).toBe('#0a0');

      await act(async () => {
        await chipLeaf.props.onPress();
      });
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledWith('token-xyz', 'invoice.pdf');
    });

    it('does not throw when an attachment chip is pressed but no onAttachmentPress was provided', async () => {
      act(() => {
        view = create(
          <SupportRichText html={`<p><a href="${ATTACHMENT_LINK_SCHEME}tok">x</a></p>`} />,
        );
      });
      const chipLeaf = leafSegments().find((n) => leafText(n).includes('x'))!;
      await expect(act(async () => {
        await chipLeaf.props.onPress();
      })).resolves.toBeUndefined();
    });
  });
});
