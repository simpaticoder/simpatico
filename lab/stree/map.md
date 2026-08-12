An object `{}` can link to another object called it's parent:`{parent:{}}`.
Many objects can share a parent `let a={}, b={parent:a}, c={parent:a}`.
It is convenient to introduce children as well, for navigation `let a={children:[b,c]}`
Such a structure is useful for representing related sequences of input.
We can assign an index to each object that represent the order in which it was added to the tree, `let a={id:0, children:[b,c]}, b={id:1, parent:a}, c={id:2, parent:a}`.
This implies an `add()` operation which is called synchronously, in a single sequence over the lifetime of the tree.

Here is a simple functional implmentation using a closure for the `id` field, and giving every node a parent and children field, even if null or the empty array:
```js
let id = 0;
function add(value, parent = null){
    const node = {id: id++, value, parent, children:[]};
    parent?.children.push(node);
    return node;
}

const root = add(0);
const a = add(1, root);
const b = add(2, a);
const c = add(3, a);
```

We can add operations to the node to make it navigable:
```js
export class Node {
  constructor(value, parent = null) {
    this.value = value;
    this.parent = parent;
    this.children = [];
    parent?.children.push(this);
  }

  add(value) {
    return new Node(value, this);
  }

  ancestors() {
    const result = [];
    let cur = this.parent;
    while (cur) { 
        result.push(cur); 
        cur = cur.parent; }
    return result;
  }

  path() {
    return [...this.ancestors().reverse(), this];
  }

  /**
   * Walk the tree rooted at `root` in BFS order and stamp `.branchIndex`
   * onto every node — mirroring d3.hierarchy(root) as a post-construction
   * enrichment step rather than baking it into the constructor.
   *
   * Rule (same as stree.js): a node's first child continues the parent's
   * branch; every subsequent child starts a new branch.
   *
   * Returns the root so calls can be chained: Node.assignBranchIndex(root).
   */
  static assignBranchIndex(root) {
    let nextBranch = 0;
    const queue = [root];
    while (queue.length) {
      const n = queue.shift();
      if (!n.parent)                       n.branchIndex = 0;
      else if (n.parent.children[0] === n) n.branchIndex = n.parent.branchIndex;
      else                                 n.branchIndex = ++nextBranch;
      n.children.forEach(c => queue.push(c));
    }
    return root;
  }
}

const root = new Node(0);
const a = root.add(1);
const b = a.add(2);
const c = a.add(3);

assertEquals([root, a, b], b.path());
assertEquals([root, a, c], c.path());
assertEquals([a, root],    c.ancestors());
assertEquals(0, root.ancestors().length);
assertEquals(2, a.children.length);

Node.assignBranchIndex(root);
assertEquals(0, root.branchIndex); // root starts branch 0
assertEquals(0, a.branchIndex);    // first child continues branch 0
assertEquals(0, b.branchIndex);    // first child continues branch 0
assertEquals(1, c.branchIndex);    // second child of a → new branch 1
```
Such a tree is called a [directed acyclic graph](https://en.wikipedia.org/wiki/Directed_acyclic_graph) or DAG.

# Visualization

We can visualize the tree using d3. First, a hand-rolled render that walks our `Node` class directly — no d3 layout, just `d3.select` for DOM manipulation:

```html
<svg id="manual-tree" width="300" height="160"></svg>
```
```js
import * as d3 from '/lib/d3.esm.js';

// Re-build the same tree from above
const root = new Node(0);
const a = root.add(1);
const b = a.add(2);
const c = a.add(3);
const d = b.add(4);

// Assign (x, y) positions by hand: depth → y, sibling order → x
const W = 300, H = 160, R = 18;
const positions = new Map();
function layout(node, depth, siblingIndex, siblingCount) {
  const x = W * (siblingIndex + 1) / (siblingCount + 1);
  const y = 30 + depth * 50;
  positions.set(node, {x, y});
  node.children.forEach((child, i) => layout(child, depth + 1, i, node.children.length));
}
layout(root, 0, 0, 1);

const svg = d3.select('#manual-tree');

// Draw edges first (so circles sit on top)
function drawEdges(node) {
  const {x: px, y: py} = positions.get(node);
  node.children.forEach(child => {
    const {x: cx, y: cy} = positions.get(child);
    svg.append('line')
      .attr('x1', px).attr('y1', py)
      .attr('x2', cx).attr('y2', cy)
      .attr('stroke', '#888').attr('stroke-width', 1.5);
    drawEdges(child);
  });
}
drawEdges(root);

// Draw nodes
function drawNodes(node) {
  const {x, y} = positions.get(node);
  const g = svg.append('g').attr('transform', `translate(${x},${y})`);
  g.append('circle').attr('r', R).attr('fill', '#4a90d9').attr('stroke', '#fff').attr('stroke-width', 2);
  g.append('text').text(node.value)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .attr('fill', '#fff').attr('font-size', 13).attr('font-family', 'sans-serif');
  node.children.forEach(drawNodes);
}
drawNodes(root);
```

Now the same tree rendered with `d3.hierarchy` + `d3.tree` layout. Note that `d3.hierarchy` expects `children` on each node — which our `Node` class already provides. The key difference: d3 computes `x`/`y` for us via a Reingold–Tilford algorithm, and wraps each node in a `HierarchyNode` with extra properties like `depth`, `height`, and `descendants()`.

```html
<svg id="d3-tree" width="300" height="160"></svg>
```
```js
import * as d3 from '/lib/d3.esm.js';

const root2 = new Node(0);
const a2 = root2.add(1);
const b2 = a2.add(2);
const c2 = a2.add(3);
const d2 = b2.add(4);

// d3.hierarchy wraps our Node tree; it reads .children automatically
const hier = d3.hierarchy(root2);

// d3.tree computes x/y layout within a [width, height] box
const treeLayout = d3.tree().size([260, 120]);
treeLayout(hier);  // mutates hier nodes in-place, adding .x and .y

const svg2 = d3.select('#d3-tree');
const g = svg2.append('g').attr('transform', 'translate(20,20)');

// Edges via d3 link generator
g.selectAll('line')
  .data(hier.links())
  .join('line')
    .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
    .attr('stroke', '#888').attr('stroke-width', 1.5);

// Nodes
const node = g.selectAll('g')
  .data(hier.descendants())
  .join('g')
    .attr('transform', d => `translate(${d.x},${d.y})`);

node.append('circle').attr('r', 18)
  .attr('fill', '#e07b39').attr('stroke', '#fff').attr('stroke-width', 2);

node.append('text').text(d => d.data.value)
  .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
  .attr('fill', '#fff').attr('font-size', 13).attr('font-family', 'sans-serif');
```

A third layout follows the same logic as `formatSTree`: **y = branchIndex, x = insertion order within the branch**. Branches are horizontal lanes; a node whose parent is on a different branch gets a diagonal edge back to that fork point. This matches how `stree` actually grows — time flows left-to-right, branching flows top-to-bottom.

```css
.branch-tree-wrap { display: flex; align-items: stretch; width: 100%; }
.branch-tree      { flex: 0 0 80%; aspect-ratio: 2 / 1; display: block; }
.branch-inspector { flex: 0 0 20%; display: block; }
```
```html
<div class="branch-tree-wrap">
  <svg id="branch-tree"     class="branch-tree"></svg>
  <svg id="branch-inspector" class="branch-inspector"></svg>
</div>
```
```js
import * as d3 from '/lib/d3.esm.js';

/**
 * Render a Node tree into an SVG element using the formatSTree layout:
 *   x = insertion order within branch, y = branchIndex.
 * The SVG viewBox is computed from the tree's extents so the drawing
 * fills whatever size the element is given via CSS.
 *
 * @param {Node} root  - root of the Node tree to render
 * @param {SVGElement} svgEl - the <svg> DOM element to draw into
 * @param {object} [opts]
 * @param {number} [opts.STEP=30]  - px between node centres
 * @param {number} [opts.PAD=20]   - px padding around the drawing
 * @param {number} [opts.R=12]     - node circle radius
 * @param {string} [opts.fill='#5a9e6f']         - node fill colour
 * @param {string} [opts.colorNear='#f07f00']     - highlight colour for the hovered node (near)
 * @param {string} [opts.colorFar='#1a5fa8']      - highlight colour for the root ancestor (far)
 * @param {SVGElement|null} [opts.inspectorSvgEl=null] - sibling SVG to render hovered node value into
 * @param {number} [opts.fontSize]                - label font size (defaults to R * 1.1)
 */
export function renderBranchTree(root, svgEl, opts = {}) {
  const {
    STEP = 30, PAD = 20, R = 12,
    fill = '#5a9e6f',
    colorNear = '#f07f00',
    colorFar  = '#1a5fa8',
    inspectorSvgEl = null,
    fontSize,
  } = opts;
  const labelSize = fontSize ?? R * 1.1;

  // 1. Stamp branchIndex onto every node (BFS, insertion order)
  Node.assignBranchIndex(root);

  // 2. Collect all nodes in BFS order for layout
  const allNodes = [];
  const queue = [root];
  while (queue.length) {
    const n = queue.shift();
    allNodes.push(n);
    n.children.forEach(c => queue.push(c));
  }

  // 3. Group by branchIndex to find each node's slot (x position)
  const branchMap = new Map();
  allNodes.forEach(n => {
    if (!branchMap.has(n.branchIndex)) branchMap.set(n.branchIndex, []);
    branchMap.get(n.branchIndex).push(n);
  });

  // 4. Compute pixel positions
  allNodes.forEach(n => {
    const slot = branchMap.get(n.branchIndex).indexOf(n);
    n.px = PAD + slot * STEP;
    n.py = PAD + n.branchIndex * STEP;
  });

  // 5. Size the viewBox to fit the content exactly
  const maxX = Math.max(...allNodes.map(n => n.px)) + PAD;
  const maxY = Math.max(...allNodes.map(n => n.py)) + PAD;
  const svg = d3.select(svgEl)
    .attr('viewBox', `0 0 ${maxX} ${maxY}`)
    .attr('preserveAspectRatio', 'xMinYMin meet');

  // 6. Draw edges (parent → child)
  allNodes.filter(n => n.parent).forEach(n => {
    svg.append('line')
      .attr('x1', n.parent.px).attr('y1', n.parent.py)
      .attr('x2', n.px)        .attr('y2', n.py)
      .attr('stroke', '#888').attr('stroke-width', 1.5);
  });

  // 7. Draw nodes, keeping a map from Node → <g> for hover lookups
  const groupMap = new Map();
  const groups = svg.selectAll('g')
    .data(allNodes)
    .join('g')
    .attr('transform', n => `translate(${n.px},${n.py})`);

  groups.each(function(n) { groupMap.set(n, this); });

  groups.append('circle').attr('r', R)
    .attr('fill', fill).attr('stroke', '#fff').attr('stroke-width', 2);

  groups.append('text').text(n => typeof n.value === 'object' && n.value !== null ? (n.value.id ?? '?') : n.value)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .attr('fill', '#fff').attr('font-size', labelSize).attr('font-family', 'sans-serif');

  // 8. Hover: colour hovered node + ancestors by distance; render value in inspector SVG.
  //    distance 0 (selected) → colorNear (orange)
  //    distance max (root)   → colorFar  (blue)
  const insp = inspectorSvgEl ? d3.select(inspectorSvgEl) : null;

  // Give the inspector a fixed viewBox and dark background — always visible.
  const inspW = 100, inspH = 200, inspPad = 10, inspLineH = 16;
  if (insp) {
    insp.attr('viewBox', `0 0 ${inspW} ${inspH}`)
        .attr('preserveAspectRatio', 'xMinYMin meet');
    insp.append('rect')
        .attr('width', inspW).attr('height', inspH)
        .attr('fill', '#1a1a2e').attr('rx', 4);
  }

  function renderInspector(value) {
    if (!insp) return;
    insp.selectAll('text').remove();
    const lines = typeof value === 'object' && value !== null
      ? Object.entries(value).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      : [String(value)];
    lines.forEach((line, i) => {
      insp.append('text')
        .attr('x', inspPad).attr('y', inspPad + i * inspLineH + 11)
        .attr('fill', '#e8e8f0').attr('font-size', 11)
        .attr('font-family', 'monospace')
        .text(line);
    });
  }

  groups
    .on('mouseenter', function(event, n) {
      const ancestors = n.ancestors();   // [parent, grandparent, …, root]
      const maxDist = Math.max(ancestors.length, 1);
      const interp = d3.interpolateRgb(colorFar, colorNear);
      const colorAt = dist => interp(1 - dist / maxDist);

      d3.select(groupMap.get(n)).select('circle').attr('fill', colorAt(0));
      ancestors.forEach((anc, i) => {
        d3.select(groupMap.get(anc)).select('circle').attr('fill', colorAt(i + 1));
      });

      renderInspector(n.value);
    })
    .on('mouseleave', function() {
      groups.select('circle').attr('fill', fill);
      if (insp) insp.selectAll('text').remove();  // keep background rect
    });
}

// --- demo: mix of plain numbers and objects to exercise the inspector ---
// branch 0:  0 - 1 - 2 - 3 - 4 - 5 - 6
//                ↘               ↘
// branch 1:      7 - 8 - 9       10- 11
//                    ↘       ↘
// branch 2:          12- 13  14- 15- 16
//                        ↘
// branch 3:              17- 18
const root3 = new Node({id: 0, type: 'root'});
// branch 0 spine
const e = root3.add(1).add(2).add(3).add(4).add(5);
              e.add(6);
// branch 1: fork off node 1 (a)
const h = root3.children[0].add({id: 7, tag: 'fork'}).add(8);
              h.add(9);
// branch 2: fork off node 5 (e)
const j = e.add({id: 10, tag: 'fork'});
              j.add(11);
const m = h.add(12).add(13);
const n = j.add(14).add(15).add(16);
// branch 3: fork off node 13 (m)
m.add({id: 17, tag: 'fork'}).add(18);

renderBranchTree(root3, document.getElementById('branch-tree'), {
  inspectorSvgEl: document.getElementById('branch-inspector'),
});
```

# Reduction

Two trees with the same shape sit side by side. The left tree holds plain string values. The right tree holds the **reduction of each node's ancestor path** — every node's value is the concatenation of all its ancestors' values followed by its own. Hovering a node in either tree updates the shared inspector on the right.

```css
.side-by-side { display: flex; gap: 1%; width: 100%; }
.side-by-side .branch-tree { flex: 0 0 42%; }
.side-by-side .branch-inspector { flex: 0 0 14%; display: block; }
```
```html
<div class="side-by-side">
  <svg id="values-tree"    class="branch-tree"></svg>
  <svg id="reduction-tree" class="branch-tree"></svg>
  <svg id="reduction-inspector" class="branch-inspector"></svg>
</div>
```
```js
const inspEl = document.getElementById('reduction-inspector');

// Build the values tree with readable word fragments as labels.
const vRoot = new Node('do');
const vA = vRoot.add('re');
      vA.add('mi').add('fa');
const vD = vA.add('sol');
      vD.add('la').add('si');
      vD.add('ti');
const vH = vRoot.add('ut');
      vH.add('ra').add('ka').add('ma');
      vH.add('na');

renderBranchTree(vRoot, document.getElementById('values-tree'), { inspectorSvgEl: inspEl });

// Build the reduction tree: same topology, each node's value is the
// concatenation of all ancestor values + its own (no separator).
const rRoot = new Node(vRoot.value);
vRoot._dest = rRoot;
function reduce(src) {
  src.children.forEach(child => {
    const childNode = src._dest.add(src._dest.value + child.value);
    child._dest = childNode;
    reduce(child);
  });
}
reduce(vRoot);

renderBranchTree(rRoot, document.getElementById('reduction-tree'), {
  inspectorSvgEl: inspEl,
  fontSize: 7,
});
```

# Combine reduction

The same side-by-side layout, but the reducer is `combine()`. Each node holds a plain object. The right tree shows the accumulated object at each node — properties added deeper in the tree override or extend those from ancestors, exactly as `combine` does for objects.

```css
.combine-wrap { display: flex; gap: 1%; width: 100%; }
.combine-wrap .branch-tree     { flex: 0 0 42%; }
.combine-wrap .branch-inspector { flex: 0 0 14%; display: block; }
```
```html
<div class="combine-wrap">
  <svg id="combine-values-tree"    class="branch-tree"></svg>
  <svg id="combine-reduction-tree" class="branch-tree"></svg>
  <svg id="combine-inspector"      class="branch-inspector"></svg>
</div>
```
```js
import { combine } from '/lib/combine.js';

const cInspEl = document.getElementById('combine-inspector');

// Values tree: each node is a plain object patch.
// Reading down any path you can see how properties accumulate and override.
const cRoot = new Node({name: 'alice', age: 20});
const cB = cRoot.add({name: 'bob',     age: 30});
           cRoot.add({name: 'charlie', age: 40});
const cD = cB.add({role: 'admin'});
           cB.add({role: 'guest'});
           cD.add({age: 99});
           cD.add({name: 'dave'});

renderBranchTree(cRoot, document.getElementById('combine-values-tree'), {
  inspectorSvgEl: cInspEl,
});

// Reduction tree: same topology, each node's value is combine() folded
// over the path from root to that node.
const crRoot = new Node(cRoot.value);
cRoot._cdest = crRoot;
function combineReduce(src) {
  src.children.forEach(child => {
    const reduced = combine(src._cdest.value, child.value);
    const childNode = src._cdest.add(reduced);
    child._cdest = childNode;
    combineReduce(child);
  });
}
combineReduce(cRoot);

renderBranchTree(crRoot, document.getElementById('combine-reduction-tree'), {
  inspectorSvgEl: cInspEl,
  fontSize: 7,
});
```
