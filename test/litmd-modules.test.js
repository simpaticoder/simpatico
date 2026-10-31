import test from "node:test";
import assert from "node:assert/strict";

import {
  extractModules,
  compileMarkdownModule,
} from "../lib/litmd-modules.js";

function decodeMap(commentLine) {
  const match = /base64,([A-Za-z0-9+/=]+)/.exec(commentLine);
  assert.ok(match, "expected a data: sourceMappingURL");
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Minimal VLQ decoder: returns the absolute source line per generated line.
function decodeMappings(mappings) {
  let prevSourceLine = 0;
  return mappings.split(";").map((segment) => {
    if (segment === "") return null;
    const values = [];
    let shift = 0;
    let value = 0;
    for (const char of segment) {
      const digit = BASE64.indexOf(char);
      value += (digit & 31) << shift;
      if (digit & 32) {
        shift += 5;
      } else {
        const negative = value & 1;
        let result = value >> 1;
        if (negative) result = -result;
        values.push(result);
        value = 0;
        shift = 0;
      }
    }
    prevSourceLine += values[2];
    return prevSourceLine;
  });
}

test("extractModules finds a named js module and strips the directive", () => {
  const markdown = [
    "# Title",
    "",
    "```js",
    "/// @module field",
    "export function createField(svg) {",
    "  return svg;",
    "}",
    "```",
  ].join("\n");

  const modules = extractModules(markdown);

  assert.deepEqual([...modules.keys()], ["field"]);
  const field = modules.get("field");
  assert.equal(field.type, "js");
  assert.equal(field.contentType, "application/javascript");
  assert.ok(field.code.startsWith("export function createField"));
  assert.ok(!field.code.includes("@module"));
  assert.equal(field.startLine, 4, "startLine points at first non-directive line");
});

test("extractModules ignores ordinary js fences", () => {
  const markdown = [
    "```js",
    "console.log('demo, not a component');",
    "```",
  ].join("\n");

  assert.equal(extractModules(markdown).size, 0);
});

test("extractModules supports several modules in one document", () => {
  const markdown = [
    "```js",
    "/// @module a",
    "export const a = 1;",
    "```",
    "",
    "```js",
    "/// @module b",
    "export const b = 2;",
    "```",
  ].join("\n");

  assert.deepEqual([...extractModules(markdown).keys()], ["a", "b"]);
});

test("only a leading directive declares a module", () => {
  const markdown = [
    "```js",
    "const before = true;",
    "// @module late",
    "export const late = true;",
    "```",
  ].join("\n");

  assert.equal(extractModules(markdown).size, 0);
});

test("extractModules finds css, html, and svg resources", () => {
  const markdown = [
    "```css",
    "/*** @module field-styles",
    "#field { border: 1px solid #000; }",
    "```",
    "",
    "```html",
    "<!--- @module field-help",
    "<p>Drop an object to begin.</p>",
    "```",
    "",
    "```svg",
    "<!-- @module badge -->",
    "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\"/></svg>",
    "```",
  ].join("\n");

  const modules = extractModules(markdown);

  assert.deepEqual([...modules.keys()], ["field-styles", "field-help", "badge"]);
  assert.equal(modules.get("field-styles").contentType, "text/css");
  assert.equal(modules.get("field-help").contentType, "text/html");
  assert.equal(modules.get("badge").contentType, "image/svg+xml");

  assert.ok(!modules.get("field-styles").code.includes("@module"));
  assert.ok(!modules.get("field-help").code.includes("@module"));
  assert.ok(!modules.get("badge").code.includes("@module"));
  assert.ok(modules.get("badge").code.startsWith("<svg"));
});

test("an svg directive works without an XML comment", () => {
  const markdown = [
    "```svg",
    "@module plain",
    "<svg/>",
    "```",
  ].join("\n");

  assert.equal(extractModules(markdown).get("plain").code, "<svg/>");
});

test("duplicate module names are rejected", () => {
  const markdown = [
    "```js",
    "/// @module dup",
    "export const a = 1;",
    "```",
    "",
    "```css",
    "/*** @module dup",
    "a {}",
    "```",
  ].join("\n");

  assert.throws(() => extractModules(markdown), /Duplicate @module 'dup'/);
});

test("compileMarkdownModule returns a typed resource", () => {
  const markdown = [
    "```css",
    "/*** @module math",
    ".equation { color: blue; }",
    "```",
  ].join("\n");

  const resource = compileMarkdownModule(markdown, "math");

  assert.equal(resource.type, "css");
  assert.equal(resource.contentType, "text/css");
  assert.match(resource.code, /\.equation/);
  assert.ok(resource.code.startsWith("/*"), "css comment header");
  assert.ok(!resource.code.includes("/*** @module"));
});

test("compileMarkdownModule wraps the header in the right comment style", () => {
  const js = compileMarkdownModule("```js\n/// @module a\nexport const a=1;\n```\n", "a");
  const html = compileMarkdownModule("```html\n<!--- @module b\n<p>b</p>\n```\n", "b");
  const svg = compileMarkdownModule("```svg\n@module c\n<svg/>\n```\n", "c");

  assert.ok(js.code.startsWith("//"));
  assert.ok(html.code.startsWith("<!--"));
  assert.ok(svg.code.startsWith("<!--"));
});

test("compileMarkdownModule throws a 404-style error for a missing module", () => {
  const markdown = "```js\n/// @module a\nexport const a = 1;\n```\n";

  assert.throws(
    () => compileMarkdownModule(markdown, "nope"),
    (err) => {
      assert.equal(err.code, 404);
      assert.deepEqual(err.available, ["a"]);
      return true;
    },
  );
});

test("the header names the source markdown file", () => {
  const markdown = "```js\n/// @module a\nexport const a = 1;\n```\n";
  const {code} = compileMarkdownModule(markdown, "a", {sourcePath: "lab/viz.md"});

  assert.match(code.split("\n")[0], /lab\/viz\.md/);
  assert.match(code.split("\n")[0], /Edit the \.md, not this/);
});

test("js resources get a data: source map pointing at the markdown", () => {
  const markdown = ["# Doc", "", "```js", "/// @module a", "export const a = 1;", "```"].join("\n");
  const sourceUrl = "/__litmd__/lab/viz.md";
  const {code} = compileMarkdownModule(markdown, "a", {
    sourcePath: "lab/viz.md",
    sourceUrl,
    sourceContent: markdown,
  });

  const mapLine = code.split("\n").find((line) => line.startsWith("//#"));
  assert.ok(mapLine, "expected a //# sourceMappingURL comment");

  const map = decodeMap(mapLine);
  assert.equal(map.version, 3);
  assert.deepEqual(map.sources, [sourceUrl]);
  assert.deepEqual(map.sourcesContent, [markdown]);
});

test("css resources use a css source-map comment", () => {
  const markdown = "```css\n/*** @module s\na { color: red; }\n```\n";
  const {code} = compileMarkdownModule(markdown, "s", {
    sourceUrl: "/__litmd__/lab/viz.md",
    sourceContent: markdown,
  });

  assert.match(code, /\/\*# sourceMappingURL=data:application\/json/);
});

test("generated lines map back to the exact markdown lines", () => {
  const markdown = [
    "intro",
    "",
    "```js",
    "/// @module a",
    "export const first = 1;",
    "export function second() {",
    "  return first;",
    "}",
    "```",
  ].join("\n");

  const {code} = compileMarkdownModule(markdown, "a", {
    sourceUrl: "/__litmd__/lab/viz.md",
    sourceContent: markdown,
  });

  const lines = code.split("\n");
  if (lines.at(-1) === "") lines.pop(); // trailing newline from the final append
  const mapLine = lines.find((line) => line.startsWith("//#"));
  const mapLines = decodeMappings(decodeMap(mapLine).mappings);
  const mdLines = markdown.split("\n");

  assert.equal(mapLines.length, lines.length - 1, "one mapping per generated line, excluding the map comment");

  for (const needle of ["export const first = 1;", "export function second() {", "  return first;"]) {
    const g = lines.findIndex((line) => line.includes(needle));
    assert.ok(g >= 0, `generated line missing: ${needle}`);
    assert.equal(mapLines[g], mdLines.indexOf(needle), `wrong mapping for: ${needle}`);
  }
});
