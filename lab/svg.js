/**
 * SVG utility functions for element selection, attribute manipulation, and animation.
 *
 * This module provides a lightweight alternative to D3 for simple SVG animations,
 * using a "scatter/gather" pattern to transfer data between JS objects and DOM elements.
 *
 * @module svg
 */

import {as, getType, cast, hasProp} from '../lib/core.js';

/**
 * Find an element by ID or class name.
 *
 * @param {string} idOrClass - The ID (without #) or class name (without .) to search for
 * @param {Element} [parent] - Optional parent element to search within. If provided,
 *   searches by class name within parent. If omitted, searches by ID in document.
 * @returns {Element|null} The found element, or null/undefined if not found
 *
 * @example
 * // Find by ID
 * const svg = elt('my-svg');
 *
 * // Find by class within a parent
 * const circle = elt('node-circle', svgElement);
 */
const elt = (idOrClass, parent) => {
  if (parent) {
    return parent.getElementsByClassName(idOrClass)[0];
  }
  return document.getElementById(idOrClass);
};

/**
 * Scatter object properties onto an element's attributes.
 *
 * This is the core function for animating SVG elements. It intelligently handles
 * special cases for different element types:
 *
 * - **`<g>` elements**: `x`, `y`, `rotate`, `scale` are converted to a `transform` attribute
 * - **`<circle>` elements**: `x`, `y` are mapped to `cx`, `cy` if not explicitly set
 * - **`<g>` with children**: `fill` is applied to the first child element
 * - **`<g>` with `<text>`**: `text` property sets the text content of nested `<text>` element
 * - **`data-*` properties**: Stored as element properties (not attributes)
 *
 * @param {Element} elt - The target SVG/HTML element
 * @param {Object} obj - Source object with properties to scatter. **Warning: this object is mutated!**
 *   Properties are deleted after being processed for transforms, text, and fill.
 * @returns {Element} The modified element
 *
 * @example
 * // Animate a group element
 * scatter(groupElt, {x: 10, y: 20, rotate: 45, scale: 1.5});
 * // Results in: transform="translate(10, 20)rotate(45)scale(1.5)"
 *
 * @example
 * // Update a circle position and color
 * scatter(circleElt, {x: 50, y: 50, fill: 'red'});
 * // Results in: cx="50" cy="50" fill="red"
 */
const scatter = (elt, obj) => {
  as.elt(elt) && as.obj(obj);

  // Special treatment for circles: treat x and y as cx cy if not explicitly specified
  if (elt.tagName === 'circle') {
    if (hasProp(obj, 'x') && !hasProp(obj, 'cx')) obj.cx = obj.x;
    if (hasProp(obj, 'y') && !hasProp(obj, 'cy')) obj.cy = obj.y;
  }

  // For <g> elements, build transform string from x, y, rotate, scale
  if (elt.tagName === 'g' && !hasProp(obj, 'transform')) {
    const clauses = [];

    if (hasProp(obj, 'x') && hasProp(obj, 'y')) {
      clauses.push(`translate(${obj.x}, ${obj.y})`);
      delete obj.x;
      delete obj.y;
    }
    if (hasProp(obj, 'rotate')) {
      clauses.push(`rotate(${obj.rotate})`);
      delete obj.rotate;
    }
    if (hasProp(obj, 'scale')) {
      clauses.push(`scale(${obj.scale})`);
      delete obj.scale;
    }

    if (clauses.length > 0) {
      elt.setAttribute('transform', clauses.join(''));
    }
  }

  // Set text content of nested <text> element
  if (hasProp(obj, 'text')) {
    const textElt = elt.querySelector('text');
    if (textElt) {
      textElt.textContent = obj.text;
    }
    delete obj.text;
  }

  // Apply fill to first child of <g> (common pattern for grouped shapes)
  if (hasProp(obj, 'fill') && elt.tagName === 'g' &&
      elt.children.length > 0 && elt.children[0].tagName !== 'g') {
    elt.children[0].setAttribute('fill', obj.fill);
    delete obj.fill;
  }

  // Scatter remaining properties as attributes
  for (let [key, value] of Object.entries(obj)) {
    if (key.startsWith('data-')) {
      // Store data-* as element properties
      const propName = key.substring(5);
      if (elt[propName] !== value) {
        elt[propName] = value;
      }
    } else {
      // Set as attribute (only if changed)
      const old = elt.getAttribute(key);
      if (String(value) !== old) {
        elt.setAttribute(key, value);
      }
    }
  }

  return elt;
};

/**
 * Gather element attributes into an object, with type casting.
 *
 * The inverse of `scatter`. Reads attributes from an element and writes them
 * to the corresponding properties of the provided object. Values are cast
 * to match the existing type of each property in the object.
 *
 * @param {Element} elt - The source SVG/HTML element
 * @param {Object} obj - Target object. Only keys already present will be populated.
 *   The existing value types determine how attribute strings are cast.
 * @returns {Object} The modified object
 *
 * @example
 * const state = {x: 0, y: 0, visible: true};
 * gather(element, state);
 * // state.x and state.y are now numbers parsed from attributes
 * // state.visible is a boolean
 */
const gather = (elt, obj) => {
  as.elt(elt) && as.obj(obj);

  for (const key in obj) {
    if (!elt.hasAttribute(key)) continue;

    const val = elt.getAttribute(key);
    const type = getType(obj[key]);

    if (type === 'number') {
      obj[key] = parseLeadingNumber(val);
    } else {
      obj[key] = cast(type, val);
    }
  }

  return obj;
};

/**
 * Parse a leading number from a string (e.g., "42px" -> 42).
 *
 * @param {string} str - String potentially starting with a number
 * @returns {number|string} The parsed number, or the original string if no number found
 * @private
 */
function parseLeadingNumber(str) {
  const match = str.match(/^-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : str;
}

// ============================================================================
// Transform Parsing and Rendering
// ============================================================================

/** Radians to degrees conversion factor */
const RAD_TO_DEG = 180 / Math.PI;

/**
 * @typedef {Object} TranslateTransform
 * @property {number} x - X-axis translation
 * @property {number} y - Y-axis translation
 */

/**
 * @typedef {Object} ScaleTransform
 * @property {number} x - X-axis scaling factor
 * @property {number} y - Y-axis scaling factor
 */

/**
 * @typedef {Object} RotateTransform
 * @property {number} angle - Rotation angle in degrees
 * @property {number} [x] - X-coordinate of rotation center
 * @property {number} [y] - Y-coordinate of rotation center
 */

/**
 * @typedef {Object} MatrixTransform
 * @property {number} a - Scale X
 * @property {number} b - Skew Y
 * @property {number} c - Skew X
 * @property {number} d - Scale Y
 * @property {number} e - Translate X
 * @property {number} f - Translate Y
 */

/**
 * @typedef {Object} ParsedTransform
 * @property {TranslateTransform} [translate] - Translation values
 * @property {ScaleTransform} [scale] - Scaling values
 * @property {RotateTransform} [rotate] - Rotation values
 * @property {number} [skewX] - Horizontal skew angle in degrees
 * @property {number} [skewY] - Vertical skew angle in degrees
 * @property {MatrixTransform} [matrix] - Raw matrix values
 */

/**
 * Parse an SVG element's transform attribute into a structured object.
 *
 * Extracts individual transform components (translate, scale, rotate, skew, matrix)
 * from the element's transform list and returns them as a plain object.
 *
 * @param {SVGGraphicsElement} elt - An SVG element with transform attribute(s)
 * @returns {ParsedTransform} Object containing the parsed transform components
 *
 * @example
 * // For an element with transform="translate(10, 20) scale(2) rotate(45)"
 * const t = parseTransform(element);
 * // Returns: { translate: {x: 10, y: 20}, scale: {x: 2, y: 2}, rotate: {angle: 45} }
 */
const parseTransform = (elt) => {
  const result = {};
  const transformList = elt.transform.baseVal;

  for (let i = 0; i < transformList.numberOfItems; i++) {
    const transform = transformList.getItem(i);
    const m = transform.matrix;

    switch (transform.type) {
      case SVGTransform.SVG_TRANSFORM_TRANSLATE:
        result.translate = {x: m.e, y: m.f};
        break;

      case SVGTransform.SVG_TRANSFORM_SCALE:
        result.scale = {x: m.a, y: m.d};
        break;

      case SVGTransform.SVG_TRANSFORM_ROTATE:
        if (transform.angle !== 0) {
          result.rotate = {
            angle: transform.angle,
            x: transform.rotateX || 0,
            y: transform.rotateY || 0
          };
        }
        break;

      case SVGTransform.SVG_TRANSFORM_SKEWX:
        result.skewX = Math.atan(m.c) * RAD_TO_DEG;
        break;

      case SVGTransform.SVG_TRANSFORM_SKEWY:
        result.skewY = Math.atan(m.b) * RAD_TO_DEG;
        break;

      case SVGTransform.SVG_TRANSFORM_MATRIX:
        result.matrix = {a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f};
        break;

      default:
        console.warn(`Unhandled transform type: ${transform.type}`);
    }
  }

  return result;
};

/**
 * Render a transform object to an SVG transform attribute string.
 *
 * The inverse of `parseTransform`. Converts a structured transform object
 * back into a string suitable for the `transform` attribute.
 *
 * @param {ParsedTransform} obj - Object containing transform components
 * @returns {string} SVG transform attribute string (e.g., "translate(10,20) scale(2)")
 *
 * @example
 * renderTransform({
 *   translate: {x: 10, y: 20},
 *   rotate: {angle: 45, x: 50, y: 50}
 * });
 * // Returns: "translate(10,20) rotate(45,50,50)"
 */
const renderTransform = (obj) => {
  const parts = [];

  if (obj.translate) {
    parts.push(`translate(${obj.translate.x},${obj.translate.y})`);
  }
  if (obj.scale) {
    parts.push(`scale(${obj.scale.x},${obj.scale.y})`);
  }
  if (obj.rotate) {
    const {angle, x, y} = obj.rotate;
    parts.push(x !== undefined && y !== undefined
      ? `rotate(${angle},${x},${y})`
      : `rotate(${angle})`);
  }
  if (obj.skewX !== undefined) {
    parts.push(`skewX(${obj.skewX})`);
  }
  if (obj.skewY !== undefined) {
    parts.push(`skewY(${obj.skewY})`);
  }
  if (obj.matrix) {
    const {a, b, c, d, e, f} = obj.matrix;
    parts.push(`matrix(${a},${b},${c},${d},${e},${f})`);
  }

  return parts.join(' ');
};

// ============================================================================
// Geometry and Collision Detection
// ============================================================================

/**
 * @typedef {Object} Rect
 * @property {number} top - Top edge Y coordinate
 * @property {number} bottom - Bottom edge Y coordinate
 * @property {number} left - Left edge X coordinate
 * @property {number} right - Right edge X coordinate
 */

/**
 * @typedef {Object} CardinalRect
 * @property {number} N - North (top) edge Y coordinate
 * @property {number} S - South (bottom) edge Y coordinate
 * @property {number} E - East (right) edge X coordinate
 * @property {number} W - West (left) edge X coordinate
 */

/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * Test if two rectangles intersect.
 *
 * Uses the separating axis theorem - rectangles intersect unless one is
 * completely to the left, right, above, or below the other.
 *
 * @param {Rect} r1 - First rectangle (e.g., from getBoundingClientRect)
 * @param {Rect} r2 - Second rectangle
 * @returns {boolean} True if rectangles overlap
 *
 * @example
 * const a = {top: 0, bottom: 10, left: 0, right: 10};
 * const b = {top: 5, bottom: 15, left: 5, right: 15};
 * intersectRect(a, b); // true (they overlap)
 */
const intersectRect = (r1, r2) => !(
  r2.left > r1.right ||
  r2.right < r1.left ||
  r2.top > r1.bottom ||
  r2.bottom < r1.top
);

/**
 * Test if a point is inside a rectangle (using cardinal directions).
 *
 * @param {Point} point - The point to test
 * @param {CardinalRect} rect - Rectangle with N/S/E/W bounds
 * @returns {boolean} True if point is inside rectangle
 */
const isInsideRect = ({x, y}, {N, S, E, W}) =>
  (N >= y && y >= S) && (E >= x && x >= W);

/**
 * Test if two DOM elements' bounding boxes intersect.
 *
 * Convenience wrapper around `intersectRect` using `getBoundingClientRect`.
 * Note: Avoids type assertions for performance in animation loops.
 *
 * @param {Element} e1 - First SVG or HTML element
 * @param {Element} e2 - Second SVG or HTML element
 * @returns {boolean} True if bounding boxes overlap
 */
const intersectingElts = (e1, e2) =>
  intersectRect(e1.getBoundingClientRect(), e2.getBoundingClientRect());

/**
 * Test if a point is inside a polygon using ray casting algorithm.
 *
 * Casts a horizontal ray from the point and counts edge crossings.
 * An odd count means the point is inside.
 *
 * @param {Point[]} poly - Array of points forming the polygon vertices
 * @param {Point} point - The point to test
 * @returns {boolean} True if point is inside the polygon
 *
 * @example
 * const triangle = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 5, y: 10}];
 * isPointInPoly(triangle, {x: 5, y: 5}); // true
 * isPointInPoly(triangle, {x: 0, y: 10}); // false
 */
const isPointInPoly = (poly, point) => {
  const {x, y} = point;
  const len = poly.length;
  let inside = false;

  for (let i = 0, j = len - 1; i < len; j = i++) {
    const {x: xi, y: yi} = poly[i];
    const {x: xj, y: yj} = poly[j];

    // Check if horizontal ray from point crosses this edge
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
};

// ============================================================================
// Animation Clock
// ============================================================================

/** Counter for generating unique clock IDs */
let lastClockId = 0;

/**
 * @typedef {Object} Clock
 * @property {string} clockId - Unique identifier for this clock's events (e.g., "tick0")
 * @property {function(): void} start - Start the clock ticking
 * @property {function(): void} stop - Stop the clock
 * @property {function(): void} toggle - Toggle between running and stopped
 * @property {function(): void} reset - Reset the throttle counter
 * @property {number} ticksPerSecond - Current tick rate (rolling average)
 */

/**
 * Create an animation clock that dispatches tick events via requestAnimationFrame.
 *
 * The clock dispatches CustomEvents on `window` with the clock's ID as the event type.
 * Event detail contains `{t, ticksPerSecond}` where `t` is the current timestamp.
 *
 * Features:
 * - **Throttling**: Skip frames to reduce CPU usage
 * - **Timeout**: Automatically stop after a duration
 * - **Polite mode**: Pause when page is hidden (saves battery)
 *
 * @param {number} [throttle=1] - Only dispatch every Nth frame (1 = every frame)
 * @param {number} [timeOut=0] - Auto-stop after this many ms (0 = never)
 * @param {boolean} [ticking=true] - Start immediately if true
 * @param {boolean} [polite=true] - Pause when page visibility changes
 * @param {number} [n=0] - Initial throttle counter value
 * @returns {Clock} Clock control object
 *
 * @example
 * // Create a clock that ticks ~30fps
 * const clock = clock(2); // Skip every other frame
 *
 * window.addEventListener(clock.clockId, (e) => {
 *   console.log('Tick at', e.detail.t, 'fps:', e.detail.ticksPerSecond);
 * });
 *
 * // Later: stop the clock
 * clock.stop();
 */
const clock = (throttle = 1, timeOut = 0, ticking = true, polite = true, n = 0) => {
  const clockId = 'tick' + lastClockId++;
  const startTime = Date.now();
  let ticksPerSecond = 30; // Initial estimate
  let t = startTime;

  const isTimedOut = () => timeOut > 0 && (Date.now() > startTime + timeOut);

  const tick = () => {
    if ((++n % throttle) === 0) {
      n = 0;

      const newT = Date.now();
      const msPerTick = newT - t;
      const newTps = msPerTick > 0 ? 1000 / msPerTick : ticksPerSecond;
      ticksPerSecond = (ticksPerSecond + newTps) / 2; // Rolling average
      t = newT;

      window.dispatchEvent(new CustomEvent(clockId, {
        detail: {t, ticksPerSecond}
      }));
    }

    if (ticking && !isTimedOut()) {
      window.requestAnimationFrame(tick);
    }
  };

  // Pause when page is hidden to save resources
  if (polite) {
    window.addEventListener('visibilitychange', () => {
      const wasHidden = !ticking;
      ticking = document.visibilityState === 'visible';
      if (ticking && wasHidden) tick(); // Resume
    });
  }

  if (ticking) tick();

  return {
    clockId,
    start: () => { ticking = true; tick(); },
    stop: () => { ticking = false; },
    toggle: () => {
      ticking = !ticking;
      if (ticking) {
        t = Date.now();
        tick();
      }
    },
    reset: () => { n = 0; },
    get ticksPerSecond() { return ticksPerSecond; }
  };
};


export {
  elt,
  scatter,
  gather,
  parseTransform,
  renderTransform,
  intersectRect,
  isInsideRect,
  intersectingElts,
  isPointInPoly,
  clock,
};
