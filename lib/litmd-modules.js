/**
 * Compile named resources out of literate markdown.
 *
 * A litmd file can be more than a document: it can be the *source* of the
 * resources it documents. A resource is a fenced code block whose first
 * non-empty line is a directive:
 *
 *   ```js
 *   /// @module field
 *   export function createField(svg) { ... }
 *   ```
 *
 *   ```css
 *   /*** @module field-styles
 *   #field { border: 1px solid; }
 *   ```
 *
 *   ```html
 *   <!--- @module field-help
 *   <p>Drop an object to begin.</p>
 *   ```
 *
 *   ```svg
 *   <!-- @module badge -->
 *   <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>
 *   ```
 *
 * The fence language decides the resource's content type, and the directive
 * prefix is (for js/css/html) the existing litmd "do not execute inline"
 * signal, so the block still renders in the page but does not run there. The
 * reflector then serves it at a query URL with the matching content type:
 *
 *   import { createField } from './viz.md?module=field';
 *   <link rel="stylesheet" href="./viz.md?module=field-styles">
 *   <img src="./viz.md?module=badge" alt="">
 *
 * This keeps simpatico buildless: the markdown is the source of truth, and
 * resources are compiled on demand and cached by the reflector alongside the
 * page.
 *
 * @module litmd-modules
 */

import { appendSourceMap } from './litmd-sourcemap.js';

const FENCE_OPEN = /^\s*```+\s*([a-zA-Z0-9_-]+)/;
const FENCE_CLOSE = /^\s*```+\s*$/;

/** Languages that can define a resource, and how their directive looks. */
const RESOURCE_TYPES = {
  js: {
    directive: /^[ \t]*\/{2,3}[ \t]*@module[ \t]+([\w.-]+)[ \t]*$/,
    contentType: 'application/javascript',
    comment: (text) => `// ${text}\n`,
  },
  css: {
    directive: /^[ \t]*\/\*\*\*[ \t]*@module[ \t]+([\w.-]+)[ \t]*$/,
    contentType: 'text/css',
    comment: (text) => `/* ${text} */\n`,
  },
  html: {
    directive: /^[ \t]*<!---[ \t]*@module[ \t]+([\w.-]+)[ \t]*$/,
    contentType: 'text/html',
    comment: (text) => `<!-- ${text} -->\n`,
  },
  svg: {
    // An svg fence is never executed by litmd, so a bare directive is safe;
    // an XML comment is also accepted for authors who prefer it.
    directive: /^[ \t]*(?:<!--[ \t]*)?@module[ \t]+([\w.-]+)[ \t]*(?:-->)?[ \t]*$/,
    contentType: 'image/svg+xml',
    comment: (text) => `<!-- ${text} -->\n`,
  },
};

/**
 * Extract every named resource from a markdown string.
 *
 * @param {string} markdown
 * @returns {Map<string, {code: string, type: string, contentType: string,
 *   startLine: number, fenceLine: number}>}
 *   Name -> resource source (directive line removed) and 0-based line numbers
 *   into the markdown (startLine is the first line of the body).
 */
export function extractModules(markdown) {
  const modules = new Map();

  for (const type of Object.keys(RESOURCE_TYPES)) {
    for (const fence of scanFences(markdown, type)) {
      const parsed = parseDirective(fence.lines, RESOURCE_TYPES[type].directive);
      if (!parsed) continue;

      if (modules.has(parsed.name)) {
        throw new Error(
          `Duplicate @module '${parsed.name}' in markdown (also defined as ` +
            `'${modules.get(parsed.name).type}')`,
        );
      }

      modules.set(parsed.name, {
        code: parsed.code,
        type,
        contentType: RESOURCE_TYPES[type].contentType,
        // 0-based line of the first non-blank line after the directive.
        startLine: fence.codeStartLine + parsed.contentLine,
        fenceLine: fence.codeStartLine - 1,
      });
    }
  }

  return modules;
}

/**
 * Compile one named resource.
 *
 * @param {string} markdown
 * @param {string} name
 * @returns {{name: string, type: string, contentType: string, code: string}}
 * @throws {Error} with `.code = 404` when the resource does not exist.
 */
export function compileMarkdownModule(
  markdown,
  name,
  { sourcePath = '', sourceUrl = '', sourceContent = markdown } = {},
) {
  const modules = extractModules(markdown);
  const found = modules.get(name);

  if (!found) {
    const available = [...modules.entries()]
      .map(([n, m]) => `${n} (${m.type})`)
      .join(', ');
    const error = new Error(
      `No @module '${name}' found in markdown` +
        (available ? ` (available: ${available})` : ''),
    );
    error.code = 404;
    error.available = [...modules.keys()];
    throw error;
  }

  const where = sourcePath ? ` from ${sourcePath}` : '';
  const note = `Compiled${where} (litmd ${found.type} @module '${name}'). Edit the .md, not this.`;
  const header = RESOURCE_TYPES[found.type].comment(note);
  const body = `${header}${found.code}`;

  // JS and CSS both consume source maps. Given a virtual markdown URL, map
  // every generated line back to the .md and embed the markdown itself so
  // DevTools can show the prose+code without a second request.
  const supportsSourceMap = found.type === 'js' || found.type === 'css';
  const code = sourceUrl && supportsSourceMap
    ? appendSourceMap(body, {
        defaultImport: header,
        code: found.code,
        fence: {codeStartLine: found.startLine},
        sourceUrl,
        sourceContent,
        css: found.type === 'css',
      }) + '\n'
    : `${body}\n`;

  return {
    name,
    type: found.type,
    contentType: found.contentType,
    code,
  };
}

/**
 * Scan fenced code blocks of a single language, preserving line numbers.
 *
 * Markdown does not nest fences here, which matches how the rest of litmd
 * scans blocks (see litmd-sourcemap.js).
 *
 * @private
 */
function scanFences(markdown, type) {
  const lines = markdown.split('\n');
  const fences = [];

  let i = 0;
  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open || open[1] !== type) {
      i++;
      continue;
    }

    const codeStartLine = i + 1; // 0-based first content line
    let j = codeStartLine;
    while (j < lines.length && !FENCE_CLOSE.test(lines[j])) j++;

    fences.push({ lines: lines.slice(codeStartLine, j), codeStartLine });
    i = j + 1;
  }

  return fences;
}

/**
 * If the first non-empty line of a block is a directive, return the resource
 * name and the body with the directive removed.
 *
 * @private
 */
function parseDirective(lines, pattern) {
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return null;

  const match = pattern.exec(lines[i]);
  if (!match) return null;

  // Skip blank lines after the directive so the recorded line points at real
  // code, which keeps generated-line -> markdown-line mappings exact.
  let content = i + 1;
  while (content < lines.length && lines[content].trim() === '') content++;

  return {
    name: match[1],
    directiveLine: i,
    contentLine: content,
    code: lines.slice(content).join('\n').trim(),
  };
}
