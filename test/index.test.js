// test/index.test.js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  collectEntries,
  inferDate,
  inferDescription,
  inferTitle,
  parseHtmlFrontMatter,
  parseKeyValueBlock,
  parseTags,
  pathTags,
  renderFeedXml,
  renderIndexMarkdown,
} from "../lib/index.js";

/** Write a tree of files into a fresh temp directory and return its root. */
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "simpatico-index-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

// ================================================================
// front matter parsing
// ================================================================

test("parseKeyValueBlock parses flat key/value lines and unquotes values", () => {
  assert.deepEqual(
    parseKeyValueBlock('title: Foo\ndate: "2026-01-02"\n# comment\ntags: a, b'),
    { title: "Foo", date: "2026-01-02", tags: "a, b" },
  );
});

test("parseHtmlFrontMatter reads a leading comment block and meta tags", () => {
  const html = [
    "<!--",
    "---",
    "title: From Comment",
    "date: 2026-01-01",
    "---",
    "-->",
    '<html><head><title>From Title</title>',
    '<meta name="description" content="From meta">',
    "</head></html>",
  ].join("\n");

  const meta = parseHtmlFrontMatter(html);
  assert.equal(meta.title, "From Comment"); // comment wins over <title>
  assert.equal(meta.date, "2026-01-01");
  assert.equal(meta.description, "From meta");
});

test("parseHtmlFrontMatter falls back to <title> and supports property=", () => {
  const meta = parseHtmlFrontMatter(
    '<html><head><title>Just Title</title>' +
      '<meta property="tags" content="a, b"></head></html>',
  );
  assert.equal(meta.title, "Just Title");
  assert.equal(meta.tags, "a, b");
});

test("pathTags derives tags from the directory path", () => {
  assert.deepEqual(pathTags("lab/websocket/a.md", "lab"), ["websocket"]);
  assert.deepEqual(pathTags("lab/websocket/x/a.md", "lab"), ["websocket", "x"]);
  assert.deepEqual(pathTags("lab/a.md", "lab"), []);
  assert.deepEqual(pathTags("lab/a.md"), ["lab"]);
});

test("parseTags handles commas, spaces and brackets", () => {
  assert.deepEqual(parseTags("a, b"), ["a", "b"]);
  assert.deepEqual(parseTags("[x, y]"), ["x", "y"]);
  assert.deepEqual(parseTags("solo"), ["solo"]);
  assert.deepEqual(parseTags(""), []);
  assert.deepEqual(parseTags(undefined), []);
});

// ================================================================
// inference
// ================================================================

test("inferTitle prefers front matter, then heading, then filename", () => {
  assert.equal(inferTitle({ title: "Given" }, "# Ignored", "p.md"), "Given");
  assert.equal(inferTitle({}, "# Hello World\n\nbody", "p.md"), "Hello World");
  assert.equal(inferTitle({}, "no heading here", "my-page.md"), "My Page");
});

test("inferDescription uses front matter, then the first paragraph", () => {
  assert.equal(inferDescription({ description: "Given" }, "x", "p.md"), "Given");
  assert.equal(
    inferDescription({}, "# H\n## Sub\n\nThe first paragraph.\n\nMore.", "p.md"),
    "The first paragraph.",
  );
});

test("inferDate prefers front matter, then filename, then mtime", () => {
  assert.equal(inferDate({ date: "2020-01-01" }, "x.md", {}), "2020-01-01");
  assert.equal(inferDate({}, "2021-02-03-post.md", {}), "2021-02-03");
  assert.equal(
    inferDate({}, "x.md", { mtime: new Date("2022-03-04T00:00:00Z") }),
    "2022-03-04",
  );
});

// ================================================================
// collectEntries
// ================================================================

test("collectEntries recurses, collapses leaf dirs and ignores resources", () => {
  const root = fixture({
    "a.md": "---\ntitle: A\ndate: 2026-01-01\n---\nA",
    "b/b.md": "---\ntitle: B\ndate: 2026-02-01\n---\nB",
    "b/image.svg": "<svg/>",
    "c/index.md": "---\ntitle: C\ndate: 2026-03-01\n---\nC",
    "c/data.json": "{}",
    "d/one.md": "---\ntitle: One\ndate: 2025-01-01\n---\nOne",
    "d/two.md": "---\ntitle: Two\ndate: 2024-01-01\n---\nTwo",
    "litmd-header.html": "<title>{{title}}</title>",
    "node_modules/pkg/x.md": "---\ntitle: Nope\ndate: 2030-01-01\n---\nNope",
  });

  try {
    const entries = collectEntries(root, { documentRoot: root });
    assert.deepEqual(
      entries.map((entry) => entry.title),
      ["C", "B", "A", "One", "Two"],
    );
    // A lone index.md becomes the directory URL.
    assert.equal(entries[0].url, "/c/");
    // A leaf directory links straight to its page.
    assert.equal(entries[1].url, "/b/b.md");
    // Resources and server templates never become entries.
    assert.ok(!entries.some((entry) => entry.title === "Nope"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("collectEntries reads html front matter", () => {
  const root = fixture({
    "post.html":
      '<meta name="date" content="2026-06-01">' +
      '<meta name="tags" content="web">' +
      "<p>Opening line.</p>",
  });

  try {
    const [entry] = collectEntries(root, { documentRoot: root });
    assert.equal(entry.title, "Post");
    assert.equal(entry.date, "2026-06-01");
    assert.deepEqual(entry.tags, ["web"]);
    assert.equal(entry.description, "Opening line.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ================================================================
// rendering
// ================================================================

test("renderIndexMarkdown emits a four-column table with front matter", () => {
  const md = renderIndexMarkdown(
    [
      {
        date: "2026-01-01",
        title: "A <b>",
        url: "/a.md",
        tags: ["x"],
        description: "d",
      },
    ],
    { title: "Blog" },
  );

  assert.match(md, /^---\ntitle: Blog\n---/);
  assert.match(md, /class="index-table"/);
  assert.match(md, /<th>date<\/th><th>title<\/th><th>tags<\/th><th>description<\/th>/);
  assert.match(md, /<a href="\/a\.md">A &lt;b&gt;<\/a>/);
  // description is truncated to one line and revealed via title on hover
  assert.match(md, /<td class="index-desc"><span title="d">d<\/span><\/td>/);
});

test("renderFeedXml lists dated items with absolute links", () => {
  const xml = renderFeedXml(
    [{ date: "2026-01-01", title: "A", url: "/a.md", description: "d" }],
    { title: "Blog", baseUrl: "https://x", dirUrl: "/blog/" },
  );

  assert.match(xml, /<title>Blog<\/title>/);
  assert.match(xml, /<link>https:\/\/x\/a\.md<\/link>/);
  assert.match(xml, /<pubDate>Thu, 01 Jan 2026 00:00:00 GMT<\/pubDate>/);
});
