import path from 'node:path';

const FRONTMATTER_BOUNDARY = '---';

function stripFrontmatter(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== FRONTMATTER_BOUNDARY) return lines;

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONTMATTER_BOUNDARY,
  );
  return closingIndex === -1 ? lines : lines.slice(closingIndex + 1);
}

function resolveLink(label, target, sourceUrl) {
  if (target.startsWith('mailto:')) return label;
  if (target.startsWith('#')) return label;

  let resolvedTarget = target;
  if (!/^https?:\/\//i.test(target)) {
    const relativeTarget = target.replace(/\.md(?=$|#)/, '');
    resolvedTarget = new URL(
      sourceUrl.endsWith('/') ? `../${relativeTarget}` : relativeTarget,
      sourceUrl,
    ).toString();
  }

  return label === resolvedTarget || label === target
    ? label
    : `${label} (${resolvedTarget})`;
}

export function markdownToPlainText(value, sourceUrl) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, (_, label, target) =>
      resolveLink(label, target, sourceUrl),
    )
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([*_`[\]])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function flushParagraph(state, blocks, sourceUrl) {
  if (state.paragraph.length === 0) return;

  const text = markdownToPlainText(state.paragraph.join(' '), sourceUrl);
  if (text) blocks.push({ type: 'paragraph', text });
  state.paragraph = [];
}

function flushList(state, blocks, sourceUrl) {
  if (state.list.length === 0) return;

  blocks.push({
    type: 'list',
    items: state.list.map((item) => markdownToPlainText(item, sourceUrl)),
  });
  state.list = [];
}

function flushQuote(state, blocks, sourceUrl) {
  if (state.quote.length === 0) return;

  const text = markdownToPlainText(state.quote.join(' '), sourceUrl);
  if (text) blocks.push({ type: 'quote', text });
  state.quote = [];
}

function flushAll(state, blocks, sourceUrl) {
  flushParagraph(state, blocks, sourceUrl);
  flushList(state, blocks, sourceUrl);
  flushQuote(state, blocks, sourceUrl);
}

function frontmatterValue(markdown, key) {
  const match = markdown.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

export function parseLegalMarkdown({ id, markdown, sourcePath, sourceUrl }) {
  const blocks = [];
  const state = { paragraph: [], list: [], quote: [] };
  let title = frontmatterValue(markdown, 'title');
  let activeListIndex = -1;

  for (const rawLine of stripFrontmatter(markdown)) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushAll(state, blocks, sourceUrl);
      activeListIndex = -1;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushAll(state, blocks, sourceUrl);
      title = markdownToPlainText(trimmed.slice(2), sourceUrl);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushAll(state, blocks, sourceUrl);
      blocks.push({
        type: 'heading',
        text: markdownToPlainText(trimmed.slice(3), sourceUrl),
      });
      activeListIndex = -1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph(state, blocks, sourceUrl);
      flushList(state, blocks, sourceUrl);
      state.quote.push(trimmed.replace(/^>\s?/, ''));
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph(state, blocks, sourceUrl);
      flushQuote(state, blocks, sourceUrl);
      state.list.push(trimmed.replace(/^[-*]\s+/, ''));
      activeListIndex = state.list.length - 1;
      continue;
    }

    if (activeListIndex >= 0 && /^\s{2,}/.test(rawLine)) {
      state.list[activeListIndex] += ` ${trimmed}`;
      continue;
    }

    flushList(state, blocks, sourceUrl);
    flushQuote(state, blocks, sourceUrl);
    activeListIndex = -1;
    state.paragraph.push(trimmed);
  }

  flushAll(state, blocks, sourceUrl);

  const dateBlock = blocks.find(
    (block) => block.type === 'paragraph' && /^(Effective date|Last updated):/i.test(block.text),
  );
  const revision = dateBlock?.text.split('\n')[0].replace(/^[^:]+:\s*/, '') ?? '';

  return {
    id,
    title,
    description: frontmatterValue(markdown, 'description'),
    revision,
    sourcePath: path.posix.normalize(sourcePath.replaceAll(path.sep, '/')),
    sourceUrl,
    blocks,
  };
}
