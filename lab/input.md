# Input You Can See
2026

A second lab built on the field from [A Field of Falling
Objects](/lab/viz.md). The field itself did not change. What changed is the
*meaning* given to input.

This is the second rung of the teaching ladder. The first rung asked: *what
happens when objects fall?* This one asks: **what is an input, really?** The
answer here is deliberately concrete — an input is an object that enters the
field. Press a key and a circle appears; click and a circle appears; move and
the field pushes back. Nothing happens off-screen. Every cause is a thing you
can point at.

See:
[home](/),
[viz](/lab/viz.md),
[svg](/lab/svg.md),
[event](/lab/event.md),
[litmd](/test/lit.md).

_________________________________________________________
# Reusing the Component

The whole point of this page is the first line of the script below: it imports
the field — and links and fetches its shared UI — from the previous lab's
markdown, using the `@module` compiler described in [viz.md](/lab/viz.md). No
copy-paste, no shared `.js` file, no build.

```js
/// import {createFieldFromFrame, attachInput, createLog} from './viz.md?module=field';
/// // and in the markup:
/// <link rel="stylesheet" href="./viz.md?module=field-styles">
/// fetch('./viz.md?module=field-frame')
```

So this page owns almost no markup or styling: a container for the injected
frame, and the panel where synthetic input is generated.

```html
<link rel="stylesheet" href="./viz.md?module=field-styles">

<div id="input-stage" class="input-stage">loading field…</div>

<div id="input-panel">
  <p class="input-hint">
    Click the field, then <strong>type any letter</strong> to drop an object.
    <strong>Move</strong> the pointer to push the pile. <strong>Backspace</strong>
    clears.
  </p>
  <div class="input-row">
    <button data-key="a">Send "a"</button>
    <button data-key="b">Send "b"</button>
    <button data-key="c">Send "c"</button>
    <button data-key=" ">Send space</button>
    <button id="input-clear">Clear</button>
  </div>
  <div id="input-log" aria-live="polite"></div>
</div>
```

The stage sets the frame's custom properties, so the shared skeleton comes out
purple here without any change to the markup.

```css
#input-stage {
  max-width: 560px;
  --field-grid: #efe7f7;
  --field-edge: #c3aede;
  --field-cursor: #9b5de5;
  --field-focus: rgba(155, 93, 229, .45);
}

#input-panel { max-width: 560px; font-family: sans-serif; font-size: 14px; }
.input-hint strong { color: #7d43c9; }
@media (prefers-color-scheme: dark) {
  .input-hint strong { color: #c9a3f5; }
}
.input-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
#input-panel button {
  padding: 7px 12px;
  border: 1px solid #cdbcdf;
  border-radius: 6px;
  background: #faf7fe;
  color: #3b3350;
  cursor: pointer;
  font-size: 13px;
}
#input-panel button:hover { background: #f1e9fb; }
#input-log {
  border: 1px solid #ece2f7;
  border-radius: 6px;
  background: #fdfcff;
  padding: 6px 8px;
  height: 84px;
  overflow: hidden;
  font-family: monospace;
  font-size: 12px;
  color: #4a3a63;
}
#input-log .input-log-line { white-space: nowrap; }
```

_________________________________________________________
# The New Policy

Here is the entire difference from the first lab. The field still handles
gravity, collisions, and rendering. `attachInput` still turns DOM events into
`key` and `pointer` payloads. This page only decides what those payloads
*mean* — and its answer is: **make the input visible as an object**.

```js
import {createFieldFromFrame, attachInput, createLog} from './viz.md?module=field';

const stage = document.getElementById('input-stage');
const logEl = document.getElementById('input-log');

// A color derived from the key, so the same key always looks the same.
function colorFor(key) {
  const code = [...String(key)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return `hsl(${code % 360} 70% 55%)`;
}

window.inputApp = {};

// The frame is a resource. Fetch it, inject it, and build the field in one go.
window.inputApp.ready = createFieldFromFrame(
  stage,
  './viz.md?module=field-frame',
  {cursorSelector: '.field-cursor'},
).then((field) => {
  field.start(1);

  attachInput(field, {
    onEvent: (type, p) => {
      if (type === 'key' && p.phase === 'down') {
        if (p.key === 'Backspace') {
          field.clear();
          logEvent('clear', 'Backspace');
          return;
        }
        if (p.key.length === 1) {
          // The key becomes an object. It enters at the pointer when we have
          // one, otherwise at the top center.
          const at = field.getCursor() ?? {x: 240, y: 40};
          field.makeBall(at.x, at.y, 0, 0, {
            r: 10,
            fill: colorFor(p.key),
            type: 'input',
            data: {source: 'key', key: p.key},
          });
          logEvent('key', `${JSON.stringify(p.key)} -> ${colorFor(p.key)}`);
        }
      }

      if (type === 'pointer') {
        if (p.phase === 'move') return;          // the cursor ring shows this
        if (p.phase === 'down') {
          field.spawnAt({x: p.x, y: p.y}, {
            r: 10,
            fill: colorFor(`${p.x},${p.y}`),
            type: 'input',
            data: {source: 'pointer'},
          });
          logEvent('pointer', `object @ ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
        }
        if (p.phase === 'leave') logEvent('pointer', 'leave');
      }
    },
  });

  // Synthetic input: buttons that emit the same DOM events a human would.
  const sendKey = (key) => {
    field.element.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
    field.element.dispatchEvent(new KeyboardEvent('keyup', {key, bubbles: true, cancelable: true}));
  };

  document.querySelectorAll('#input-panel [data-key]')
    .forEach((btn) => btn.addEventListener('click', () => {
      field.element.focus();
      sendKey(btn.dataset.key);
    }));

  document.getElementById('input-clear')
    .addEventListener('click', () => field.clear());

  window.inputApp.field = field;
  return field;
});

const logEvent = createLog(logEl, {limit: 7, pad: 8, className: 'input-log-line'});

```

_________________________________________________________
# Did the reuse work?

If the component compiled and loaded, the field here is a real instance with
its own objects, independent of the first lab.

```js
const field = await window.inputApp.ready;
assert(field, 'the reused field should resolve on window');
assertEquals(480, field.config.width, 'the component kept its default size');

const before = field.balls.length;
field.makeBall(100, 100);
assertEquals(before + 1, field.balls.length, 'objects can be added here too');

// The field arrived as an exported resource, not inline markup.
assert(field.element.classList.contains('field-surface'),
  'the frame came from the exported SVG');
```
