/**
 * Source maps for litmd's executable code blocks.
 *
 * Inline ES modules have no file of their own, so a browser error lands on a
 * line of the generated HTML (plus any prepended default imports). To map
 * stack traces back to the markdown we build a v3 source map per JS block and
 * append it as a `data:` sourceMappingURL. The map points at a virtual source
 * that carries the markdown text (`sourcesContent`), so no extra request is
 * made and DevTools can show the original prose+code.
 */

import { resolve, relative, sep } from 'node:path';

/**
 * Showdown normalizes indentation in some contexts (indented blocks, blocks in
 * lists), so compare block bodies with per-line leading/trailing whitespace
 * removed when matching a parsed block back to its fenced source.
 */
export function normalizeCode(code) {
  return code.replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, '');
}

const canExecute = (type, code, dontExecute) =>
  !code.startsWith(dontExecute?.[type] ?? '\u0000');

/**
 * Find every fenced code block in the markdown and record, per language, the
 * 0-based line on which its (trimmed) content starts. Blocks that begin with a
 * "do not execute" signal are skipped, exactly as the output filter skips them,
 * so the two sequences stay aligned.
 *
 * @param {string} markdown
 * @param {Record<string, string>} dontExecute - language -> leading token
 * @returns {{js: Array, html: Array, css: Array, md: Array}}
 */
export function scanCodeFences(markdown, dontExecute = {}) {
  const result = { js: [], html: [], css: [], md: [] };
  const lines = markdown.split('\n');
  const openFence = /^\s*```+\s*([a-zA-Z0-9_-]+)/;
  const closeFence = /^\s*```+\s*$/;

  let i = 0;
  while (i < lines.length) {
    const open = openFence.exec(lines[i]);
    const type = open?.[1];
    if (!type || !(type in result)) {
      i++;
      continue;
    }

    const contentStart = i + 1; // 0-based line of the first content line
    let j = contentStart;
    while (j < lines.length && !closeFence.test(lines[j])) j++;

    const raw = lines.slice(contentStart, j).join('\n');
    const code = raw.trim();
    if (code && canExecute(type, code, dontExecute)) {
      // How many blank lines did trim() remove from the front?
      const prefix = raw.slice(0, raw.indexOf(code));
      const leadingBlankLines = prefix.split('\n').length - 1;
      result[type].push({
        codeStartLine: contentStart + leadingBlankLines, // 0-based
        code,
      });
    }

    i = j + 1; // skip the closing fence
  }

  return result;
}

/**
 * A path for the virtual markdown source. It deliberately does not collide
 * with the served document URL (which is the generated HTML at, say,
 * /lab/chat.md), otherwise DevTools may display the HTML instead of the map's
 * sourcesContent.
 */
export function markdownSourceUrl(fileName, documentRoot) {
  let relPath = fileName;
  if (documentRoot) {
    const rel = relative(resolve(documentRoot), resolve(fileName));
    if (!rel.startsWith('..')) relPath = rel;
  }
  return '/__litmd__/' + relPath.split(sep).join('/');
}

/**
 * Pick the fenced block corresponding to a parsed code block. Trusts the
 * running index but resyncs by content when the markdown parser has skipped or
 * reshaped a block, so later blocks cannot inherit the wrong source lines.
 *
 * @param {Array} list - scanCodeFences() entries for this language
 * @param {number} index - current position in the list
 * @param {string} code - parsed (already trimmed/unescaped) block source
 * @returns {{fence: object|undefined, nextIndex: number}}
 */
export function matchFence(list, index, code) {
  const target = normalizeCode(code);
  let fence = list[index];

  if (fence && normalizeCode(fence.code) !== target) {
    const found = list.findIndex(
      (f, i) => i >= index && normalizeCode(f.code) === target,
    );
    if (found !== -1) index = found;
    fence = list[index];
  }

  if (fence && normalizeCode(fence.code) === target) {
    return { fence, nextIndex: index + 1 };
  }

  return { fence: undefined, nextIndex: index };
}

/**
 * Append a v3 `data:` source map to an assembled inline module.
 *
 * @param {string} script - the module text (default imports + block code)
 * @param {object} meta
 * @param {string} meta.defaultImport - prepended runtime boilerplate
 * @param {string} meta.code - trimmed block source (before hoistExports)
 * @param {{codeStartLine: number}|undefined} meta.fence - scanCodeFences entry
 * @param {string} meta.sourceUrl - virtual markdown URL
 * @param {string} meta.sourceContent - markdown text for sourcesContent
 * @param {boolean} [meta.css=false] - use CSS comment syntax for the map
 * @returns {string}
 */
export function appendSourceMap(script, { defaultImport, code, fence, sourceUrl, sourceContent, css = false }) {
  if (!fence || !sourceUrl || !sourceContent) {
    return script;
  }

  const map = makeSourceMap({
    script,
    defaultImport,
    code,
    codeStartLine: fence.codeStartLine,
    sourceUrl,
    sourceContent,
  });

  const encoded = Buffer.from(JSON.stringify(map), 'utf8').toString('base64');
  const url = `data:application/json;charset=utf-8;base64,${encoded}`;
  const comment = css
    ? `/*# sourceMappingURL=${url} */`
    : `//# sourceMappingURL=${url}`;

  return `${script}\n${comment}`;
}

/**
 * Map every generated line to a 0-based line in the markdown source.
 *
 * Layout of `script`: [defaultImport lines][block code lines][hoistExports lines]
 * The default imports are runtime boilerplate, so they map to the start of the
 * block. Trailing `window.X = X` lines added by hoistExports map to the last
 * source line. Because hoistExports only strips `export ` in place and appends
 * whole lines, the code lines map 1:1.
 *
 * @returns {object} source map (version 3)
 */
function makeSourceMap({ script, defaultImport, code, codeStartLine, sourceUrl, sourceContent }) {
  const defaultLines = countNewlines(defaultImport);
  const codeLines = code.split('\n').length;
  const totalLines = script.split('\n').length;

  const generatedToSource = [];
  for (let g = 0; g < totalLines; g++) {
    if (g < defaultLines) {
      generatedToSource.push(codeStartLine);
    } else {
      const rel = g - defaultLines;
      generatedToSource.push(
        rel < codeLines ? codeStartLine + rel : codeStartLine + codeLines - 1,
      );
    }
  }

  return {
    version: 3,
    file: sourceUrl,
    sources: [sourceUrl],
    sourcesContent: [sourceContent],
    names: [],
    mappings: encodeMappings(generatedToSource),
  };
}

function countNewlines(str) {
  return (str.match(/\n/g) || []).length;
}

const BASE64_DIGITS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 VLQ encoding as used by the source map spec. */
function vlqEncode(value) {
  let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let encoded = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += BASE64_DIGITS[digit];
  } while (vlq > 0);
  return encoded;
}

/** One segment per generated line: [column 0, source 0, source line, column 0]. */
function encodeMappings(generatedToSource) {
  let mappings = '';
  let prevSourceLine = 0;

  for (let g = 0; g < generatedToSource.length; g++) {
    if (g > 0) mappings += ';';

    const sourceLine = generatedToSource[g];
    if (sourceLine == null) continue;

    mappings +=
      vlqEncode(0) +
      vlqEncode(0) +
      vlqEncode(sourceLine - prevSourceLine) +
      vlqEncode(0);

    prevSourceLine = sourceLine;
  }

  return mappings;
}