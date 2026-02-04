---
title: STree Visualization
date: 2025-08-25
description: Visualizing the stree data structure with D3 and other tools
---

# STree Visualization

The stree is at its heart an n-ary tree of inputs (messages), mapped to an n-ary tree of outputs (residues). Between the input and output may occur a recursion where messages trigger further messages until termination. The top level message is a "world event" and the subsequent messages form a "message cascade".

## Live Examples

Here are working visualizations of strees. Each node is rendered as a circle, left to right within a branch, top to bottom for different branches. Click on a node to inspect it.

### Arithmetic Operations
```html
<div id="arithmetic-render"></div>
```
```js
import {arithmeticOps} from "./stree-examples.js";
import {fromArray, svg} from '/lib/simpatico.js';
import {renderStree} from '/lib/stree-visualization.js';

const renderParent = svg.elt('arithmetic-render');
const s = fromArray(arithmeticOps);
renderStree(s, renderParent);
```

### Trie Structure
```html
<div id="trie-render"></div>
```
```js
import {trieOps} from "./stree-examples.js";
import {fromArray, svg} from '/lib/simpatico.js';
import {renderStree} from '/lib/stree-visualization.js';

const renderParent = svg.elt('trie-render');
const s = fromArray(trieOps, (a,b) => ({a: a.a + b.a}));
renderStree(s, renderParent);
```

### Object Operations
```html
<div id="obj-render"></div>
```
```js
import {objOps} from "./stree-examples.js";
import {fromArray, svg} from '/lib/simpatico.js';
import {renderStree} from '/lib/stree-visualization.js';

const renderParent = svg.elt('obj-render');
const s = fromArray(objOps);
renderStree(s, renderParent);
```

## D3 Inspiration
[D3](https://d3js.org/) is great at visualizing trees and graphs. For example:

- [Standard Tidy Tree](https://observablehq.com/@d3/tree-component) - Classic hierarchical node-link diagram
- [Radial Tidy Tree](https://observablehq.com/@d3/radial-tree) - Circular layout with depth-as-radius encoding
- [Flame Graph](https://github.com/spiermar/d3-flame-graph) - Stack trace visualization for performance profiling
- [Family Tree (dTree)](https://github.com/ErikGartner/dTree) - Genealogy chart with marriage nodes and search
- [Collapsible Org Chart](https://observablehq.com/@d3/collapsible-tree) - Interactive corporate hierarchy with toggle nodes
- [Packed Circle Hierarchy](https://observablehq.com/@d3/packed-circle) - Nested circles representing hierarchical depth
- [Force-Directed Graph](https://observablehq.com/@d3/force-directed-graph) - Physics-based network visualization
- [Zoomable Treemap](https://observablehq.com/@d3/zoomable-treemap) - Very nice, but loses the time-dependency

## Design Notes

The visualization renders nodes left-to-right within each branch, and branches top-to-bottom. Each node's `branchIndex` determines its row (y position), and nodes are placed sequentially along the x-axis within their branch.

When a node triggers handler calls (a "message cascade"), those secondary messages are rendered as smaller labeled circles (a, b, c...) following the primary node.


## Implementation

The visualization code lives in `/lib/stree-visualization.js`. It uses a "clone and scatter" approach:

1. An SVG template with a single circle/text group is created
2. For each node, the template is cloned and positioned using `svg.scatter()`
3. Position is determined by `branchIndex` (y) and sequential order within branch (x)
4. Colors are assigned based on node type (handlers, messages, etc.)

See the [source code](/lib/stree-visualization.js) for details.
