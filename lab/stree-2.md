The core of an s-tree is an narry tree with mutation operation `add` at least a `path` operation and a be some value

```js
class stree {
  constructor(value, parent = null, reducer = (acc, n) => n, minimizeResidues = true) {
    this.value = value;
    this.parent = parent;
    this.children = [];
    this.reducer = reducer;
    this.minimizeResidues = minimizeResidues;
    this.residue = this.computeResidue();
  }
  
  computeResidue(){
      const {residue, reducer, parent, value, minimizeResidues} = this;
      if ( is.exists(residue)) return residue;
      if (!is.exists(parent))  return reducer(value);
      
      let result = null;
      if (is.exists(parent.residue)){
          result = reducer(parent.residue, value);
          if(minimizeResidues && !parent.children.length > 0){
              delete parent.residue;
          }
      } else {
          result = this.path().reduce(reducer);
      }
      return result;
  }

  add(val) {
    const child = new stree(val, this, this.reducer, this.minimizeResidues);
    this.children.push(child);
    return child;
  }

  // Returns array of values from root to this node
  path() {
    let curr = this;
    const result = [];
    while (curr) {
      result.unshift(curr.value);
      curr = curr.parent;
    }
    return result;
  }

  // Depth-First Traversal: calls fn(node) for each node
  depthFirst(fn) {
    fn(this);
    for (const child of this.children) {
      child.depthFirst(fn);
    }
  }

  // Breadth-First Traversal: calls fn(node) level by level
  breadthFirst(fn) {
    const queue = [this];
    while (queue.length) {
      const node = queue.shift();
      fn(node);
      queue.push(...node.children);
    }
  }
}
window.stree = stree;
```
```js
let a = {a:1};
window.a = a;
let path = new stree(a).add(a).add(a).path();
as.equals([a,a,a], path);
```
Create a tree by adding more than one child to a node

```js
let root = new stree(a);
let b1 = root.add(a).add(a);
let b2 = root.add(a);

as.equals([a], root.path())
as.equals([a,a,a], b1.path())
as.equals([a,a], b2.path())
```

We can also define the classic traversals, depth first and breadth first, and use them to map to residues "from the outside":

```js
let b = {};
let root = new stree(a);
let b1 = root.add(b).add(a);
let b2 = root.add(a).add(b).add(a);

let count = (acc, curr, idx, arr) => acc + 1;
let addResidues = node => node.residue = node.path().reduce(count, 0);
root.depthFirst(addResidues);
as.equals(1, root.residue);
as.equals(3, b1.residue);
as.equals(4, b2.residue);

root.breadthFirst(addResidues);
as.equals(1, root.residue);
as.equals(3, b1.residue);
as.equals(4, b2.residue);
```

This is the simplest model of an stree. It is a useful behavioral model but there are two optimizations we can use to save time and space. The first is to modify `add()` to compute a new residue using the parent residue (using space to save time). The second is to store residues only at the branch tips, saving space. A branch tip is a node without children. Note that if creating a new branch we will have to fully recompute the parent residue, complicating the optimization. 

```js
let count = (acc, curr, idx, arr) => is.obj(acc) ? 1 : acc + 1;
let b = {b:2};
let root = new stree(a, null, count, true);
let b1 = root.add(b);
let b2 = root.add(a);

root.depthFirst(n => log(n.path(), n.residue, n=== b2));

as.equals(undefined, root.residue);
as.equals(3, b1.residue);
as.equals(4, b2.residue);


```