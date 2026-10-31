# Exported Assets
2026

A markdown file is not only a page and not only a JavaScript module. The same
`@module` directive works for **CSS, HTML, and SVG**, and the fenced language
decides the content type the reflector serves:

| fence  | directive prefix | served as            | consumed with |
|--------|------------------|----------------------|---------------|
| `js`   | `///`            | `application/javascript` | `import`   |
| `css`  | `/***`           | `text/css`           | `<link>`      |
| `html` | `<!---`          | `text/html`          | `fetch` / inject |
| `svg`  | `@module`        | `image/svg+xml`      | `<img>`       |

The prefixes are litmd's existing "do not execute this block inline" signals,
so each resource is displayed in the page but never run as part of it. This
page exports one of each and then uses them.

See:
[viz](/lab/viz.md),
[input](/lab/input.md),
[litmd](/test/lit.md).

_________________________________________________________
# Export: a stylesheet

```css
/*** @module chip-styles
.asset-chip {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 999px;
  font-family: sans-serif;
  font-size: 14px;
  color: #fff;
  background: linear-gradient(135deg, #9b5de5, #4f83e7);
}
.asset-chip code { background: rgba(255,255,255,.2); padding: 0 4px; border-radius: 4px; }
```

# Export: an SVG badge

```svg
@module badge
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <circle cx="32" cy="32" r="30" fill="#eef3fb" stroke="#4f83e7" stroke-width="4"/>
  <path d="M20 34 l8 8 l16 -20" fill="none" stroke="#46b17b" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

# Export: an HTML fragment

```html
<!--- @module notice
<div class="asset-chip">
  This fragment was fetched from <code>assets.md?module=notice</code>.
</div>
```

_________________________________________________________
# Consume them

The stylesheet and the badge are just URL references, so the browser loads
them exactly as it would any other asset:

```html
<link rel="stylesheet" href="./assets.md?module=chip-styles">
<img src="./assets.md?module=badge" alt="a check mark badge" width="64" height="64">
<div id="asset-notice">loading…</div>
```

The HTML fragment is fetched and injected, since there is no native "HTML
import" in the browser:

```js
const target = document.getElementById('asset-notice');

fetch('./assets.md?module=notice')
  .then((response) => response.text())
  .then((html) => { target.innerHTML = html; })
  .catch((err) => { target.textContent = 'Failed to load notice: ' + err.message; });
```

_________________________________________________________
# Did it work?

Each resource should come back with the right content type and the right body.

```js
const css = await fetch('./assets.md?module=chip-styles');
assertEquals('text/css', css.headers.get('content-type'), 'css content type');
assert((await css.text()).includes('.asset-chip'), 'css body');

const svg = await fetch('./assets.md?module=badge');
assertEquals('image/svg+xml', svg.headers.get('content-type'), 'svg content type');
assert((await svg.text()).includes('<svg'), 'svg body');

const html = await fetch('./assets.md?module=notice');
assertEquals('text/html', html.headers.get('content-type'), 'html content type');
assert((await html.text()).includes('This fragment'), 'html body');
```
