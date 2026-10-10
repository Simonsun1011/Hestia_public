import { defaultUrlTransform } from "react-markdown";

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function stripDisplayFrontmatter(markdown = "") {
  return String(markdown).replace(FRONTMATTER, "");
}

export function vaultMarkdownUrlTransform(url = "") {
  const value = String(url);
  return /^(?:infans-doc|obsidian):/i.test(value) ? value : defaultUrlTransform(value);
}

function readableTarget(target, heading, explicitLabel) {
  if (explicitLabel?.trim()) return explicitLabel.trim();
  const title = String(target || "")
    .replace(/\.md$/i, "")
    .split("/")
    .at(-1)
    ?.replace(/^\d+_/, "")
    .trim();
  if (title && heading) return `${title} · ${heading}`;
  return title || heading || "查看相关档案";
}

function obsidianDocumentHref(target) {
  return `obsidian://open?vault=Infans_Studio&file=${encodeURIComponent(String(target).replace(/\.md$/i, ""))}`;
}

function wikiLinkNodes(value, sourcePath) {
  const nodes = [];
  let cursor = 0;
  for (const match of String(value).matchAll(WIKI_LINK)) {
    if (match.index > cursor) nodes.push({ type: "text", value: value.slice(cursor, match.index) });
    const rawTarget = match[1].trim();
    const [filePart, ...headingParts] = rawTarget.split("#");
    const heading = headingParts.join("#").trim();
    const target = (filePart.trim() || sourcePath || "").replace(/\.md$/i, "");
    const label = readableTarget(filePart, heading, match[2]);
    if (target) {
      nodes.push({
        type: "link",
        url: obsidianDocumentHref(target),
        title: `在 Obsidian 后台打开${label}`,
        children: [{ type: "text", value: label }],
      });
    } else {
      nodes.push({ type: "text", value: label });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

export function remarkVaultWikiLinks(options = {}) {
  const sourcePath = String(options.sourcePath || "").replace(/\.md$/i, "");
  return (tree) => {
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (["code", "inlineCode", "link", "definition"].includes(node.type)) return;
      if (!Array.isArray(node.children)) return;
      const children = [];
      for (const child of node.children) {
        if (child?.type === "text" && WIKI_LINK.test(child.value)) {
          WIKI_LINK.lastIndex = 0;
          children.push(...wikiLinkNodes(child.value, sourcePath));
        } else {
          visit(child);
          children.push(child);
        }
      }
      node.children = children;
    }
    visit(tree);
  };
}
