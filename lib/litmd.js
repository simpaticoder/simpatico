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
 * Extract code block positions from markdown source
 * Returns array of {type, startLine, endLine, content}
 * startLine is 1-based and points to the first line of actual code (after the opening ```)
 */
function findCodeBlocks(markdownString) {
  const lines = markdownString.split('\n');
  const blocks = [];
  let inBlock = false;
  let blockType = null;
  let blockStart = 0;
  let blockContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codeBlockMatch = line.match(/^```(\w+)?/);

    if (codeBlockMatch && !inBlock) {
      // Start of code block
      inBlock = true;
      blockType = codeBlockMatch[1] || 'text';
      blockStart = i; // Line with the ```
      blockContent = [];
    } else if (line.match(/^```/) && inBlock) {
      // End of code block
      blocks.push({
        type: blockType,
        startLine: blockStart + 2, // Convert to 1-based and skip the ``` line
        endLine: i, // Line before the closing ```
        content: blockContent.join('\n')
      });
      inBlock = false;
      blockType = null;
      blockContent = [];
    } else if (inBlock) {
      blockContent.push(line);
    }
  }

  return blocks;
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

  // Extract code blocks with their line numbers before conversion
  const codeBlocks = findCodeBlocks(body);

  const litmd = makeMarkdownConverter({
    defaultImport: templates.markdownDefaultImports,
    codeBlocks: codeBlocks,
    sourceFile: fileName
  });
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
      const codeBlocks = options.codeBlocks || [];
      const sourceFile = options.sourceFile || '';
      let blockIndex = 0;

      const regex = new RegExp(`<pre><code class="${type}.*>([\\s\\S]+?)<\\/code><\\/pre>`, 'gm');
      return htmlDocument.replace(regex, (match, code) => {
        const displayString = `<details open><summary>${type}</summary><pre><code class="${type} language-${type}">${code}</code></pre></details>`;

        let executeString = '\n';
        code = code.trim();
        code = unescapeHtml(code);
        const doNotExecute = code.startsWith(dontExecuteCheck);

        // Find matching code block by type and content
        let sourceLineInfo = '';
        const matchingBlock = codeBlocks.find((block, idx) => {
          if (block.type === type && idx >= blockIndex) {
            // Simple heuristic: check if unescaped code matches block content
            const normalizedCode = code.replace(/\s+/g, ' ').substring(0, 100);
            const normalizedBlock = block.content.replace(/\s+/g, ' ').substring(0, 100);
            if (normalizedCode === normalizedBlock) {
              blockIndex = idx + 1;
              return true;
            }
          }
          return false;
        });

        if (matchingBlock) {
          const importLines = (options.defaultImport || '').split('\n').length - 1;
          sourceLineInfo = ` data-source-file="${sourceFile}" data-source-line="${matchingBlock.startLine}" data-import-offset="${importLines}"`;
        }

        if (!doNotExecute){
          executeString += (type === 'html') ? `${code}` : '';
          executeString += (type === 'css') ? `<style${sourceLineInfo}>${code}</style>` : '';

          // For JavaScript, wrap the code to set the current script context for error tracking
          if (type === 'js' && matchingBlock) {
            const importLines = (options.defaultImport || '').split('\n').length - 1;
            const scriptContext = `{sourceFile: "${sourceFile}", sourceLine: ${matchingBlock.startLine}, importOffset: ${importLines}}`;
            executeString += `<script type="module"${sourceLineInfo}>
window.__litmdCurrentScript = ${scriptContext};
try {
${options.defaultImport}${code}
} finally {
  window.__litmdCurrentScript = null;
}
</script>`;
          } else if (type === 'js') {
            executeString += `<script type="module"${sourceLineInfo}>${options.defaultImport}${code}</script>`;
          }

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

function unescapeHtml(string){
  return string.replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
