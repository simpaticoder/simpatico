# A Field of Falling Objects
2026

An interactive toy for the question: *what happens when we keep dropping
objects into a field?* The field is a plain SVG box. Every object is a
`<circle>`. Gravity pulls them down, the walls and floor bounce them back, and
you can push them around with the keyboard and mouse.

The interesting part is the **seam** between input and simulation. The field
knows nothing about buttons, sliders, or a control panel — it only knows how
to react to DOM events. All the controls below are just event emitters that
send `KeyboardEvent`s and `MouseEvent`s *into the field*, exactly the same
events a real keyboard and mouse would produce. That means the field is fully
playable with real hardware, and the on-screen controls are a remote control
for the same event stream.

See:
[home](/),
[svg](/lab/svg.md),
[event](/lab/event.md),
[litmd](/test/lit.md).

______________________________________________________________________
# Why this exists

This is not really a toy about bouncing balls. It is the first rung of a
ladder for **teaching programming concepts to children** by giving them a
world made of objects they can see, touch, and reason about — in the distant
spirit of Seymour Papert and Logo, where the computer is a thing you think
with, not a thing you operate.

The long arc I am aiming at:

1. **Phenomenology of input.** Before control flow, before variables, there is
the brute fact that *something happens*. A key goes down, a pointer moves, and
the world changes. The child should be able to see the event itself, watch it
enter the field, and connect cause to effect. This page is that rung: every
control is a visible emitter of events, and the field is a visible consumer.
2. **Objects as participants.** Today the objects are inert circles. Soon some
object types will be *special*: when an **input object** (a key, a click, a
pointer) collides with them, they do not merely move — they **react by
emitting other objects**. A key becomes a constructor; a click becomes a
function call; a collision becomes evaluation.
3. **Output objects.** Symmetrically, some objects will represent **output**:
leaving the field, reaching a goal, lighting up, printing. A program is then a
field full of objects passing messages to each other, and *running a program*
is just *watching the field do its thing*.

Between (1) and (2) sits the real subject of this lab: **the event seam**. If
input truly is objects entering a field, then the same mechanism that lets a
human press a key must let one object hand an event to another. The on-screen
controls here are a deliberate rehearsal for that — they emit the *same* DOM
events a human would, so that later, a machine participant can emit them too,
and the field will not be able to tell the difference.

So the component is built to be **reused, not just viewed**. The field is
extracted as a small, explicit module that other labs import; this page is
both its documentation and its first client. See the last section for how
litmd is compiled into loadable resources.

_________________________________________________________
# The Field

The field is a single `<svg>` with a grid backdrop, a border, and a hidden
cursor ring. Objects are appended as `<circle>` children at runtime. The
`tabindex="0"` is deliberate: it makes the SVG focusable so real keyboard
events are delivered *to the field* instead of to the page.

```html
<div id="viz-stage">
  <link rel="stylesheet" href="./viz.md?module=field-styles">
  <svg id="viz-field" class="field-surface" tabindex="0" viewBox="0 0 480 320"
       preserveAspectRatio="xMidYMid meet" aria-label="Field of falling objects">
    <defs>
      <pattern id="viz-grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M24 0H0V24" fill="none" stroke="#e6edf7" stroke-width="1"/>
      </pattern>
    </defs>
    <rect x="0" y="0" width="480" height="320" fill="url(#viz-grid)"/>
    <rect x="3" y="3" width="474" height="314" rx="8" fill="none"
          stroke="#9fb3d1" stroke-width="2"/>
    <circle id="viz-cursor" class="field-cursor" cx="0" cy="0" r="26" fill="none"
            stroke="#4f83e7" stroke-width="2" stroke-dasharray="5 5" opacity="0"/>
  </svg>
</div>
```

_________________________________________________________
# The Shared Field Skin

The surface styling and the SVG skeleton are the same for every lab that uses
a field, so they are exported too. A new lab links the stylesheet and fetches
the frame instead of copying markup and CSS. The frame is parameterized with
CSS custom properties, so a consumer can retheme it without touching the
markup.

```css
/*** @module field-styles
.field-surface {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
  border-radius: 10px;
  cursor: crosshair;
  touch-action: none;
  outline: none;
}
.field-surface:focus {
  box-shadow: 0 0 0 3px var(--field-focus, rgba(79, 131, 231, .45));
}
```

```svg
@module field-frame
<svg xmlns="http://www.w3.org/2000/svg" class="field-surface" tabindex="0"
     viewBox="0 0 480 320" preserveAspectRatio="xMidYMid meet"
     aria-label="Field of falling objects">
  <defs>
    <pattern id="field-grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none"
            stroke="var(--field-grid, #e6edf7)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="480" height="320" fill="url(#field-grid)"/>
  <rect x="3" y="3" width="474" height="314" rx="8" fill="none"
        stroke="var(--field-edge, #9fb3d1)" stroke-width="2"/>
  <circle class="field-cursor" cx="0" cy="0" r="26" fill="none"
          stroke="var(--field-cursor, #4f83e7)" stroke-width="2"
          stroke-dasharray="5 5" opacity="0"/>
</svg>
```

_________________________________________________________
# The Control Panel

Two kinds of controls:

1. **Direct controls** — spawn, rain, clear, and the gravity slider. These
   poke the simulation's public state.
2. **Event controls** — the D-pad, the Space/c buttons, and the trackpad.
   These do not touch the simulation at all. They synthesize DOM events and
   dispatch them at `#viz-field`, then the field's own listeners react.

```html
<div id="viz-controls">
  <div class="viz-row">
    <button id="viz-spawn">Spawn ball</button>
    <button id="viz-rain">Start rain</button>
    <button id="viz-clear">Clear</button>
  </div>

  <div class="viz-row">
    <label for="viz-gravity">Gravity</label>
    <input id="viz-gravity" type="range" min="0" max="2500" value="800" step="50">
    <output id="viz-gravity-out">800</output>
  </div>

  <div class="viz-row">
    <div id="viz-dpad" aria-label="Simulated arrow keys">
      <button data-key="ArrowUp"    class="viz-up"    title="ArrowUp">&#8593;</button>
      <button data-key="ArrowLeft"  class="viz-left"  title="ArrowLeft">&#8592;</button>
      <button data-key="ArrowDown"  class="viz-down"  title="ArrowDown">&#8595;</button>
      <button data-key="ArrowRight" class="viz-right" title="ArrowRight">&#8594;</button>
    </div>
    <div class="viz-keycol">
      <button data-key=" " title="Space">Space &middot; lift + spawn</button>
      <button data-key="c" title="c">c &middot; clear</button>
    </div>
  </div>

  <div class="viz-row">
    <div id="viz-trackpad" tabindex="0" title="Move or click here to forward mouse events">
      <span>trackpad &rarr; field</span>
    </div>
    <button id="viz-click-center">Click center</button>
  </div>

  <div class="viz-row viz-meters">
    <span>cursor <output id="viz-cursor-out">&ndash;</output></span>
    <span>balls <output id="viz-count-out">0</output></span>
    <span>g <output id="viz-g-out">800</output></span>
  </div>

  <div id="viz-log" aria-live="polite"></div>
</div>
```

_________________________________________________________
# Styling

```css
#viz-stage { max-width: 560px; }

#viz-controls { max-width: 560px; font-family: sans-serif; font-size: 14px; }
.viz-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 10px 0;
}
#viz-controls button {
  padding: 7px 12px;
  border: 1px solid #b9c6da;
  border-radius: 6px;
  background: #f4f7fc;
  color: #33405a;
  cursor: pointer;
  font-size: 13px;
}
#viz-controls button:hover { background: #e8eefb; }
#viz-controls button:active { background: #d8e4fa; }

#viz-gravity { flex: 1; min-width: 140px; }
#viz-gravity-out, #viz-g-out { font-variant-numeric: tabular-nums; min-width: 3ch; }

#viz-dpad {
  display: grid;
  grid-template-columns: repeat(3, 40px);
  grid-template-rows: repeat(2, 40px);
  gap: 4px;
}
#viz-dpad .viz-up    { grid-column: 2; grid-row: 1; }
#viz-dpad .viz-left  { grid-column: 1; grid-row: 2; }
#viz-dpad .viz-down  { grid-column: 2; grid-row: 2; }
#viz-dpad .viz-right { grid-column: 3; grid-row: 2; }
.viz-keycol { display: flex; flex-direction: column; gap: 4px; }

#viz-trackpad {
  width: 150px;
  height: 72px;
  border: 1px dashed #9fb3d1;
  border-radius: 8px;
  background:
    repeating-linear-gradient(45deg, #f7f9fd 0 8px, #eef3fb 8px 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7788a4;
  cursor: none;
  touch-action: none;
  user-select: none;
}

.viz-meters {
  gap: 18px;
  opacity: .75;
  font-family: monospace;
  font-size: 12px;
}
#viz-log {
  border: 1px solid #e0e7f2;
  border-radius: 6px;
  background: #fbfcfe;
  padding: 6px 8px;
  height: 92px;
  overflow: hidden;
  font-family: monospace;
  font-size: 12px;
  color: #33405a;
}
#viz-log .viz-log-line { white-space: nowrap; }
```

_________________________________________________________
# The Reusable Component

The component is a litmd `@module`: an ordinary-looking section whose code can
be compiled and imported by other pages. The lifecycle is small enough to hold
in your head:

```
clock tick  ->  step(dt)  ->  render()
                  |
                  +-- gravity
                  +-- forces from held keys
                  +-- repulsion from the cursor
                  +-- wall + floor collisions
```

The event listeners are the field's only inputs. Note that the field never
looks at the control panel; it only reacts to events that arrive on itself.

```js
/// @module field
import * as svg from './svg.js';

const NS = 'http://www.w3.org/2000/svg';

const DEFAULTS = {
  width: 480,          // world size; matches the demo viewBox
  height: 320,
  wall: 6,             // wall thickness
  maxBalls: 80,
  restitution: 0.62,   // bounciness
  drag: 0.999,         // per-step velocity loss
  cursorRadius: 90,    // how far the pointer pushes
  gravity: 800,
  rainInterval: 0.16,  // seconds between raindrops
  palette: ['#4f83e7', '#e7574f', '#f0a53a', '#46b17b',
            '#9b5de5', '#e05fa0', '#2fbfc9'],
};

/**
 * Create a field: a physics box that renders its objects as SVG circles.
 *
 * @param {SVGSVGElement} element - the SVG the field draws into
 * @param {object} [options] - overrides for DEFAULTS, plus:
 *   cursorElement {SVGElement}  ring drawn at the pointer
 *   onRender {function}         called after every frame with the field
 * @returns {object} the field controller
 */
export function createField(element, options = {}) {
  const config = {...DEFAULTS, ...options};
  const floor = config.height - config.wall;
  const cursorElement = options.cursorElement ?? null;
  const onRender = options.onRender ?? null;
  const balls = [];
  const keys = new Set();

  let cursor = null;
  let gravity = config.gravity;
  let rain = false;
  let rainDebt = 0;
  let spawnCount = 0;
  let clock = null;
  let last = 0;

  // ---------------------------------------------------------------- factory
  function makeBall(x, y, vx = 0, vy = 0, overrides = {}) {
    const r = overrides.r ?? 9 + Math.random() * 9;
    const fill = overrides.fill
      ?? config.palette[Math.floor(Math.random() * config.palette.length)];
    const elt = document.createElementNS(NS, 'circle');
    elt.setAttribute('r', r);
    elt.setAttribute('fill', fill);
    elt.setAttribute('stroke', 'rgba(0,0,0,.22)');
    elt.setAttribute('stroke-width', '1');
    element.appendChild(elt);

    const ball = {
      id: spawnCount++,
      type: overrides.type ?? 'circle',
      data: overrides.data ?? null,
      x, y, vx, vy, r, fill, elt,
    };
    balls.push(ball);
    if (balls.length > config.maxBalls) removeOldest();
    return ball;
  }

  function removeOldest() {
    const old = balls.shift();
    if (old && old.elt.parentNode) old.elt.parentNode.removeChild(old.elt);
  }

  function spawnTop(overrides = {}) {
    const r = overrides.r ?? 12;
    const x = config.wall + r
      + Math.random() * (config.width - 2 * config.wall - 2 * r);
    return makeBall(x, config.wall + r, (Math.random() - 0.5) * 120, 0, overrides);
  }

  function spawnAt({x, y}, overrides = {}) {
    const r = overrides.r ?? 12;
    return makeBall(
      Math.min(config.width - config.wall - r, Math.max(config.wall + r, x)),
      Math.min(floor - r, Math.max(config.wall + r, y)),
      0, 0, overrides,
    );
  }

  function clear() {
    while (balls.length) removeOldest();
  }

  // -------------------------------------------------------------- physics
  /**
   * Advance the world by dt seconds.
   * @param {number} dt
   */
  function step(dt) {
    for (const b of balls) {
      // Held keys are continuous forces, not one-shot impulses.
      if (keys.has('ArrowLeft'))  b.vx -= 1100 * dt;
      if (keys.has('ArrowRight')) b.vx += 1100 * dt;
      if (keys.has('ArrowUp'))    b.vy -= 2200 * dt;   // enough to beat gravity
      if (keys.has('ArrowDown'))  b.vy += 1100 * dt;

      // The cursor is a repeller.
      if (cursor) {
        const dx = b.x - cursor.x;
        const dy = b.y - cursor.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < config.cursorRadius * config.cursorRadius) {
          const d = Math.sqrt(d2);
          const f = (1 - d / config.cursorRadius) * 3200;
          b.vx += (dx / d) * f * dt;
          b.vy += (dy / d) * f * dt;
        }
      }

      b.vy += gravity * dt;
      b.vx *= config.drag;
      b.vy *= config.drag;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Walls.
      if (b.x - b.r < config.wall) {
        b.x = config.wall + b.r;
        b.vx = Math.abs(b.vx) * config.restitution;
      }
      if (b.x + b.r > config.width - config.wall) {
        b.x = config.width - config.wall - b.r;
        b.vx = -Math.abs(b.vx) * config.restitution;
      }
      // Floor; settle tiny bounces to zero so the pile goes quiet.
      if (b.y + b.r > floor) {
        b.y = floor - b.r;
        b.vy = -Math.abs(b.vy) * config.restitution;
        if (Math.abs(b.vy) < 25) b.vy = 0;
      }
      if (b.y - b.r < config.wall) {
        b.y = config.wall + b.r;
        b.vy = Math.abs(b.vy) * config.restitution;
      }
    }
  }

  function render() {
    for (const b of balls) {
      svg.scatter(b.elt, {x: b.x, y: b.y});
    }
    if (cursorElement) {
      if (cursor) {
        svg.scatter(cursorElement, {x: cursor.x, y: cursor.y, opacity: 0.9});
      } else {
        cursorElement.setAttribute('opacity', '0');
      }
    }
    if (onRender) onRender(api);
  }

  function tick(e) {
    const dt = Math.min(0.033, (e.detail.t - last) / 1000);
    last = e.detail.t;

    if (rain) {
      rainDebt += dt;
      while (rainDebt > config.rainInterval) {
        spawnTop();
        rainDebt -= config.rainInterval;
      }
    }
    step(dt);
    render();
  }

  function start(throttle = 1) {
    if (clock) return clock;
    clock = svg.clock(throttle);
    last = Date.now();
    window.addEventListener(clock.clockId, tick);
    return clock;
  }

  function stop() {
    if (!clock) return;
    clock.stop();
    window.removeEventListener(clock.clockId, tick);
    clock = null;
  }

  const api = {
    element, config, balls, keys,
    makeBall, removeOldest, spawnTop, spawnAt, clear,
    step, render, start, stop,
    setGravity: (g) => { gravity = g; },
    getGravity: () => gravity,
    setRain: (on) => { rain = on; rainDebt = 0; },
    isRaining: () => rain,
    setCursor: (p) => { cursor = p; },
    getCursor: () => cursor,
    toWorld: (clientX, clientY) => clientToWorld(element, clientX, clientY),
  };

  return api;
}

/**
 * Convert viewport (client) coordinates to coordinates inside an SVG element.
 */
export function clientToWorld(element, clientX, clientY) {
  const pt = element.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(element.getScreenCTM().inverse());
}

const PREVENT_DEFAULT = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];

/**
 * Translate raw DOM input into a small vocabulary the field understands, and
 * report each event through `onEvent(type, payload)`:
 *
 *   ('key',     {phase: 'down'|'up', key})
 *   ('pointer', {phase: 'down'|'move'|'leave', x?, y?})
 *
 * This is the *policy* layer: the field only moves objects, while the caller
 * decides what an event means. That separation is the whole point — a machine
 * participant can later emit the same DOM events and the field cannot tell.
 *
 * @returns {function} detach
 */
export function attachInput(field, {onEvent = () => {}} = {}) {
  const element = field.element;

  const keydown = (e) => {
    if (PREVENT_DEFAULT.includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    field.keys.add(e.key);
    onEvent('key', {phase: 'down', key: e.key});
  };

  const keyup = (e) => {
    field.keys.delete(e.key);
    onEvent('key', {phase: 'up', key: e.key});
  };

  const mousedown = (e) => {
    e.preventDefault();
    element.focus();
    const p = field.toWorld(e.clientX, e.clientY);
    onEvent('pointer', {phase: 'down', x: p.x, y: p.y});
  };

  const mousemove = (e) => {
    const p = field.toWorld(e.clientX, e.clientY);
    field.setCursor({x: p.x, y: p.y});
    onEvent('pointer', {phase: 'move', x: p.x, y: p.y});
  };

  const mouseleave = () => {
    field.setCursor(null);
    onEvent('pointer', {phase: 'leave'});
  };

  element.addEventListener('keydown', keydown);
  element.addEventListener('keyup', keyup);
  element.addEventListener('mousedown', mousedown);
  element.addEventListener('mousemove', mousemove);
  element.addEventListener('mouseleave', mouseleave);

  return function detach() {
    element.removeEventListener('keydown', keydown);
    element.removeEventListener('keyup', keyup);
    element.removeEventListener('mousedown', mousedown);
    element.removeEventListener('mousemove', mousemove);
    element.removeEventListener('mouseleave', mouseleave);
  };
}

/**
 * Fetch an exported frame, inject it into `container`, and create a field from
 * it. This is the ergonomic path for a lab that consumes a field resource:
 *
 *   const field = await createFieldFromFrame(stage, './viz.md?module=field-frame', {
 *     cursorSelector: '.field-cursor',
 *   });
 *
 * @param {Element} container
 * @param {string} frameUrl
 * @param {object} [options] - passed through to createField, plus:
 *   frameSelector {string}  defaults to 'svg'
 *   cursorSelector {string} the pointer ring inside the frame
 * @returns {Promise<object>} the field
 */
export async function createFieldFromFrame(container, frameUrl, options = {}) {
  const {frameSelector = 'svg', cursorSelector, ...fieldOptions} = options;
  const response = await fetch(frameUrl);

  if (!response.ok) {
    throw new Error(`Could not load field frame '${frameUrl}': ${response.status}`);
  }

  container.innerHTML = await response.text();
  const element = container.querySelector(frameSelector);

  if (!element) {
    throw new Error(`Field frame '${frameUrl}' had no '${frameSelector}'`);
  }

  const cursorElement = cursorSelector
    ? container.querySelector(cursorSelector)
    : null;

  return createField(element, {...fieldOptions, cursorElement});
}

/**
 * A tiny capped event log. Returns a `log(type, detail)` function that
 * prepends a monospace line and keeps only the most recent few. Repeated
 * mousemove lines are collapsed into one.
 *
 * @param {Element} element - container to prepend lines into
 * @param {object} [options]
 * @param {number} [options.limit=8]  how many lines to keep
 * @param {number} [options.pad=9]    column width for the event type
 * @param {string} [options.className='log-line']
 * @returns {(type: string, detail: string) => void}
 */
export function createLog(element, {limit = 8, pad = 9, className = 'log-line'} = {}) {
  let lastType = null;
  return function log(type, detail) {
    if (type === 'mousemove' && lastType === 'mousemove' && element.firstChild) {
      element.firstChild.textContent = `mousemove  ${detail}`;
      return;
    }
    const line = document.createElement('div');
    line.className = className;
    line.textContent = `${type.padEnd(pad)} ${detail}`;
    element.prepend(line);
    while (element.children.length > limit) element.lastChild.remove();
    lastType = type;
  };
}
```

Everything above is the component. The `///` marker keeps it from running as
part of this page; it is compiled to a real module at `./viz.md?module=field`
and imported below.

_________________________________________________________
# One Client of the Component

This page is just the first consumer. The demo decides what input *means*:
space spawns, `c` clears, a click drops a circle. None of that policy lives in
the field.

```js
import * as svg from './svg.js';
import {createField, attachInput, createLog} from './viz.md?module=field';

const fieldEl = svg.elt('viz-field');
const cursorOut = svg.elt('viz-cursor-out');
const countOut = svg.elt('viz-count-out');
const gOut = svg.elt('viz-g-out');
const logEl = svg.elt('viz-log');
const trackpad = svg.elt('viz-trackpad');

const field = createField(fieldEl, {
  cursorElement: svg.elt('viz-cursor'),
  onRender: (f) => { countOut.value = f.balls.length; },
});
field.start(1);

// The field's input policy lives here, in the demo, not in the component.
attachInput(field, {
  onEvent: (type, p) => {
    if (type === 'key') {
      if (p.phase === 'down') {
        if (p.key === ' ') field.spawnTop();
        if (p.key === 'c' || p.key === 'C') field.clear();
      }
      logEvent(`key${p.phase}`, JSON.stringify(p.key));
    }
    if (type === 'pointer') {
      if (p.phase === 'move') {
        cursorOut.value = `${p.x.toFixed(0)},${p.y.toFixed(0)}`;
        logEvent('mousemove', cursorOut.value);
      }
      if (p.phase === 'down') {
        const b = field.spawnAt({x: p.x, y: p.y});
        logEvent('mousedown', `add @ ${b.x.toFixed(0)},${b.y.toFixed(0)}`);
      }
      if (p.phase === 'leave') cursorOut.value = '\u2013';
    }
  },
});

// ------------------------------------------------------- the control panel
const gravityInput = svg.elt('viz-gravity');
const gravityOut = svg.elt('viz-gravity-out');
svg.elt('viz-spawn').addEventListener('click', () => field.spawnTop());
svg.elt('viz-clear').addEventListener('click', () => field.clear());

const rainBtn = svg.elt('viz-rain');
rainBtn.addEventListener('click', () => {
  const next = !field.isRaining();
  field.setRain(next);
  rainBtn.textContent = next ? 'Stop rain' : 'Start rain';
});

gravityInput.addEventListener('input', () => {
  const g = Number(gravityInput.value);
  field.setGravity(g);
  gravityOut.value = g;
  gOut.value = g;
});

// --- Event controls. These synthesize DOM events; they never call step(). ---
function sendKey(type, key) {
  fieldEl.dispatchEvent(new KeyboardEvent(type, {key, bubbles: true, cancelable: true}));
}

function sendMouse(type, clientX, clientY) {
  fieldEl.dispatchEvent(new MouseEvent(type, {
    clientX, clientY, bubbles: true, cancelable: true,
  }));
}

function bindKeyButton(btn, key) {
  let down = false;
  const press = (e) => {
    e.preventDefault();
    if (down) return;
    down = true;
    fieldEl.focus();
    sendKey('keydown', key);
  };
  const release = () => {
    if (!down) return;
    down = false;
    sendKey('keyup', key);
  };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
}

document.querySelectorAll('#viz-controls [data-key]')
  .forEach((btn) => bindKeyButton(btn, btn.dataset.key));

// Map a point on the trackpad onto the field's screen box, then dispatch a
// real MouseEvent at that viewport position. Because the field converts
// client coordinates back to world coordinates, this behaves identically to
// moving a real mouse across the field.
function trackpadToField(e) {
  const pad = trackpad.getBoundingClientRect();
  const box = fieldEl.getBoundingClientRect();
  const nx = Math.min(1, Math.max(0, (e.clientX - pad.left) / pad.width));
  const ny = Math.min(1, Math.max(0, (e.clientY - pad.top) / pad.height));
  return {clientX: box.left + nx * box.width, clientY: box.top + ny * box.height};
}

trackpad.addEventListener('pointermove', (e) => {
  const p = trackpadToField(e);
  sendMouse('mousemove', p.clientX, p.clientY);
});
trackpad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const p = trackpadToField(e);
  sendMouse('mousedown', p.clientX, p.clientY);
  sendMouse('mouseup', p.clientX, p.clientY);
});

svg.elt('viz-click-center').addEventListener('click', () => {
  const box = fieldEl.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  sendMouse('mousemove', cx, cy);
  sendMouse('mousedown', cx, cy);
  sendMouse('mouseup', cx, cy);
});

// ------------------------------------------------------------------ logger
const logEvent = createLog(logEl, {limit: 8, className: 'viz-log-line'});

// Handy for the console and for the test below.
window.vizApp = { field };
```

_________________________________________________________
# Did it work?

A field that only animates is hard to test, but the physics is a pure function
of state, so we can drive it directly. We add a ball with no velocity, step
the world once, and assert that gravity made it move *down* — which, in SVG
coordinates, means a larger `y`.

```js
const {field} = window.vizApp;
assert(field, 'the field component should be exposed on window');

const ball = field.makeBall(240, 40);
assertEquals('circle', ball.elt.tagName, 'objects are SVG circles');
const yBefore = ball.y;
field.step(0.1);

assert(ball.y > yBefore, 'gravity should pull the object down');
assert(ball.vy > 0, 'downward velocity should be positive');
assert(document.querySelectorAll('#viz-field circle').length >= 2,
  'the field should contain the cursor plus at least one object');
```

_________________________________________________________
# Try it

- **Click anywhere in the field** to drop a new circle there.
- **Hold ← → ↑ ↓** (after clicking the field, or with the D-pad) to push every
  circle around. `↑` is stronger than gravity, so a sustained hold lifts the
  whole pile.
- **Move the mouse over the field** to blow the circles away from a moving
  repeller ring.
- **Drag on the trackpad** to forward mouse-move events without a real mouse,
  and **click the trackpad** to forward a click. Watch the log: the field
  cannot tell the difference.
- **Space** lifts and spawns at the top; **c** clears the field.
- Turn **gravity to 0** and nudge with the arrow keys for a zero-gravity box.

_________________________________________________________
# How this becomes a component

A litmd file is normally compiled into a page. Here it also compiles into
**resources**, because the reflector understands one new convention: a fenced
code block whose first line is a directive.

```
/// @module <name>
```

The fenced language chooses the resource type, and the directive prefix is
that language's existing litmd "do not run this block inline" signal:

| fence  | directive       | served as                |
|--------|-----------------|--------------------------|
| `js`   | `/// @module`   | `application/javascript` |
| `css`  | `/*** @module`  | `text/css`               |
| `html` | `<!--- @module` | `text/html`              |
| `svg`  | `@module`       | `image/svg+xml`          |

- `extractModules()` in `lib/litmd-modules.js` finds every such block, strips
  the directive, and keeps the remaining source together with its line number
  in the markdown.
- The reflector serves it with the matching content type when the same URL is
  requested with a `?module=` query. `lab/viz.md?module=field` returns the
  compiled JavaScript; [assets](/lab/assets.md) exports CSS, HTML, and SVG.
- Compiled resources are memoized under a key that shares the file's path, so
  editing the markdown invalidates the page *and* every resource it owns.

Any other literate page can then reach across files:

```js
/// import {createField, attachInput, createLog} from './viz.md?module=field';
/// <link rel="stylesheet" href="./assets.md?module=chip-styles">
```

That is the whole trick: **the documentation is the source, and the query URL
is the build artifact.** There is no separate `.js` file to drift out of sync,
and no build step — the reflector compiles on demand and caches the result
beside the page.

The next lab, [input](/lab/input.md), is the first real consumer: it imports
this same field and gives the events a different meaning, which is where the
"objects that react by emitting other objects" idea begins.
