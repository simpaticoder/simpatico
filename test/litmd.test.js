import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import buildHtmlFromLiterateMarkdown from "../lib/litmd.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function render(markdown) {
  return buildHtmlFromLiterateMarkdown(
    Buffer.from(markdown),
    "test/fixture.md",
    { documentRoot: ROOT },
  );
}

function extractScripts(html) {
  const scripts = [];
  let s = 0;
  while ((s = html.indexOf('<script type="module">', s)) !== -1) {
    const e = html.indexOf("</script>", s);
    scripts.push(html.slice(s + '<script type="module">'.length, e));
    s = e + 1;
  }
  return scripts;
}

function parseMap(script) {
  const match =
    /sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)/.exec(
      script,
    );
  assert.ok(match, "expected a data: sourceMappingURL");
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

function scriptLines(script) {
  return script.replace(/\n\/\/# sourceMappingURL=.*$/m, "").split("\n");
}

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Minimal VLQ decoder: returns, per generated line, the first segment's
// absolute source line (0-based).
function decodeMappings(mappings) {
  let prevSource = 0;
  let prevSourceLine = 0;
  let prevSourceColumn = 0;

  return mappings.split(";").map((line) => {
    if (line === "") return [];
    return line.split(",").map((segment) => {
      const values = [];
      let shift = 0;
      let value = 0;
      for (const char of segment) {
        const digit = BASE64.indexOf(char);
        const continuation = digit & 32;
        value += (digit & 31) << shift;
        if (continuation) {
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
      const [generatedColumn, source, sourceLine, sourceColumn] = values;
      prevSource += source;
      prevSourceLine += sourceLine;
      prevSourceColumn += sourceColumn;
      return {
        generatedColumn,
        source: prevSource,
        sourceLine: prevSourceLine,
        sourceColumn: prevSourceColumn,
      };
    });
  });
}

test("JS blocks get a source map pointing at the markdown source", () => {
  const markdown = [
    "# Title",
    "",
    "```js",
    "const one = 1;",
    "function two() {",
    "  return one + 1;",
    "}",
    "```",
  ].join("\n");

  const [script] = extractScripts(render(markdown));
  const map = parseMap(script);

  assert.equal(map.version, 3);
  assert.equal(map.sources[0], "/__litmd__/test/fixture.md");
  assert.ok(map.sources[0].startsWith("/__litmd__/"), "must not collide with the page URL");
  assert.deepEqual(map.sourcesContent, [markdown.trim()]);

  const generated = scriptLines(script);
  const decoded = decodeMappings(map.mappings);
  assert.equal(decoded.length, generated.length);

  const mdLines = markdown.split("\n");
  for (const needle of ["const one = 1;", "function two() {", "  return one + 1;", "}"]) {
    const g = generated.indexOf(needle);
    const md = mdLines.indexOf(needle);
    assert.ok(g >= 0, `generated line missing: ${needle}`);
    assert.equal(decoded[g][0].sourceLine, md, `mapping wrong for: ${needle}`);
  }
});

test("non-executing (///) blocks are skipped and do not shift indices", () => {
  const markdown = [
    "```js",
    "/// does not execute",
    "const skipped = true;",
    "```",
    "",
    "```js",
    "const executed = true;",
    "```",
  ].join("\n");

  const scripts = extractScripts(render(markdown));
  assert.equal(scripts.length, 1, "only the executable block becomes a module");

  const [script] = scripts;
  const generated = scriptLines(script);
  const decoded = decodeMappings(parseMap(script).mappings);
  const mdLines = markdown.split("\n");

  const g = generated.indexOf("const executed = true;");
  assert.ok(g >= 0);
  assert.equal(decoded[g][0].sourceLine, mdLines.indexOf("const executed = true;"));
});

test("each JS block gets its own independently correct map", () => {
  const markdown = [
    "intro",
    "",
    "```js",
    "const first = 1;",
    "```",
    "",
    "middle",
    "",
    "```js",
    "const second = 2;",
    "```",
  ].join("\n");

  const scripts = extractScripts(render(markdown));
  assert.equal(scripts.length, 2);

  const mdLines = markdown.split("\n");

  scripts.forEach((script, i) => {
    const generated = scriptLines(script);
    const decoded = decodeMappings(parseMap(script).mappings);
    const needle = i === 0 ? "const first = 1;" : "const second = 2;";
    const g = generated.indexOf(needle);
    assert.ok(g >= 0);
    assert.equal(decoded[g][0].sourceLine, mdLines.indexOf(needle));
  });
});

test("default imports are prepended and mapped to the block start", () => {
  const markdown = ["```js", "const x = 1;", "```"].join("\n");
  const [script] = extractScripts(render(markdown));

  const generated = scriptLines(script);
  assert.match(generated[0], /import \* as core from/);

  const decoded = decodeMappings(parseMap(script).mappings);
  const blockStart = markdown.split("\n").indexOf("const x = 1;");
  assert.equal(decoded[0][0].sourceLine, blockStart);
});