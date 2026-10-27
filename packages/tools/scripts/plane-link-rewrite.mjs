import { posix } from "node:path";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Resolve one link target against the source document's directory; null means "leave it alone". */
function resolveTarget(target, sourcePath, base) {
  if (!target || target.startsWith("#") || target.startsWith("//") || SCHEME.test(target)) return null;
  const hashAt = target.indexOf("#");
  const pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
  const fragment = hashAt === -1 ? "" : target.slice(hashAt);
  const queryAt = pathPart.indexOf("?");
  const filePart = queryAt === -1 ? pathPart : pathPart.slice(0, queryAt);
  const query = queryAt === -1 ? "" : pathPart.slice(queryAt);
  if (!filePart) return null;
  const resolved = filePart.startsWith("/")
    ? posix.normalize(filePart.slice(1))
    : posix.normalize(posix.join(posix.dirname(sourcePath), filePart));
  if (resolved.startsWith("..")) return null; // escapes the repository; nothing sensible to point at
  return `${base}${resolved}${query}${fragment}`;
}

/**
 * Rewrite repository-relative Markdown link targets so they still resolve once the body is copied out of
 * its original directory (for example into a Plane page). Handles inline links and images, angle-bracket
 * targets and reference definitions. Fenced code blocks are left untouched.
 */
export function rewriteRelativeLinks(markdown, sourcePath, base) {
  const swap = (target) => resolveTarget(target, sourcePath, base) ?? target;
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line
        .replace(/(\]\()(<[^>]*>|[^)\s]*)((?:\s+(?:"[^"]*"|'[^']*'))?\))/g, (_m, open, target, close) => {
          const angle = target.startsWith("<") && target.endsWith(">");
          const inner = angle ? target.slice(1, -1) : target;
          const next = swap(inner);
          return `${open}${angle ? `<${next}>` : next}${close}`;
        })
        .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(<[^>]*>|\S+)/, (_m, open, target) => {
          const angle = target.startsWith("<") && target.endsWith(">");
          const next = swap(angle ? target.slice(1, -1) : target);
          return `${open}${angle ? `<${next}>` : next}`;
        });
    })
    .join("\n");
}
