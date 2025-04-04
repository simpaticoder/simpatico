1. Replace bare vendor libraries with package.json deps and copy.
2. Server reload tls when files change (every few months via letsencrypt)
3. (Major) refactor litmd header logic into something both parameterizable by users and overrideable. For example, add a 'litmd' directory with header and footer files, which can be overridden by user packages. They should be parameterized and processed on startup. Use a 'simple file reader hack' like this:
```js
const renderTemplate = (filePath, data) => {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const key in data) {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
  }
  return content;
};
const exampleHtml = `<h1>Welcome, {{name}}!</h1>`;
const result = renderTemplate('./views/index.html', { name: 'John' });
console.log(result); // Outputs rendered HTML

```
4. (medium) Find an alternative to Showdown which is minimal and maintained. Adapt litmd modifications to the new library.

Here is an ordered list of Markdown-to-HTML libraries for Node.js with links to their GitHub repositories:

1. [Markdown-it](https://github.com/markdown-it/markdown-it): Fast, CommonMark-compliant, and extensible Markdown parser.
2. [Remarkable](https://github.com/jonschlinkert/remarkable): Lightweight, fast, and highly configurable Markdown parser.
3. [Showdown](https://github.com/showdownjs/showdown): Bidirectional Markdown-to-HTML and HTML-to-Markdown converter.
4. [Nano-Markdown](https://github.com/travisdowns/nano-markdown): Extremely minimal and lightweight Markdown parser. Too small
5. [Markdown-js](https://github.com/evilstreak/markdown-js): Simple and straightforward Markdown parser for JavaScript. Not maintained.
