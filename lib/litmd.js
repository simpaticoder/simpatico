import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import showdown from '../vendor/showdown.js';
import {as, mapObject} from "./core.js";

let DEBUG = false;

// Signal to the litmd converter that we don't want to execute the code.
// by starting the code block with one of these strings.
const dontExecuteScript = '///';
const dontExecuteHtml = '<!---';
const dontExecuteCss = '/***';
const dontExecuteMd = '###';
const hasExplicitHead = '<!--<!DOCTYPE html>'

// Read all template info
function readTemplates(data){
  const markdownDefaultImports= readFile('./litmd-imports.js');
  const headerTemplate = readFile('./litmd-header.html');
  const footerTemplate = readFile('./litmd-footer.html');
  const templates = {markdownDefaultImports, headerTemplate, footerTemplate};
  return mapObject(templates, ([k,v])=> ([k, renderTemplate(v, data)]));
}


/**
 *  Build an HTML document from a literate litmd string.
 *
 * @param maybeMarkdownString
 * @param fileName  the full path to the file, used to generate a default title if the markdownString doesn't have one.
 * @param templateData
 * @param templates TODO allow template override from config
 * @returns {string}
 */
function buildHtmlFromLiterateMarkdown(maybeMarkdownString, fileName='', templateData){
  if (typeof maybeMarkdownString === 'string' || !fileName.endsWith('.md')){
    return maybeMarkdownString;
  }
  templateData.title = templateData.title ? templateData.title : generateTitle(fileName);
  const templates = readTemplates(templateData);

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
  // Extract the bare filename (without path or extension)
  const bareFileName = filePath.replace(/^.*[\\/]/, '').split('.')[0];

  // If the filename is "index", use the parent directory name
  if (bareFileName.toLowerCase() === 'index') {
    const parentDirectory = filePath.replace(/[\\/][^\\/]*$/, '').replace(/^.*[\\/]/, '');
    return parentDirectory || 'Home'; // Fallback to "Home" if no parent directory exists
  }

  return bareFileName;
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
          executeString += (type === 'js') ? `<script type="module">${options.defaultImport}${code}</script>` : '';
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

export {buildHtmlFromLiterateMarkdown};
