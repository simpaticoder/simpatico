import {log, tryToStringify} from '/lib/simpatico.js';
import * as svg from '/lib/svg.js';

const html1 = (
  svgClass='visualize-stree',
  inspectorClass ='residue-inspector',
  colorKeyClass = 'color-key',
  rows = 10, cols = 40) => `
<div style="display: flex; gap: 10px; align-items: flex-start;">
  <svg xmlns="http://www.w3.org/2000/svg"
    class="${svgClass}"
    viewBox="0 0 ${cols} ${rows}"
    width="${cols * 20}px"
    height="${rows * 20}px"
    style="border: 1px solid gray; flex-shrink: 0;"
  >
    <g style="cursor: pointer;">
      <circle cx=".5" cy=".5" r=".48" fill="#1A4DBC" />
      <text x=".492" y=".525" dominant-baseline="central" text-anchor="middle" font-family="Arial" font-size=".5" style="pointer-events: none;">0</text>
    </g>
  </svg>
  <div style="flex: 1; min-width: 200px;">
    <p style="margin: 0 0 5px 0;">key: <span class="${colorKeyClass}"></span></p>
    <div style="border: 1px solid #ccc; padding: 10px; background: #222; color: #eee; font-family: monospace; font-size: 12px;">
      <strong>Inspector</strong>
      <pre class="${inspectorClass}" style="margin: 5px 0 0 0; white-space: pre-wrap; color: #eee;">Click on a node to inspect it.</pre>
    </div>
  </div>
</div>
`;

const classes1 = {
  svg : 'visualize-stree',
  inspector: 'residue-inspector',
  colorKey: 'color-key',
};

/**
 *
 * @param s - the stree to render
 * @param parent - the parent DOM elt; this will replace innerHTML
 * @param animate - true if we animate, false if we add all at once
 * @param classes - object that defines class names used in the HTML, svg, inspector and colorKey
 * @param html - a function that returns custom html
 */
const renderStree = (
  s,
  parent,
  animate = false,
  classes = classes1,
  html = html1
) => {

  // Calculate dimensions based on stree size
  // rows = max branchIndex + 1
  // cols = max circles in any row + padding
  const maxBranchIndex = Math.max(...s.nodes.map(n => n.branchIndex));
  const rows = maxBranchIndex + 2; // +1 for 0-indexing, +1 for padding

  // Count circles per row to find the widest row
  const circlesPerRow = Array.from({ length: maxBranchIndex + 1 }, () => 0);
  for (const node of s.nodes) {
    circlesPerRow[node.branchIndex] += 1; // the node itself
    if (node.msgs) circlesPerRow[node.branchIndex] += node.msgs.length - 1; // secondary msgs
  }
  const cols = Math.max(...circlesPerRow) + 1; // widest row + padding

  // add the html with calculated dimensions
  parent.innerHTML = html(classes.svg, classes.inspector, classes.colorKey, rows, cols);

  // Bind to elements
  const scene = svg.elt(classes.svg, parent);
  const residueOutput = svg.elt(classes.inspector, parent);
  const colorKey = svg.elt(classes.colorKey, parent);


  // Config
  const DEBUG = true;
  const dx = 1, dy = 1;
  const staticChildrenCount = scene.children.length;

  // Hide code and display color key
  hideCode(parent);
  const colors = generateColors(s);
  displayColorKey(colorKey, colors);

  // begin node render
  render(animate);

  // steady-state input - support click to inspect a node and rerender
  scene.addEventListener('click', (e) => {
    log(e);
    const target = e.target.closest('g');
    if (target && target.node) {
      const node = target.node;
      log(node.msgs);
      const {handlers, ...residue} = s.residue(node);
      residueOutput.innerText = tryToStringify({
        id: node.id,
        value: node.value,
        residue,
        parent: node.parent ? node.parent.id : 'null',
      });
    }
  });

  // remainder are support functions

  // Hide the visualization code - the two details after the parent elt. sadly I could not find a good way to do this with selectors
  function hideCode(parent=parent){
    let count = 0;
    Array.from(parent.parentElement.children).forEach(sibling => {
      if (sibling === parent) count = 2; // should only happen once
      if (sibling.tagName.toLowerCase() === 'details' && count--) sibling.removeAttribute('open'); //hide 2 details tags
    })
  }

  function generateColors(s = s){
    const colors = {
      handlers: "DodgerBlue",
      msg: 'Blue',
    };

    // See also https://gka.github.io/chroma.js/
    function* generateDarkerColor([h, s, l] = [260, 50, 80], step=5) {
      for (let i = 1; ; i++) {
        yield `hsl(${h - 10* i * step}, ${s}%, ${l - i * step}%)`;
      }
    }
    const colorGenerator = generateDarkerColor();

    // create a color key based on the handlers present in the stree
    s.nodes.forEach(node => {
      if (node.value.hasOwnProperty('handlers')){
        Object.keys(node.value.handlers).forEach(name => {
          if (name === 'log')    colors[name] = 'Coral';
          if (name === 'assert') colors[name] = 'Orange';
          if (!colors[name])     colors[name] = colorGenerator.next().value;
        });
      }
    });
    return colors;
  }

  function displayColorKey(colorKeyElt, colors = colors){
    colorKeyElt.innerHTML = Object.entries(colors).map(([key, color]) =>
      `<span style="padding: 3px;color: black; border-radius:10px;background-color: ${color}">${key}</span> `)
      .reduce((a, b) => a + b, '');
  }

  // TODO add animation support with conditional setTimeout around makeCircle
  function render(animate=false) {
    log('rendering stree with', s.nodes.length, 'nodes, maxBranchIndex', maxBranchIndex);
    // Size array by maxBranchIndex+1, not nodes.length (branchIndex can exceed node count)
    const rowAddPosition = Array.from({ length: maxBranchIndex + 1 }, () => 0);
    let x, y, color, node, node2;
    for (node of s.nodes){
      y = node.branchIndex;
      x = rowAddPosition[node.branchIndex];
      color = nodeColor(node);
      log('node', node.id, 'at', {x, y}, 'color', color);
      makeCircle(x * dx, y * dy, color, node.id, node);

      rowAddPosition[node.branchIndex] = ++x;
      // render secondary nodes
      let msgs = node.msgs ? node.msgs : [];
      // log('primary', {x, y}, color, msgs, msgs.length);

      // Skip the first msg which is the initial handler call itself, which is already rendered.
      for (let j = 1; j < msgs.length; j++) {
        node2 = {...node, value: msgs[j]}; // give the node the values of the parent to ease rendering
        const label = String.fromCharCode((j-1 % 26) + 97);
        color = nodeColor(node2);
        // log('secondary', j, {x, y}, color, node2);
        makeCircle(x * dx, y * dy, color, label, node2);
        rowAddPosition[node.branchIndex] = ++x;
      }

    }
  }


  function makeCircle (x, y, fill, label='0', node) {
    const clone = cloneLast(scene);
    clone.node = node;
    svg.scatter(clone, {x, y, text: label, fill});
    return clone;
  }

  function nodeColor(node) {
    let color;
    const v = node.value || node; // secondary nodes are bare handler calls TODO visually distinguish secondary colors
    if (v.handlers) color = colors.handlers;
    else if (v.handler) color = colors[v.handler]
    else color = colors.msg;
    return color;
  }

// Clone the last element in the svg and add it to the svg
  function cloneLast(scene) {
    const last = scene.lastElementChild;
    const clone = last.cloneNode(true);
    scene.appendChild(clone);
    return clone;
  }
}

// Render multiple strees inside parent. Each stree will have a unique wrapping div.
const renderStrees = (
  strees,
  parent,
  animate = false,
  classes = classes1,
  html = html1
) => {
  strees.forEach((stree, i) => {
    const parentElt = document.createElement('div');
    parentElt.id = `stree-${i}-render`;
    parent.appendChild(parentElt);
    renderStree(stree, parentElt, animate, classes, html);
  });
}

export {renderStree, renderStrees}
