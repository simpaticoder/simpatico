import hljs from '../vendor/highlight.min.js';
import javascript from '../vendor/highlight.javascript.min.js';

hljs.registerLanguage('javascript', javascript);

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

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

  // Add a table of contents - but only if there are more than 3 headings.
  // Front matter is metadata, not content, so its title/headings are excluded.
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter((heading) => !heading.closest('.frontmatter'));
  if (headings.length > 3) {
    let rows = '';
    headings.forEach(function (heading, index) {
      const id = heading.id;
      if (!id) return;
      const level = Number(heading.tagName[1]);
      const indent = (level - 1) * 12;
      rows += `<tr><td class="toc-num">${index + 1}</td>`
        + `<td><a href="#${id}" style="padding-left:${indent}px">${escapeHtml(heading.textContent)}</a></td></tr>`;
    });

    const tocDiv = document.createElement('div');
    tocDiv.id = 'toc';
    tocDiv.innerHTML = `<table class="toc"><caption>contents</caption>${rows}</table>`;

    const mainTag = document.querySelector('main');
    const frontMatter = mainTag && mainTag.querySelector('.frontmatter');
    if (frontMatter) {
      // Keep the TOC directly below the front matter metadata block.
      frontMatter.after(tocDiv);
    } else if (mainTag) {
      // Otherwise insert the tocDiv as the 3rd element under main
      const children = mainTag.children;
      if (children.length >= 3) {
        mainTag.insertBefore(tocDiv, children[3]);
      } else {
        mainTag.appendChild(tocDiv);
      }
    }
  }
});
