import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import showdown from '../vendor/showdown.js';
import {as, is, mapObject} from "./core.js";

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

/**
 *  Build an HTML document from a literate litmd string. Note that the templates are read from disk
 *  on every call, and they go through string interpolation prior to concatenation and processing.
 *
 * @param maybeMarkdownString
 * @param fileName  the full path to the file, used to generate a default title if the markdownString doesn't have one.
 * @param templateData - includes documentRoot for convention-based template resolution
 * @returns {string}
 */
export default function buildHtmlFromLiterateMarkdown(maybeMarkdownString, fileName='', templateData){
  if (is.str(maybeMarkdownString) || !fileName.endsWith('.md')){
    return maybeMarkdownString;
  }

  // generate a title based on filename if not supplied
  let title = templateData.title;
  title = title ? title : generateTitle(fileName);

  const templates = readTemplates({title, ...templateData}, templateData.documentRoot);

  let header ='';
  let body = '';

  const markdownString = maybeMarkdownString.toString().trim();
  const hasExplicitHTMLHeader = markdownString.startsWith(hasExplicitHead);

  if (hasExplicitHTMLHeader){
    // strip the comments around <!--<!DOCTYPE html> and </head>-->
    // see https://regex101.com/r/QyIlcj/2
    const regex = /<!--<!DOCTYPE html>\W*<head\b[^>]*>(.*)<\/head>-->(.*)/s;
    const group = regex.exec(markdownString);
    header = `<html lang="en"> <head>${group[1].trim()}`;
    body = group[2].trim();
  } else {
    header = templates.headerTemplate;
    body = markdownString;
  }
  const litmd = makeMarkdownConverter({defaultImport: templates.markdownDefaultImports});
  return header + litmd.makeHtml(body) + templates.footerTemplate;
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

const createCodePassThroughExtension = (type, dontExecuteCheck) => {
  return {
    type: 'output',
    filter: (htmlDocument, converter, options) => {
      const regex = new RegExp(`<pre><code class="${type}.*>([\\s\\S]+?)<\\/code><\\/pre>`, 'gm');
      return htmlDocument.replace(regex, (match, code) => {
        const displayString = `<details open><summary>${type}</summary><pre><code class="${type} language-${type}">${code}</code></pre></details>`;

        let executeString = '\n';
        code = code.trim();
        code = unescapeHtml(code);
        const doNotExecute = code.startsWith(dontExecuteCheck);
        if (!doNotExecute){
          executeString += (type === 'html') ? `${code}` : '';
          executeString += (type === 'css') ? `<style>${code}</style>` : '';
          executeString += (type === 'js') ? `<script type="module">${options.defaultImport}${hoistExports(code)}</script>` : '';
          executeString += (type === 'md') ? vanillaConverter.makeHtml(code) : '';
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
