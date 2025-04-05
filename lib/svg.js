import {as, getType, cast, hasProp} from './core.js';


/**
 * Scatter the entries of obj onto the attributes of elt. There is no return because it is pure side effect.
 * If the target is a 'g', then the [x,y,rotate,scale] entries are used to create a valid transform attribute value.
 * Any of [x,y,rotate,scale] are deleted from obj so they don't scatter to g itself.
 *
 * If the target is a 'text' then we allow
 *
 * @param elt The target HTML element. Usually a g elt with a transform attribute containing 1 or 2 shapes.
 * @param obj The source javascript object, which this code will modify!
 */
const scatter = (elt, obj) => {
  as.elt(elt) && as.obj(obj);
  // Special treatment for circles: treat x and y as cx cy if not explicitly specified.
  if (elt.tagName === "circle") {
    if (hasProp(obj, 'x') && !hasProp(obj, 'cx')) obj.cx= obj.x;
    if (hasProp(obj, 'y') && !hasProp(obj, 'cy')) obj.cy= obj.y;
  }
  // If the target is a 'g', then build up the transform string from sub-clauses and remove those keys.
  if (elt.tagName === "g" && !hasProp(obj, 'transform')){
    const clauses = [];
    // Convert x, y into a translate clause
    if (hasProp(obj, 'x') && hasProp(obj, 'y') ){
      clauses.push(`translate(${obj.x}, ${obj.y})`);
      delete obj.x; delete obj.y;
    }
    if (hasProp(obj,'rotate')){
      clauses.push(`rotate(${obj.rotate})`);
      delete obj.rotate;
    }
    if (hasProp(obj,'scale')){
      clauses.push(`scale(${obj.scale})`);
      delete obj.scale;
    }
    elt.setAttribute("transform", clauses.join(''));
  }

  // Setting text value assumes one text elt somewhere beneath the g
  if (hasProp(obj, 'text')){
    const textElt = elt.querySelector('text');
    if (textElt) {
      textElt.textContent = obj.text;
    }
    delete obj.text;
  }

  if (
    hasProp(obj, 'fill') &&
    elt.tagName === "g" &&
    elt.children.length > 0 &&
    elt.children[0].tagName !== "g"
  ){
    elt.children[0].setAttribute('fill', obj.fill);
    delete obj.fill;
  }


  // Scatter the rest! This is why we deleted entries earlier, btw.
  for (let [key, value] of Object.entries(obj)){
    let old;
    //handle data- elts
    if (key.startsWith('data-')){
      key = key.substring(5);
      old = elt[key];
      if (old !== value){
        elt[key] = value;
      }
    } else {
      old = elt.getAttribute(key);
      if (value + '' !== old){
        elt.setAttribute(key, value);
      }
    }
  }
  return elt;
};

/**
 * Gather the attributes of an element that match the keys present in an object, overwriting the values in
 * the object. This method correctly casts numbers and booleans from strings.
 *
 * @param elt The source HTML element
 * @param obj The target javascript object
 * @returns {{}}
 */
const gather = (elt, obj) => {
  as.elt(elt) && as.obj(obj);
  for (const key in obj){
    if (!elt.hasAttribute(key)) continue;
    const val = elt.getAttribute(key);

    // try to cast into the type requested by the object
    const type = getType(obj[key]);
    if (type === 'number')
      obj[key] = parseLeadingNumber(val);
    else
      obj[key] = cast(type, val);
  }
  return obj;
};

function parseLeadingNumber(str) {
  const match = str.match(/^\d+(\.\d+)?/);
  if (match) {
    return parseFloat(match[0]);
  }
  return str;
}

/**
 * Parses the transform attributes from an SVG element's transform list.
 *
 * @param {SVGGraphicsElement} elt - An SVG element with transform attribute(s)
 * @returns {Object} An object containing the parsed transform components:
 *   @returns {Object} [translate] - Translation values if present
 *     @returns {number} translate.x - X-axis translation
 *     @returns {number} translate.y - Y-axis translation
 *   @returns {Object} [scale] - Scaling values if present
 *     @returns {number} scale.x - X-axis scaling factor
 *     @returns {number} scale.y - Y-axis scaling factor
 *   @returns {Object} [rotate] - Rotation values if present
 *     @returns {number} rotate.angle - Rotation angle in degrees
 *     @returns {number} [rotate.x] - X-coordinate of rotation center (if specified)
 *     @returns {number} [rotate.y] - Y-coordinate of rotation center (if specified)
 *   @returns {number} [skewX] - Horizontal skew angle in degrees if present
 *   @returns {number} [skewY] - Vertical skew angle in degrees if present
 *   @returns {Object} [matrix] - Raw matrix values if a matrix transform is present
 *     @returns {number} matrix.a - Scale X
 *     @returns {number} matrix.b - Skew Y
 *     @returns {number} matrix.c - Skew X
 *     @returns {number} matrix.d - Scale Y
 *     @returns {number} matrix.e - Translate X
 *     @returns {number} matrix.f - Translate Y
 *
 * @example
 * // For an SVG element with transform="translate(10, 20) scale(2, 3) rotate(45)"
 * const transformData = parseTransform(svgElement);
 * // Returns: {
 * //   translate: { x: 10, y: 20 },
 * //   scale: { x: 2, y: 3 },
 * //   rotate: { angle: 45 }
 * // }
 */
const parseTransform = elt => {
  const result = {};
  const transformList = elt.transform.baseVal;

  for (let i = 0; i < transformList.numberOfItems; i++) {
    const transform = transformList.getItem(i);
    const m = transform.matrix;

    switch (transform.type) {
      case SVGTransform.SVG_TRANSFORM_TRANSLATE:
        result.translate = { x: m.e, y: m.f };
        break;

      case SVGTransform.SVG_TRANSFORM_SCALE:
        result.scale = { x: m.a, y: m.d };
        break;

      case SVGTransform.SVG_TRANSFORM_ROTATE:
        if (transform.angle !== 0) {
          // For rotate(angle, x, y) form, we need to extract the rotation center
          const rotateX = transform.rotateX || 0;
          const rotateY = transform.rotateY || 0;
          result.rotate = {
            angle: transform.angle,
            x: rotateX,
            y: rotateY
          };
        }
        break;

      case SVGTransform.SVG_TRANSFORM_SKEWX:
        // SkewX is represented by m.c in the matrix
        result.skewX = Math.atan(m.c) * (180 / Math.PI);
        break;

      case SVGTransform.SVG_TRANSFORM_SKEWY:
        // SkewY is represented by m.b in the matrix
        result.skewY = Math.atan(m.b) * (180 / Math.PI);
        break;

      case SVGTransform.SVG_TRANSFORM_MATRIX:
        // Store the full matrix values for a custom matrix transform
        result.matrix = {
          a: m.a, b: m.b, c: m.c,
          d: m.d, e: m.e, f: m.f
        };
        break;

      default:
        console.warn(`Unhandled transform type: ${transform.type}`);
    }
  }

  return result;
};

/**
 * Creates a string value for an SVG transform attribute from an object representation.
 *
 * @param {Object} obj - Object containing transform components
 *   @param {Object} [obj.translate] - Translation values
 *     @param {number} obj.translate.x - X-axis translation
 *     @param {number} obj.translate.y - Y-axis translation
 *   @param {Object} [obj.scale] - Scaling values
 *     @param {number} obj.scale.x - X-axis scaling factor
 *     @param {number} obj.scale.y - Y-axis scaling factor
 *   @param {Object} [obj.rotate] - Rotation values
 *     @param {number} obj.rotate.angle - Rotation angle in degrees
 *     @param {number} [obj.rotate.x] - X-coordinate of rotation center
 *     @param {number} [obj.rotate.y] - Y-coordinate of rotation center
 *   @param {number} [obj.skewX] - Horizontal skew angle in degrees
 *   @param {number} [obj.skewY] - Vertical skew angle in degrees
 *   @param {Object} [obj.matrix] - Raw matrix values
 *     @param {number} obj.matrix.a - Scale X
 *     @param {number} obj.matrix.b - Skew Y
 *     @param {number} obj.matrix.c - Skew X
 *     @param {number} obj.matrix.d - Scale Y
 *     @param {number} obj.matrix.e - Translate X
 *     @param {number} obj.matrix.f - Translate Y
 * @returns {string} - SVG transform attribute string (e.g., "translate(10,20) scale(2,3)")
 *
 * @example
 * const transformObj = {
 *   translate: { x: 10, y: 20 },
 *   scale: { x: 2, y: 3 },
 *   rotate: { angle: 45, x: 100, y: 100 }
 * };
 * renderTransform(transformObj);
 * // Returns: "translate(10,20) scale(2,3) rotate(45,100,100)"
 */
const renderTransform = obj => {
  const parts = [];

  if (obj.translate) {
    parts.push(`translate(${obj.translate.x},${obj.translate.y})`);
  }

  if (obj.scale) {
    parts.push(`scale(${obj.scale.x},${obj.scale.y})`);
  }

  if (obj.rotate) {
    // Handle both simple rotation and rotation around a point
    if (obj.rotate.x !== undefined && obj.rotate.y !== undefined) {
      parts.push(`rotate(${obj.rotate.angle},${obj.rotate.x},${obj.rotate.y})`);
    } else {
      parts.push(`rotate(${obj.rotate.angle})`);
    }
  }

  if (obj.skewX !== undefined) {
    parts.push(`skewX(${obj.skewX})`);
  }

  if (obj.skewY !== undefined) {
    parts.push(`skewY(${obj.skewY})`);
  }

  if (obj.matrix) {
    const { a, b, c, d, e, f } = obj.matrix;
    parts.push(`matrix(${a},${b},${c},${d},${e},${f})`);
  }

  return parts.join(' ');
};

/**
 * Given two rectangles in the form {top:a, bottom:b, left: c, right: d} return true if they intersect.
 *
 * @param r1 {{top:number, bottom:number, left: number, right: number}}
 * @param r2 {{top:number, bottom:number, left: number, right: number}}
 * @returns {boolean} true if they intersect
 */
const intersectRect = (r1, r2) => !(
    r2.left   > r1.right  ||
    r2.right  < r1.left   ||
    r2.top    > r1.bottom ||
    r2.bottom < r1.top
  );

const isInsideRec = ({x, y}, {N, S, E, W}) => (N >= y && y >= S) && (E >= x && x >= W);

/**
 * Compute whether the bounding boxes of two elements intersect.
 * Note that type assertions would be correct, but slow down this code which tends to be called very frequently
 * in simulations and animations.
 *
 * @param e1 An SVG or HTML element.
 * @param e2 Another SVG or HTML element.
 * @returns {boolean} True if the elements bounding rectangle intersect, false otherwise.
 */
const intersectingElts =  (e1, e2) => intersectRect(e1.getBoundingClientRect(), e2.getBoundingClientRect());

/**
 * Compute whether the given point is contained within the list of points. This function has more than
 * a little voodoo.
 *
 * @param poly A list of points in {x,y} format, e.g. [{x:1,y:3},{x:0,y:-7},{x:23,y:-10}]
 * @param point An object representation of a point like {x:1, y:3}
 * @returns {boolean} True if the point is contained within the polygon formed by the list of points.
 */
const isPointInPoly = (poly, point) => {
  const {x,y} = point;
  const len = poly.length;
  let i = -1, j = len -1;
  for(; ++i < len; j = i){
    const {x:xi, y:yi} = poly[i];
    const {x:xj, y:yj} = poly[j];
    if ((
      (yi <= y && y < yj) ||  // y sits between two adjacent y's of the poly
      (yj <= y && y < yi)
    ) && (x <                 // x is less than...some mysterious number!
      xi + (xj - xi) * (y - yi) / (yj - yi)
    )) return true;
  }
  return false;
}


let lastClockId = 0;
/**
 *  A clock that ticks at the RAF rate, and dispatches a global 'tick' event with a timestamp.
 *  The clock can be throttled, and can be polite by disabling ticks when the page is not visible.
 *  The clock can be stopped and restarted and reset to zero.
 *
 *  The event looks like  CustomEvent(clockId, {detail: {t, ticksPerSecond})
 *  where clockId looks like "tickN" where N is a module-scoped counter.
 *  t is the current time from Date.now() - ms since the epoch, can turn into a date with new Date(timestamp), etc.
 *  ticksPerSecond gives you a sense of what your throttle is doing.
 *  On my machine I manually tuned it to around 30tps with a throttle of 5 - but it natively goes to 160tps.
 *
 * @param throttle factor to throttle "native speed" requestAnimationFrame pump.
 * @param timeOut
 * @param ticking true to start the clock ticking, false otherwise. (default true)
 * @param polite true to stop ticking on visibility change (default true)
 * @param n Not sure why you'd ever set this - it's the starting position of the counter used to compute throttle.
 * @returns {{stop: stop, start: start, reset: reset, n: number}}
 */
const clock = (throttle = 1, timeOut = 0, ticking = true, polite = true, n = 0) => {
  const clockId = 'tick' + lastClockId++;

  const start = Date.now();
  let ticksPerSecond = 30; // a guess
  let t = start;
  const isTimedOut = (t2=Date.now(), t1=start) => (timeOut > 0) && (t2 > t1 + timeOut);

  // This is the heart of the clock. It is a recursive function that calls itself at the RAF rate.
  const tick = () => {
    if ((++n % throttle) === 0) {
      n = 0; // may as well keep it small
      // Get the newT and perform some cheap calculations to track ticks per second.
      const newT = Date.now();
      const msPerTick = newT - t;
      const newTicksPerSecond = msPerTick > 0 ? 1000 / msPerTick : 1;
      ticksPerSecond = (ticksPerSecond + newTicksPerSecond) / 2;

      t = newT;

      // This line is particularly important, since it defines the payload of the event.
      const event = new CustomEvent(clockId, {detail: {t, ticksPerSecond}});
      window.dispatchEvent(event);
    }
    if (ticking && !isTimedOut(t)) window.requestAnimationFrame(tick);
  };


  if (polite) {
    // Disable ticks in the background, useful because websockets will keep the page alive.
    window.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      const hidden = document.visibilityState === 'hidden';
      if (!(visible || hidden)) throw 'invalid visibility state ' + document.visibilityState;
      ticking = visible;
    });
  }

  if (ticking){
    tick();
  }
  return {
    clockId,
    start: () => {ticking = true; tick()},
    stop:  () => {ticking = false},
    toggle: () => {
      ticking = !ticking;
      if (ticking) {
        tick();
        t = Date.now();
      }
      console.log('svg.js:clock().toggle()', 'clockId', clockId, 'ticking', ticking, 't', new Date(t).toLocaleTimeString(), 'n', n, 'ticksPerSecond', ticksPerSecond);
    },
    reset: () => {n = 0},
    ticksPerSecond,
  }
}

export {
  scatter, gather,
  parseTransform, renderTransform,
  intersectRect, isInsideRec, intersectingElts, isPointInPoly,
  clock,
};

