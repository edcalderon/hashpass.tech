import {parseFragment} from "parse5";
import {Schema} from "prosemirror-model";
import {prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode} from "y-prosemirror";
import * as Y from "yjs";

const nodeAttrs = (node) => Object.fromEntries((node.attrs ?? []).map(({name, value}) => [name, value]));
const attr = (node, name) => nodeAttrs(node)[name] ?? null;
const children = (node) => node.childNodes ?? [];
const isElement = (node, tagName) => node?.nodeName === tagName;
const BLOCK_TAGS = new Set([
  "blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol", "p", "pre", "table", "ul",
]);
const safeUrl = (value) => {
  if (!value) return "";
  try {
    const protocol = new URL(value, "https://plane.invalid").protocol;
    return ["http:", "https:", "mailto:", "tel:"].includes(protocol) ? value : "";
  } catch {
    return "";
  }
};

const marks = {
  bold: {},
  italic: {},
  underline: {},
  strike: {},
  code: {},
  link: {
    attrs: {
      href: {},
      target: {default: null},
      rel: {default: null},
      class: {default: null},
    },
  },
};

const nodes = {
  doc: {content: "block+"},
  paragraph: {
    content: "inline*",
    group: "block",
    attrs: {textAlign: {default: null}},
  },
  heading: {
    attrs: {level: {}, textAlign: {default: null}},
    content: "inline*",
    group: "block",
  },
  blockquote: {content: "block+", group: "block"},
  codeBlock: {
    content: "text*",
    group: "block",
    code: true,
    marks: "",
    attrs: {language: {default: null}},
  },
  horizontalRule: {group: "block"},
  bulletList: {content: "listItem+", group: "block"},
  orderedList: {
    content: "listItem+",
    group: "block",
    attrs: {order: {default: 1}},
  },
  listItem: {content: "paragraph block*"},
  table: {content: "tableRow+", group: "block"},
  tableRow: {
    content: "(tableCell | tableHeader)*",
    attrs: {background: {default: null}, textColor: {default: null}},
  },
  tableCell: {
    content: "block+",
    isolating: true,
    attrs: {
      colspan: {default: 1},
      rowspan: {default: 1},
      colwidth: {default: [150]},
      background: {default: null},
      textColor: {default: null},
    },
  },
  tableHeader: {
    content: "block+",
    isolating: true,
    attrs: {
      colspan: {default: 1},
      rowspan: {default: 1},
      colwidth: {default: [150]},
      background: {default: "none"},
    },
  },
  image: {
    group: "block",
    draggable: true,
    attrs: {
      src: {default: null},
      alt: {default: null},
      title: {default: null},
      width: {default: "35%"},
      height: {default: null},
      aspectRatio: {default: null},
      alignment: {default: "left"},
    },
  },
  hardBreak: {inline: true, group: "inline", selectable: false},
  text: {group: "inline"},
};

const schema = new Schema({nodes, marks});

const textContent = (node) => children(node).map((child) => {
  if (child.nodeName === "#text") return child.value;
  return textContent(child);
}).join("");

const inlineNodes = (input, activeMarks = []) => input.flatMap((node) => {
  if (node.nodeName === "#text") {
    return node.value ? [{type: "text", text: node.value, ...(activeMarks.length ? {marks: activeMarks} : {})}] : [];
  }
  if (!node.tagName) return [];

  const tag = node.tagName.toLowerCase();
  const nextMark = {
    strong: {type: "bold"},
    b: {type: "bold"},
    em: {type: "italic"},
    i: {type: "italic"},
    u: {type: "underline"},
    s: {type: "strike"},
    del: {type: "strike"},
    strike: {type: "strike"},
    code: {type: "code"},
  }[tag];
  if (nextMark) return inlineNodes(children(node), [...activeMarks, nextMark]);
  if (tag === "a") {
    return inlineNodes(children(node), [...activeMarks, {
      type: "link",
      attrs: {
        href: safeUrl(attr(node, "href")),
        target: attr(node, "target"),
        rel: attr(node, "rel"),
        class: attr(node, "class"),
      },
    }]);
  }
  if (tag === "br") return [{type: "hardBreak", ...(activeMarks.length ? {marks: activeMarks} : {})}];
  return inlineNodes(children(node), activeMarks);
});

const paragraph = (node) => ({
  type: "paragraph",
  attrs: {textAlign: null},
  content: inlineNodes(children(node)),
});

const listItem = (node) => {
  const blocks = blockNodes(children(node));
  if (!blocks.length) return {type: "listItem", content: [{type: "paragraph", attrs: {textAlign: null}}]};
  if (blocks[0].type !== "paragraph") blocks.unshift({type: "paragraph", attrs: {textAlign: null}});
  return {type: "listItem", content: blocks};
};

const tableCell = (node) => {
  const blocks = blockNodes(children(node));
  const tag = node.tagName.toLowerCase();
  const style = attr(node, "style") ?? "";
  const background = attr(node, "background") ?? (style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] ?? null);
  const rawColwidth = attr(node, "colwidth");
  return {
    type: tag === "th" ? "tableHeader" : "tableCell",
    attrs: {
      colspan: Number(attr(node, "colspan") ?? 1),
      rowspan: Number(attr(node, "rowspan") ?? 1),
      colwidth: rawColwidth ? rawColwidth.split(",").map((value) => Number(value.trim())).filter(Number.isFinite) : [150],
      ...(tag === "th" ? {background: background ?? "none"} : {background, textColor: attr(node, "textColor")}),
    },
    content: blocks.length ? blocks : [{type: "paragraph", attrs: {textAlign: null}}],
  };
};

function blockNodes(input) {
  return input.flatMap((node) => {
    if (node.nodeName === "#text") return node.value.trim() ? [paragraph({childNodes: [node]})] : [];
    if (!node.tagName) return [];

    const tag = node.tagName.toLowerCase();
    if (tag === "p") return [paragraph(node)];
    if (/^h[1-6]$/.test(tag)) {
      return [{
        type: "heading",
        attrs: {level: Number(tag.slice(1)), textAlign: null},
        content: inlineNodes(children(node)),
      }];
    }
    if (tag === "blockquote") {
      const content = blockNodes(children(node));
      return [{type: "blockquote", content: content.length ? content : [{type: "paragraph", attrs: {textAlign: null}}]}];
    }
    if (tag === "pre") return [{type: "codeBlock", attrs: {language: null}, content: textContent(node) ? [{type: "text", text: textContent(node)}] : []}];
    if (tag === "hr") return [{type: "horizontalRule"}];
    if (tag === "img" && attr(node, "src")) {
      const src = safeUrl(attr(node, "src"));
      if (!src) return [];
      return [{
        type: "image",
        attrs: {
          src,
          alt: attr(node, "alt"),
          title: attr(node, "title"),
          width: attr(node, "width") ?? "35%",
          height: attr(node, "height"),
          aspectRatio: attr(node, "aspectRatio"),
          alignment: attr(node, "alignment") ?? "left",
        },
      }];
    }
    if (tag === "ul" || tag === "ol") {
      const items = children(node).filter((child) => isElement(child, "li")).map(listItem);
      if (!items.length) return [];
      return [{
        type: tag === "ul" ? "bulletList" : "orderedList",
        ...(tag === "ol" ? {attrs: {order: Number(attr(node, "start") ?? 1)}} : {}),
        content: items,
      }];
    }
    if (tag === "table") {
      const rows = [];
      const visitRows = (current) => {
        for (const child of children(current)) {
          if (isElement(child, "tr")) rows.push({
            type: "tableRow",
            attrs: {background: attr(child, "background"), textColor: attr(child, "textColor")},
            content: children(child).filter((cell) => cell.tagName === "td" || cell.tagName === "th").map(tableCell),
          });
          else if (child.tagName) visitRows(child);
        }
      };
      visitRows(node);
      return rows.length ? [{type: "table", content: rows}] : [];
    }
    if (tag === "div") {
      const nestedBlocks = children(node).some((child) => child.tagName && BLOCK_TAGS.has(child.tagName.toLowerCase()));
      return nestedBlocks ? blockNodes(children(node)) : [paragraph(node)];
    }
    const nestedBlocks = children(node).some((child) => child.tagName && BLOCK_TAGS.has(child.tagName.toLowerCase()));
    return nestedBlocks ? blockNodes(children(node)) : [paragraph(node)];
  });
}

export function htmlToDocumentJson(html) {
  const content = blockNodes(parseFragment(html ?? "<p></p>").childNodes ?? []);
  return {type: "doc", content: content.length ? content : [{type: "paragraph", attrs: {textAlign: null}}]};
}

export function documentFormatsFromHtml(html) {
  const documentJson = htmlToDocumentJson(html);
  const yDoc = prosemirrorJSONToYDoc(schema, documentJson, "default");
  const normalizedJson = yXmlFragmentToProseMirrorRootNode(yDoc.getXmlFragment("default"), schema).toJSON();
  return {
    description_binary: Buffer.from(Y.encodeStateAsUpdate(yDoc)).toString("base64"),
    description_json: normalizedJson,
  };
}
