/**
 * Renders the limited rich-text HTML that Frappe Helpdesk's comment editor
 * (and our own attachment-link comments -- see frappe-support-client.ts)
 * produces, as native React Native Text/View nodes.
 *
 * Deliberately NOT a WebView or dangerouslySetInnerHTML: a support ticket
 * comment is untrusted-ish content (crosses a trust boundary from Frappe
 * staff input into the app), and this repo has no HTML sanitizer dependency.
 * A hand-rolled allowlist tokenizer that only ever produces RN Text/View
 * elements can't execute a script or load remote markup no matter what the
 * source string contains -- unlike dangerouslySetInnerHTML (web) or an HTML
 * WebView source (native), which both directly interpret injected markup.
 */
import React from 'react';
import { Linking, Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';

export const ATTACHMENT_LINK_SCHEME = 'hashpass-attachment://';

interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  code: boolean;
  href: string | null;
}

interface Line {
  segments: Segment[];
  isListItem: boolean;
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const num = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return code in ENTITY_MAP ? ENTITY_MAP[code] : match;
  });
}

// script/style content must never reach the text stream -- strip tag + body.
function stripDangerousBlocks(html: string): string {
  return html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
}

const BLOCK_TAGS = new Set(['p', 'div', 'li', 'ul', 'ol', 'br', 'blockquote']);

function parseLines(html: string): Line[] {
  const cleaned = stripDangerousBlocks(html);
  const tokens = cleaned.split(/(<[^>]+>)/g);

  const lines: Line[] = [];
  let currentSegments: Segment[] = [];
  let currentIsListItem = false;
  const marks = { bold: 0, italic: 0, underline: 0, code: 0 };
  let hrefStack: (string | null)[] = [];

  const pushLine = () => {
    // Skip fully-empty lines caused by e.g. Frappe's trailing "<p></p>".
    if (currentSegments.some((seg) => seg.text.trim().length > 0)) {
      lines.push({ segments: currentSegments, isListItem: currentIsListItem });
    }
    currentSegments = [];
    currentIsListItem = false;
  };

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith('<')) {
      const closing = token.startsWith('</');
      const tagMatch = token.match(/^<\/?\s*([a-zA-Z0-9]+)/);
      const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
      const selfClosing = /\/>\s*$/.test(token);

      if (tag === 'br') {
        pushLine();
        continue;
      }
      if (tag === 'li') {
        if (closing) pushLine();
        else currentIsListItem = true;
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        if (closing || selfClosing) pushLine();
        continue;
      }
      if (tag === 'strong' || tag === 'b') {
        marks.bold += closing ? -1 : 1;
        continue;
      }
      if (tag === 'em' || tag === 'i') {
        marks.italic += closing ? -1 : 1;
        continue;
      }
      if (tag === 'u') {
        marks.underline += closing ? -1 : 1;
        continue;
      }
      if (tag === 'code' || tag === 'pre') {
        marks.code += closing ? -1 : 1;
        continue;
      }
      if (tag === 'a') {
        if (closing) {
          hrefStack.pop();
        } else {
          const hrefMatch = token.match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i);
          hrefStack.push(hrefMatch ? decodeEntities(hrefMatch[1] || hrefMatch[2] || '') : null);
        }
        continue;
      }
      // Any other tag (img, span, table, etc.) is dropped silently -- no
      // attribute of an unrecognized tag is ever read or rendered.
      continue;
    }

    const text = decodeEntities(token).replace(/\s+/g, ' ');
    if (!text) continue;

    currentSegments.push({
      text,
      bold: marks.bold > 0,
      italic: marks.italic > 0,
      underline: marks.underline > 0,
      code: marks.code > 0,
      href: hrefStack.length ? hrefStack[hrefStack.length - 1] : null,
    });
  }
  pushLine();

  // Plain text with no block tags at all (e.g. the visitor's own typed
  // reply) never hits a BLOCK_TAGS close, so flush whatever's pending.
  if (lines.length === 0 && currentSegments.length) pushLine();

  return lines;
}

interface SupportRichTextProps {
  html: string;
  style?: TextStyle | (TextStyle | undefined | false)[];
  linkColor?: string;
  onAttachmentPress?: (fileToken: string, label: string) => void;
}

export function SupportRichText({ html, style, linkColor, onAttachmentPress }: SupportRichTextProps) {
  const lines = React.useMemo(() => parseLines(html || ''), [html]);

  if (lines.length === 0) return null;

  return (
    <View style={styles.container}>
      {lines.map((line, lineIndex) => (
        <Text key={lineIndex} style={[style, lineIndex > 0 ? styles.linePad : undefined]}>
          {line.isListItem ? '•  ' : ''}
          {line.segments.map((seg, segIndex) => {
            const isAttachment = seg.href?.startsWith(ATTACHMENT_LINK_SCHEME);
            const segStyle: TextStyle = {
              fontWeight: seg.bold ? '700' : undefined,
              fontStyle: seg.italic ? 'italic' : undefined,
              textDecorationLine: seg.underline || (seg.href && !isAttachment) ? 'underline' : undefined,
              fontFamily: seg.code ? Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) : undefined,
              color: seg.href ? linkColor : undefined,
            };

            if (isAttachment) {
              const fileToken = seg.href!.slice(ATTACHMENT_LINK_SCHEME.length);
              return (
                <Text
                  key={segIndex}
                  style={[segStyle, styles.attachmentChip, { color: linkColor }]}
                  onPress={() => onAttachmentPress?.(fileToken, seg.text)}
                >
                  {'📎 '}
                  {seg.text}
                </Text>
              );
            }

            if (seg.href) {
              return (
                <Text
                  key={segIndex}
                  style={segStyle}
                  onPress={() => Linking.openURL(seg.href!).catch(() => null)}
                >
                  {seg.text}
                </Text>
              );
            }

            return (
              <Text key={segIndex} style={segStyle}>
                {seg.text}
              </Text>
            );
          })}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  linePad: {
    marginTop: 2,
  },
  attachmentChip: {
    fontWeight: '600',
  },
});
