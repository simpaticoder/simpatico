import hljs from '../vendor/highlight.min.js';
import javascript from '../vendor/highlight.javascript.min.js';

hljs.registerLanguage('javascript', javascript);

// Source map support for litmd - rewrites stack traces to show original line numbers
(function() {
  // Store current script context for error tracking
  window.__litmdCurrentScript = null;

  // Rewrite a stack trace line to use source file and line numbers
  function rewriteStackTraceLine(line, scriptInfo) {
    if (!scriptInfo) return line;

    // Match patterns like "at functionName (file.html:324:4)" or "at file.html:324:4"
    const match = line.match(/^(\s*at\s+(?:.*?\s+\()?)(.*?):(\d+):(\d+)\)?$/);
    if (!match) return line;

    const [, prefix, file, lineNum, colNum] = match;
    const generatedLine = parseInt(lineNum, 10);

    // Check if this is an HTML file (our generated output)
    if (!file.endsWith('.html') && !file.endsWith('.md')) return line;

    // Calculate the original line number
    // The generated line includes the import offset, so we subtract it
    const originalLine = scriptInfo.sourceLine + (generatedLine - scriptInfo.importOffset - 1);
    const fileName = scriptInfo.sourceFile.split('/').pop();
    return `${prefix}${fileName}:${originalLine}:${colNum}`;
  }

  // Rewrite an entire stack trace
  function rewriteStackTrace(stack, scriptInfo) {
    if (!stack || !scriptInfo) return stack;
    return stack.split('\n').map(line => rewriteStackTraceLine(line, scriptInfo)).join('\n');
  }

  // Override Error constructor to capture current script context
  const OriginalError = window.Error;
  window.Error = function(message) {
    const err = new OriginalError(message);
    if (window.__litmdCurrentScript) {
      err.__litmdScriptInfo = window.__litmdCurrentScript;
    }
    return err;
  };
  window.Error.prototype = OriginalError.prototype;

  // Override console.error to rewrite stack traces
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const rewrittenArgs = args.map(arg => {
      if (arg instanceof OriginalError && arg.stack && arg.__litmdScriptInfo) {
        const rewrittenStack = rewriteStackTrace(arg.stack, arg.__litmdScriptInfo);
        // Create a new error with rewritten stack
        const rewrittenError = Object.create(arg);
        rewrittenError.stack = rewrittenStack;
        return rewrittenError;
      }
      return arg;
    });
    originalConsoleError.apply(console, rewrittenArgs);
  };

  // Global error handler
  window.addEventListener('error', (event) => {
    if (event.error && event.error.stack && event.error.__litmdScriptInfo) {
      const rewrittenStack = rewriteStackTrace(event.error.stack, event.error.__litmdScriptInfo);
      console.log('%c📍 Source-mapped error location:', 'color: #4CAF50; font-weight: bold');
      console.log(rewrittenStack);
    }
  });
})();
document.addEventListener('DOMContentLoaded', () => {
  // add syntax highlighting
  document.querySelectorAll('pre code').forEach((el) => {
    hljs.highlightElement(el);
  });

  // Support clickable definitions on mobile, which does cannot hover
  document.querySelectorAll('span[title]').forEach(span => {
    span.addEventListener('click', function() {
      const dialog = document.createElement('div');
      dialog.textContent = span.getAttribute('title');
      dialog.classList.add('dialog');
      document.body.appendChild(dialog);
      dialog.addEventListener('click', function(e) {
        dialog.remove();
      });
    });
  });

  // Add a table of contents - but only if there are more than 3 headings
  const headings = document.querySelectorAll('h1, h2, h3');
  if (headings.length > 3) {
    let toc = '<h2>Table of Contents</h2><ul>';
    let level, title, id, indent;
    headings.forEach(function (heading) {
      level = heading.tagName[1];
      title = heading.textContent;
      id = heading.id;
      indent = (level - 1) * 20; // Adjust the foo size as needed
      if (id) toc += `<li style="margin-left: ${indent}px;"><a href="#${id}">${title}</a></li>`;
    });
    toc += '</ul>';

    const tocDiv = document.createElement('div');
    tocDiv.id = 'toc';
    tocDiv.innerHTML = toc;

    // Insert the tocDiv as the 3rd element under main
    const mainTag = document.querySelector('main');
    if (mainTag) {
      const children = mainTag.children;
      if (children.length >= 3) {
        mainTag.insertBefore(tocDiv, children[3]);
      } else {
        mainTag.appendChild(tocDiv);
      }
    }
  }
});
