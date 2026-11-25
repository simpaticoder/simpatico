/**
 * Dynamic index — generate a directory index (and optionally an RSS feed)
 * from the front matter of the pages beneath a directory.
 *
 * This is the runtime replacement for the static `blog.js` generator: instead
 * of writing an `index.md` on a build step, the server synthesises one on
 * request, so it can never go stale. `lib/blog.js` is intentionally left in
 * place for now.
 *
 * Conventions:
 *   page        a `.md` or `.html` file
 *   container   a directory that lists its pages and recurses into children
 *   leaf        a directory whose whole subtree is one page: it is treated as
 *               a single entry, so a page and its resources (images, data,
 *               fonts, …) can live together in their own subdirectory
 *
 * Front matter:
 *   `.md`   — a leading `---` fenced key/value block (shared with litmd)
 *   `.html` — a leading `<!-- ... -->` comment containing the same key/value
 *             block, and/or `<title>` and `<meta name="…" content="…">` tags
 *
 * Anything the front matter omits (title, date, description) is inferred:
 * title from the first heading (or filename), date from the filename or the
 * file mtime, description from the first paragraph.
 */

import fs from "node:fs";
import path from "node:path";

import { parseFrontMatter as parseMarkdownFrontMatter } from "./litmd.js";

const PAGE_EXTENSIONS = new Set([".md", ".html"]);
const INDEX_FILES = new Set(["index.md", "index.html"]);
const SKIP_DIRS = new Set(["node_modules", "vendor"]);

// Server template partials are interpolated into pages; they are not content.
const TEMPLATE_FILE = /^litmd-.*\.html$/i;

// ------------------------------------------------------------------ helpers

const posix = (p) => p.split(path.sep).join("/");

export const titleCase = (value) =>
  String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const stripHtml = (value) => String(value).replace(/<[^>]*>/g, "").trim();

const isPage = (name) => PAGE_EXTENSIONS.has(path.extname(name).toLowerCase());

const isIndexFile = (name) => INDEX_FILES.has(path.basename(name).toLowerCase());

const unquote = (value) => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
};

/** Parse a flat `key: value` block (shared by md and html front matter). */
export function parseKeyValueBlock(block) {
  const meta = {};
  for (const raw of String(block).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) continue;
    meta[key] = unquote(line.slice(separator + 1).trim());
  }
  return meta;
}

/**
 * Read front matter from an HTML document: an optional leading comment block
 * (`<!-- --- ... --- -->` or just `<!-- key: value ... -->`), plus `<title>`
 * and `<meta name="…" content="…">` tags. Comment values win over meta tags.
 */
export function parseHtmlFrontMatter(content) {
  const text = String(content);
  const meta = {};

  const comment = /^\s*<!--([\s\S]*?)-->/.exec(text);
  if (comment) {
    const fenced = /---\s*\r?\n([\s\S]*?)\r?\n\s*---/.exec(comment[1]);
    Object.assign(meta, parseKeyValueBlock(fenced ? fenced[1] : comment[1]));
  }

  const tag = /<meta\s+([^>]*?)\/?>/gi;
  let match;
  while ((match = tag.exec(text)) !== null) {
    const attrs = {};
    const attrRe = /([\w:-]+)\s*=\s*["']([^"']*)["']/g;
    let attr;
    while ((attr = attrRe.exec(match[1])) !== null) attrs[attr[1].toLowerCase()] = attr[2];
    const key = attrs.name || attrs.property;
    if (key && attrs.content !== undefined && meta[key] === undefined) {
      meta[key] = attrs.content.trim();
    }
  }

  const title = /<title>([^<]*)<\/title>/i.exec(text);
  if (title && meta.title === undefined) meta.title = title[1].trim();

  return meta;
}

/** Front matter for any page, keyed by file type. */
export function parsePageMeta(filePath, content) {
  if (filePath.toLowerCase().endsWith(".html")) {
    return parseHtmlFrontMatter(content);
  }
  return parseMarkdownFrontMatter(String(content)).attributes;
}

export function parseTags(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .replace(/^\[|\]$/g, "")
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// --------------------------------------------------------------- inference

export function inferTitle(attributes, content, filePath) {
  if (attributes.title) return attributes.title;

  const text = String(content);
  if (filePath.toLowerCase().endsWith(".html")) {
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text);
    if (heading) return stripHtml(heading[1]);
  } else {
    const body = parseMarkdownFrontMatter(text).body;
    const heading = /^ *#\s+(.+)$/m.exec(body);
    if (heading) return heading[1].trim();
  }

  return titleCase(path.basename(filePath).replace(/\.(md|html)$/i, ""));
}

export function inferDescription(attributes, content, filePath) {
  if (attributes.description) return attributes.description;

  const text = String(content);
  if (filePath.toLowerCase().endsWith(".html")) {
    const paragraph = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(text);
    return paragraph ? stripHtml(paragraph[1]).slice(0, 240) : "";
  }

  const body = parseMarkdownFrontMatter(text).body;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith("```") || line.startsWith("<!--")) continue;
    if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith(">")) continue;
    if (line.startsWith("![")) continue;
    return line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").slice(0, 240);
  }
  return "";
}

export function inferDate(attributes, filePath, stat) {
  if (attributes.date) return String(attributes.date);
  const match = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(filePath));
  if (match) return match[1];
  if (stat?.mtime) return new Date(stat.mtime).toISOString().slice(0, 10);
  return "";
}

// -------------------------------------------------------------- collection

function makeEntry(filePath, documentRoot, io) {
  const content = io.readFileSync(filePath, "utf8");
  const stat = io.statSync(filePath);
  const attributes = parsePageMeta(filePath, content);
  const rel = posix(path.relative(documentRoot, filePath));
  const dir = posix(path.dirname(rel));

  return {
    relPath: rel,
    url: isIndexFile(filePath)
      ? dir === "." ? "/" : `/${dir}/`
      : `/${rel}`,
    title: inferTitle(attributes, content, filePath),
    date: inferDate(attributes, filePath, stat),
    description: inferDescription(attributes, content, filePath),
    tags: parseTags(attributes.tags),
    attributes,
    filePath,
    mtimeMs: stat.mtimeMs ?? 0,
  };
}

function walk(dir, documentRoot, io) {
  let dirents;
  try {
    dirents = io.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  const subdirs = [];
  for (const entry of dirents) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      // A nested package.json marks a separate project, not site content.
      const child = path.join(dir, entry.name);
      if (io.existsSync && io.existsSync(path.join(child, "package.json"))) continue;
      subdirs.push(child);
    } else if (isPage(entry.name) && !TEMPLATE_FILE.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }

  const childEntries = subdirs.flatMap((sub) => walk(sub, documentRoot, io));

  // Leaf: the whole subtree is a single page (the page plus its resources).
  if (files.length === 1 && childEntries.length === 0) {
    return [makeEntry(files[0], documentRoot, io)];
  }

  const own = files
    .filter((file) => !isIndexFile(file))
    .map((file) => makeEntry(file, documentRoot, io));

  return own.concat(childEntries);
}

/**
 * Collect the entries beneath `dir`, recursively.
 * @returns {Array<object>} entries sorted by date, newest first.
 */
export function collectEntries(dir, { documentRoot, io = fs } = {}) {
  const entries = walk(dir, documentRoot ?? dir, io);
  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

// --------------------------------------------------------------- rendering

/** A markdown document (front matter + HTML table) for the litmd pipeline. */
export function renderIndexMarkdown(entries, { title = "Index", description = "" } = {}) {
  const front = ["---", `title: ${title}`];
  if (description) front.push(`description: ${description}`);
  front.push("---");

  const rows = entries
    .map((entry) => {
      const description = escapeHtml(entry.description);
      // Truncated to one line; `title` reveals the whole thing on hover (and
      // the shared span[title] handler shows it on click/tap).
      const descriptionCell = description
        ? `<span title="${description}">${description}</span>`
        : "";
      return (
        "      <tr>" +
        `<td>${escapeHtml(entry.date)}</td>` +
        `<td><a href="${escapeHtml(entry.url)}">${escapeHtml(entry.title)}</a></td>` +
        `<td>${escapeHtml(entry.tags.join(", "))}</td>` +
        `<td class="index-desc">${descriptionCell}</td>` +
        "</tr>"
      );
    })
    .join("\n");

  const table = [
    '<table class="index-table">',
    "  <thead><tr><th>date</th><th>title</th><th>tags</th><th>description</th></tr></thead>",
    "  <tbody>",
    rows,
    "  </tbody>",
    "</table>",
  ].join("\n");

  return `${front.join("\n")}\n\n${table}\n`;
}

export function renderFeedXml(entries, { title = "", description = "", baseUrl = "", dirUrl = "/" } = {}) {
  const items = entries
    .filter((entry) => entry.date)
    .map((entry) => {
      const link = `${baseUrl}${entry.url}`;
      return [
        "        <item>",
        `            <title>${escapeHtml(entry.title)}</title>`,
        `            <link>${escapeHtml(link)}</link>`,
        `            <description>${escapeHtml(entry.description || entry.title)}</description>`,
        `            <pubDate>${new Date(`${entry.date}T00:00:00Z`).toUTCString()}</pubDate>`,
        `            <guid isPermaLink="true">${escapeHtml(link)}</guid>`,
        "        </item>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>${escapeHtml(title)}</title>
        <link>${escapeHtml(`${baseUrl}${dirUrl}`)}</link>
        <description>${escapeHtml(description)}</description>
${items}
    </channel>
</rss>
`;
}
