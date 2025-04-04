import showdown from '../vendor/showdown.js';

// TODO: users are bound to want to modify the header; make it easy
// TODO: find and use a better markdown library to showdownjs
let DEBUG = false;

// Signal to the litmd converter that we don't want to execute the code.
// by starting the code block with one of these strings.
const dontExecuteScript = '///';
const dontExecuteHtml = '<!---';
const dontExecuteCss = '/***';
const dontExecuteMd = '###';

const markdownDefaultImports= `
  import * as c from "/lib/core.js";
  const etc = []; // stupid, yes. but funny, [...etc]
  const {assert, assertEquals, assertThrows, is, as, log, debug} = c;
`;

function generateTitle(filePath) {
  // Extract the bare filename (without path or extension)
  const bareFileName = filePath.replace(/^.*[\\/]/, '').split('.')[0];

  // If the filename is "index", use the parent directory name
  if (bareFileName.toLowerCase() === 'index') {
    const parentDirectory = filePath.replace(/[\\/][^\\/]*$/, '').replace(/^.*[\\/]/, '');
    return parentDirectory || 'Home'; // Fallback to "Home" if no parent directory exists
  }

  // Otherwise, return the bare filename
  return bareFileName;
}

/**
 * Build a default header for litmd files that don't have one.
 * The title is determined by the filename. If the filename
 * is "index" use the parent directory, else use the filename itself.
 *
 * @param fileName - the absolute file path and name
 * @param baseUrl - the base url of the server, e.g. https://simpatico.io
 * @returns {string} - the inferred title of the file
 */
const defaultHtmlHeader = (fileName, baseUrl) => {
  const title = generateTitle(fileName);
  return `<!DOCTYPE html>
<html lang="en" color-mode="user">
<head >
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="alternate" type="application/rss+xml" href="${baseUrl}/rss.xml" title="Simpatico Blog">
  <link id="favicon" rel="icon" type="image/svg+xml" href="data:image/svg+xml,
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'>
      <rect width='1' height='1' fill='DodgerBlue' />
  </svg>"/>
  <link rel="alternate" type="application/rss+xml" href="rss.xml" title="Simpatico Blog">
  <script src="/lib/testable.js" type="module"></script>
  <script src="/lib/litmd-header.js" type="module"></script>

  <title>${title}</title>

  <meta name="keywords" content="JavaScript, ES6, functional, simpatico, minimalist">
  <meta name="author" content="jbr">
  <link rel="stylesheet" type="text/css" href="/vendor/github-markdown.css">
  <link rel="stylesheet" href="/vendor/highlight.github-dark.css">
  <style>
    body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }
    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
    </style>
</head>
<body>
<header>
  <nav>
    <a href="${baseUrl}"><img alt="logo" src="/img/wizard.svg" height="70"></a>
    <a href="${baseUrl}"><span style="font-family: 'Arial', sans-serif; font-size: 30px; color: #eee; margin-left: 10px;">Simpatico</span></a>
    <ul>
      <li><a href="/acceptance">Examples</a></li>
      <li><a href="/services">Services</a></li>
      <li><a href="https://www.github.com/javajosh/simpatico/" target="_blank">GitHub ↗</a></li>
      <li><a href="https://www.patreon.com/simpaticoder" target="_blank">Patreon ↗</a></li>
    </ul>
  </nav>
  </header>
<main>
    `;
}

const defaultHtmlFooter = (author='SimpatiCorp', year=new Date().getFullYear()) => {
  return `<p>Copyright ${author} ${year}</p>`;
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


// Instantiate a singleton litmd converter that lives as long as the module/app.
const litmd = makeMarkdownConverter();

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
        defaultImport: markdownDefaultImports,
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
 *  Build an HTML document from a literate litmd string.
 *  A literate litmd string can contain header fields, wrapped in html comments so they render on github.
 *  This whole thing is brittle and needs to be redone properly.
 *
 * @param maybeMarkdownString
 * @param fileName  the full path to the file, used to generate a default title if the markdownString doesn't have one.
 * @returns {string}
 */
function buildHtmlFromLiterateMarkdown(maybeMarkdownString, fileName='', baseUrl){

  if (typeof maybeMarkdownString === 'string' || !fileName.endsWith('.md')){
    return maybeMarkdownString;
  }

  let header ='';
  let body = '';

  const markdownString = maybeMarkdownString.toString().trim();
  const hasExplicitHTMLHeader = markdownString.startsWith("<!--<!DOCTYPE html>");

  if (hasExplicitHTMLHeader){
    // strip the comments around <!--<!DOCTYPE html> and </head>-->
    // see https://regex101.com/r/QyIlcj/2
    const regex = /<!--<!DOCTYPE html>\W*<head\b[^>]*>(.*)<\/head>-->(.*)/s;
    const group = regex.exec(markdownString);
    header = `<!DOCTYPE html><head>${group[1].trim()}</head>`;
    body = group[2].trim();
  } else {
    header = defaultHtmlHeader(fileName);
    body = markdownString;
  }
  return header + litmd.makeHtml(body) + defaultHtmlFooter();
}



function unescapeHtml(string){
  return string.replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}


export {buildHtmlFromLiterateMarkdown};
