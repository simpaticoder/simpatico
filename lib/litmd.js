import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import showdown from '../vendor/showdown.js';
import {as, is, mapObject} from "./core.js";
import {
  scanCodeFences,
  markdownSourceUrl,
  matchFence,
  appendSourceMap,
} from './litmd-sourcemap.js';

let DEBUG = false;

// Signal to the litmd converter that we don't want to execute the code.
// by starting the code block with one of these strings.
const dontExecuteScript = '///';
const dontExecuteHtml = '<!---';
const dontExecuteCss = '/***';
const dontExecuteMd = '###';
const hasExplicitHead = '<!--<!DOCTYPE html>'

// Read all template info
// If documentRoot is provided, check for templates in {documentRoot}/lib/ first
function readTemplates(data, documentRoot = null){
  const markdownDefaultImports = readTemplateFile('litmd-imports.js', documentRoot);
  const headerTemplate = readTemplateFile('litmd-header.html', documentRoot);
  const footerTemplate = readTemplateFile('litmd-footer.html', documentRoot);
  const templates = {markdownDefaultImports, headerTemplate, footerTemplate};
  return mapObject(templates, ([k,v])=> ([k, renderTemplate(v, data)]));
}

/**
 * Read a template file, checking documentRoot/lib/ first, then falling back to simpatico's lib/
 * @param {string} templateName - Name of the template file (e.g., 'litmd-header.html')
 * @param {string|null} documentRoot - Document root to check first, or null to use default
 * @returns {string} Template contents
 */
function readTemplateFile(templateName, documentRoot) {
  // Check documentRoot/lib/ first if provided
  if (documentRoot) {
    const customPath = resolve(documentRoot, 'lib', templateName);
    if (existsSync(customPath)) {
      return readFileSync(customPath, 'utf-8');
    }
  }
  // Fall back to simpatico's lib/ directory
  return readFile('./' + templateName);
}

// A leading `---` fenced block of `key: value` lines is front matter.
const FRONT_MATTER_PATTERN = /^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split YAML-style front matter from a markdown document.
 *
 * Only a leading `---` fenced block that actually contains `key: value`
 * lines counts; anything else (for example a document that simply starts
 * with a horizontal rule) is left untouched.
 *
 * @param {string} markdown
 * @returns {{attributes: Object<string,string>, body: string}}
 */
export function parseFrontMatter(markdown) {
  const match = FRONT_MATTER_PATTERN.exec(markdown);
  if (!match) return { attributes: {}, body: markdown };

  const attributes = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) continue;
    attributes[key] = unquote(line.slice(separator + 1).trim());
  }

  // If nothing parsed as a key/value pair this was not front matter.
  if (Object.keys(attributes).length === 0) return { attributes: {}, body: markdown };

  return { attributes, body: markdown.slice(match[0].length).trimStart() };
}

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHeadingText(value) {
  return String(value)
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Drop a leading level-1 body heading that merely repeats the front matter
 * title, since the title is now rendered by the front matter block.
 */
function stripDuplicateTitle(markdown, title) {
  if (!title) return markdown;
  const match = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(markdown);
  if (match && normalizeHeadingText(match[1]) === normalizeHeadingText(title)) {
    return markdown.slice(match[0].length).trimStart();
  }
  return markdown;
}

/**
 * Build a clickable breadcrumb for a document from its path relative to the
 * document root, e.g. `blog/saddle-earth.md` -> `blog > saddle earth`.
 * Each segment links to the corresponding directory or file URL.
 */
function frontMatterBreadcrumb(fileName, documentRoot) {
  const toUrl = (value) => String(value).split(/[\\/]/).join('/');
  const file = toUrl(fileName);

  let relative = file;
  if (documentRoot) {
    const root = toUrl(documentRoot).replace(/\/+$/, '');
    if (root && (file === root || file.startsWith(root + '/'))) {
      relative = file.slice(root.length).replace(/^\/+/, '');
    }
  }
  relative = relative.replace(/^\.\//, '');

  const isIndex = /(^|\/)(index|readme)\.(md|html)$/i.test(relative);
  const display = isIndex
    ? relative.replace(/(^|\/)(index|readme)\.(md|html)$/i, '')
    : relative.replace(/\.(md|html)$/i, '');
  const parts = display.split('/').filter(Boolean);

  return parts.map((part, index) => {
    const isLast = index === parts.length - 1;
    let href;
    if (isLast) {
      href = '/' + (isIndex ? parts.join('/') + '/' : relative);
    } else {
      href = '/' + parts.slice(0, index + 1).join('/') + '/';
    }
    return { label: part.replace(/[-_]+/g, ' '), href };
  });
}

/**
 * Render front matter as a small metadata block above the document body.
 * The title becomes the document's heading; the path breadcrumb, date and
 * description (plus any extra keys) become a muted meta line. Deliberately
 * not part of the body markdown, and excluded from the generated table of
 * contents.
 */
function renderFrontMatter(attributes, breadcrumb = []) {
  const keys = Object.keys(attributes);
  if (keys.length === 0) return '';

  const { title, date, description } = attributes;
  const metaItems = [];

  if (breadcrumb.length) {
    const crumbs = breadcrumb
      .map((segment) => `<a href="${escapeHtml(segment.href)}">${escapeHtml(segment.label)}</a>`)
      .join(' <span class="frontmatter-sep">&#8250;</span> ');
    metaItems.push(`<span class="frontmatter-path">${crumbs}</span>`);
  }
  if (date) metaItems.push(`<span class="frontmatter-date">${escapeHtml(date)}</span>`);
  for (const key of keys) {
    if (['title', 'date', 'description'].includes(key)) continue;
    metaItems.push(
      `<span class="frontmatter-field">${escapeHtml(key)}: ${escapeHtml(attributes[key])}</span>`,
    );
  }

  let html = '<div class="frontmatter">\n';
  if (title) html += `  <h1 class="frontmatter-title">${escapeHtml(title)}</h1>\n`;
  if (metaItems.length) {
    html += `  <p class="frontmatter-meta">${metaItems.join(' <span class="frontmatter-sep">&#183;</span> ')}</p>\n`;
  }
  if (description) {
    html += `  <p class="frontmatter-description">${escapeHtml(description)}</p>\n`;
  }
  html += '</div>';
  return html;
}

/**
 *  Build an HTML document from a literate litmd string. Note that the templates are read from disk
 *  on every call, and they go through string interpolation prior to concatenation and processing.
 *
 * @param maybeMarkdownString
 * @param fileName  the full path to the file, used to generate a default title if the markdownString doesn't have one.
 * @param templateData - includes documentRoot for convention-based template resolution
 * @returns {string}
 */
export default function buildHtmlFromLiterateMarkdown(maybeMarkdownString, fileName='', templateData = {}){
  if (is.str(maybeMarkdownString) || !fileName.endsWith('.md')){
    return maybeMarkdownString;
  }

  const markdownString = maybeMarkdownString.toString().trim();
  const hasExplicitHTMLHeader = markdownString.startsWith(hasExplicitHead);

  // YAML-style front matter is metadata, not content: pull it out first.
  const { attributes, body: markdownBody } = hasExplicitHTMLHeader
    ? { attributes: {}, body: markdownString }
    : parseFrontMatter(markdownString);

  // Precedence: caller override, then front matter, then filename.
  const title = templateData.title || attributes.title || generateTitle(fileName);

  const templates = readTemplates({title, ...templateData}, templateData.documentRoot);

  let header ='';
  let body = '';

  if (hasExplicitHTMLHeader){
    // strip the comments around <!--<!DOCTYPE html> and </head>-->
    // see https://regex101.com/r/QyIlcj/2
    const regex = /<!--<!DOCTYPE html>\W*<head\b[^>]*>(.*)<\/head>-->(.*)/s;
    const group = regex.exec(markdownString);
    header = `<html lang="en"> <head>${group[1].trim()}`;
    body = group[2].trim();
  } else {
    header = templates.headerTemplate;
    // A body heading that repeats the front matter title is redundant.
    body = stripDuplicateTitle(markdownBody, attributes.title);
  }
  const litmd = makeMarkdownConverter({
    defaultImport: templates.markdownDefaultImports,
    litmdFences: scanCodeFences(body, DONT_EXECUTE),
    litmdSourceContent: body,
    litmdSourceUrl: markdownSourceUrl(fileName, templateData.documentRoot),
  });
  const frontMatter = hasExplicitHTMLHeader
    ? ''
    : renderFrontMatter(attributes, frontMatterBreadcrumb(fileName, templateData.documentRoot));
  return header + frontMatter + litmd.makeHtml(body) + templates.footerTemplate;
}

/**
 * Read a file from the execution location (cwd()) or from the dependency.
 *
 * @param filePath relative path to read
 * @param local true if read local to the invocation; false if read local to the server script itself.
 * @returns {*}
 */
function readFile(filePath, local=false) {
  // the server script is one level up
  const __dirname = local ? process.cwd() : dirname(fileURLToPath(import.meta.url));
  const absolutePath = resolve(__dirname, filePath);
  return readFileSync(absolutePath, 'utf-8');
}

const renderTemplate = (template, data) => {
  as.str(template);
  as.obj(data);
  let result = template;
  for (const key in data) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
  }
  return result;
};

function generateTitle(filePath) {
  let result = "";
  // Extract the bare filename (without path or extension)
  const bareFileName = filePath.replace(/^.*[\\/]/, '').split('.')[0];

  // If the filename is "index", use the parent directory name
  if (bareFileName.toLowerCase() === 'index' || bareFileName.toLowerCase() === 'README') {
    const parentDirectory = filePath.replace(/[\\/][^\\/]*$/, '').replace(/^.*[\\/]/, '');
    result = parentDirectory || 'Home'; // Fallback to "Home" if no parent directory exists
  }

  // TODO - replace this hardcoded prefix
  return 'Simpatico - ' + result;
}


const vanillaConverter = new showdown.Converter({
  backslashEscapesHTMLTags: true,
  parseImgDimensions: true,
  strikethrough: true,
  simpleLineBreaks: false,
  tables: true,
  flavor: 'github',
});

// Which leading token marks a block as "display only, do not execute".
const DONT_EXECUTE = {
  js: dontExecuteScript,
  html: dontExecuteHtml,
  css: dontExecuteCss,
  md: dontExecuteMd,
};

const createCodePassThroughExtension = (type, dontExecuteCheck) => {
  // Reset per extension (and therefore per converter/build). Showdown emits
  // code blocks in source order, so the Nth emitted block lines up with the
  // Nth fenced block recorded by scanCodeFences().
  let blockIndex = 0;
  return {
    type: 'output',
    filter: (htmlDocument, converter, options) => {
      // Match the exact language token (e.g. `js language-js`), not a
      // language whose name merely starts with it (e.g. `json`).
      const regex = new RegExp(`<pre><code class="${type}\\b[^"]*">([\\s\\S]+?)<\\/code><\\/pre>`, 'gm');
      return htmlDocument.replace(regex, (match, code) => {
        const displayString = `<details open><summary>${type}</summary><pre><code class="${type} language-${type}">${code}</code></pre></details>`;

        let executeString = '\n';
        code = code.trim();
        code = unescapeHtml(code);
        const doNotExecute = code.startsWith(dontExecuteCheck);
        if (!doNotExecute){
          if (type === 'html') {
            executeString += code;
          } else if (type === 'css') {
            executeString += `<style>${code}</style>`;
          } else if (type === 'js') {
            const { fence, nextIndex } = matchFence(
              options.litmdFences?.js ?? [],
              blockIndex,
              code,
            );
            blockIndex = nextIndex;

            const body = `${options.defaultImport}${hoistExports(code)}`;
            const script = appendSourceMap(body, {
              defaultImport: options.defaultImport,
              code,
              fence,
              sourceUrl: options.litmdSourceUrl,
              sourceContent: options.litmdSourceContent,
            });
            executeString += `<script type="module">${script}</script>`;
          } else if (type === 'md') {
            executeString += vanillaConverter.makeHtml(code);
          }
        }

        return executeString + displayString;
      });
    }
  };
};


function makeMarkdownConverter (options={}) {
  showdown.extension('scriptPassThroughExtension', createCodePassThroughExtension('js', dontExecuteScript));
  showdown.extension('htmlPassThroughExtension', createCodePassThroughExtension('html', dontExecuteHtml));
  showdown.extension('cssPassThroughExtension', createCodePassThroughExtension('css', dontExecuteCss));
  showdown.extension('mdPassThroughExtension', createCodePassThroughExtension('md', dontExecuteMd));

  const result = new showdown.Converter(
    Object.assign({
        backslashEscapesHTMLTags: true,
        parseImgDimensions: true,
        strikethrough: true,
        simpleLineBreaks: false,
        tables: true,
        flavor: 'github',
        tasklists: true,
        ghMentions: true,
        ghMentionsLink: 'https://twitter.com/{u}/profile',
        extensions: [
          'scriptPassThroughExtension',
          'htmlPassThroughExtension',
          'cssPassThroughExtension',
          'mdPassThroughExtension',
        ],
      },
      options)
  );
  if (DEBUG) console.log('litmd.js: makeMarkdownConverter', result);
  return result;
}

/**
 * Scan a JS code block for `export` declarations and append
 * `window.X = X` assignments so the exported names are available
 * to subsequent code blocks on the same page.
 *
 * Handles:
 *   export class Foo { ... }
 *   export function foo() { ... }
 *   export const/let/var foo = ...
 *   export { foo, bar }
 *   export { foo as bar }   → window.bar = bar
 *
 * Does NOT handle `export default` (no stable name to bind).
 * The original export keyword is stripped so the module doesn't
 * try to export from a non-module context (the script already is
 * type="module", but stripping keeps intent clear and avoids any
 * re-export confusion).
 */
function hoistExports(code) {
  const assignments = [];

  // export class Foo / export function foo / export const|let|var foo
  code = code.replace(
    /^export\s+((?:async\s+)?(?:class|function\*?|const|let|var)\s+(\w+))/gm,
    (_, rest, name) => {
      assignments.push(`window.${name} = ${name};`);
      return rest;           // strip the 'export' keyword
    }
  );

  // export { foo, bar as baz, ... }
  code = code.replace(
    /^export\s*\{([^}]+)\}\s*;?/gm,
    (_, list) => {
      list.split(',').forEach(item => {
        const parts = item.trim().split(/\s+as\s+/);
        const exportedName = (parts[1] || parts[0]).trim();
        const localName   = parts[0].trim();
        assignments.push(`window.${exportedName} = ${localName};`);
      });
      return '';             // remove the export {} statement entirely
    }
  );

  if (assignments.length === 0) return code;
  return code + '\n' + assignments.join('\n');
}

function unescapeHtml(string){
  return string.replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
