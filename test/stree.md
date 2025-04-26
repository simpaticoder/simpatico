# STree

Simpatico Tree, Summation Tree, or STree, is an n-arry tree which associates a _residue_ with each node, defined as a reduction from root to that node.

An stree can be used for many things - a standard n-arry tree, a trie (under concatenation), and a visualizable multiverse (under [[combine]]).

## Visualization

### Textual
This is a textual representation of a small, simple stree with 8 values:

```text
- a b c :r(a,b,c)
B d e f :r(a,b,d,e,f)
B g h   :r(a,b,g,h)
E i     :r(a,b,d,e,i)
```

In this notation we let values be lowercase letters, and the letters are assigned in the order the value is added. In the above case the stree has received 7 values via `add()`, indicated by letters `a`-`i`. The first row has no parent, indicated with `-`. The second row is parented at the second value, indicated by capital `B`. The third row is also parented at the second value. The fourth row is parented at the fourth value, which is `E`. Each row has an additional column, the row residue, computed as a reduction from root to the end of the row, indicated by `:r()` and containing ALL values from root. Note that ALL values are associated with a residue, but this is hard to notate. For example, value `d` is associated with residue `:r(a,b,d)`. But we show only the row residue.

We can write code that almost looks like this representation if we let each value be a single character, let the reduction be concatenation. This is not how you'd normally use `stree`, but it may be illustrative:
```js
import {stree, formatSTree} from '/s/lib/simpatico.js';

// Define our reducer and values a through i
const concat = (a, b) => a + b;
const a = 'a', b = 'b', c = 'c', d = 'd', e = 'e',
      f = 'f', g = 'g', h = 'h', i = 'i';

// Build up the stree, keeping a reference to every node, n0-n8
// Each row/branch of assignments cooresponds to a row in the stree, r0-r3, assigned to the last node in the row.
const s = stree(a, concat);
const n0 = s.root,    n1 = n0.add(b), n2 = n1.add(c), r0 = n2;
const n3 = n1.add(d), n4 = n3.add(e), n5 = n4.add(f), r1 = n5;
const n6 = n1.add(g), n7 = n6.add(h),                 r2 = n7;
const n8 = n4.add(i),                                 r3 = n8;


// Print the residue for each row/branch
log({r0: r0.residue, r1: r1.residue, r2: r2.residue, r3: r3.residue});
/* Output:
    "r0": "abc",
    "r1": "abdef",
    "r2": "abgh",
    "r3": "abdei"
 */

// Alternative way to get the residues for every row:
log(s.residues());
// Output: [
//     "abc",
//     "abdef",
//     "abgh",
//     "abdei"
// ]


log(formatSTree(s));
/*
- a b c :r(a,b,c)
B d e f :r(a,b,d,e,f)
B g h :r(a,b,g,h)
E i :r(a,b,d,e,i)
 */

```

In this example, the stree forms a trie. 
Reduce under `Object.assign()` to see how different objects relate to each other. 
Reduce with something like `lodash.merge()` to support deep merging. 
Reduce objects under `combine()` to use both deep merging and function invocation (the Simpatico default). 
With function invocation, the reducer technically becomes a [transducer](https://www.youtube.com/watch?v=6mTbuzafcII).

# API

## STreeNode

  - **`value:`** the input
  - **`node parent:`** reference to the parent node
  - **`value residue:`** (optional) cached result of reduction-from-root to this node
  - **`int branchIndex:`** the branch, or row, in which this node lives
  - **`int id:`** a unique id that orders nodes in time; an index into stree.nodes[]
  - **`bool leaf:`** true if this is the last node in a row, false otherwise
  - **`node add(value):`** wrap value in a new node and set as child to this node; return wrapper node
  - **`node addAll(arr):`** convenience; add all values in array with add(); return wrapper node for last elt
  - **`node addLeaf(value):`** convenience; add value to the end of this node's branch; return wrapper node
  - **`node addLeafs(arr):`** convenience, add all values in array with addLeaf(); return wrapper node for last elt
  - **`node getLeaf():`** return node at the end of the branch

## STree

  - **`stree(value={}, fn reducer=combine, fn summarize=null):`** create a new stree with root value, residue reducer, and summarize reducer. Returns an object with the following members.
  - **`node add(value, node=lastNode):`** create a new node with node as parent; if node not given, defaults to last node.
  - **`node addAll(arr, node=lastNode):`** convenience, add all values in array with node as parent
  - **`[node] nodePath(node):`** return an array of nodes from root to a given node
  - **`val residue(node):`** compute the residue of the node; useful when not caching residues (otherwise use node.residue)
  - **`[val] residues():`** compute residues of all branches, returned as an array
  - **`[node|int] toArray():`** serialize the stree as an array of values interleaved with integers that set the parent of the next node
  - **`str serializeToString():`** serialize the stree to a string, taking care to serialize functions; see `fromString()`
  - **`node nodeByNumber(num):`** positive numbers give the node at that index; negatives give the branch leaf
  - **`[node] branches:`** an array of nodes that are all the last node in the branch (all nodes where node.leaf == true)
  - **`[node] nodes:`** an array of all nodes in the stree
  - **`node root:`** the root node of the stree
  - **`val summary:`** (optional) the result of reducing residues() with summarize()

## STree Utilities
Deserialization methods. It would be nice to support these in the `stree()` constructor at some point. 

  - **`stree fromArray(arr, reducer, summarize):`** deserialize the stree from an array of values interleaved with 'parent' integers (e.g., as produced by stree.toArray())
  - **`stree fromString(str, reducer, summarize):`** deserialize the stree from a string, assumed to be produced by stree.toString() 
  - **`str formatSTree(stree):`** produce a compact string representation

# Tests

## Default STree Behavior
The default STree uses an empty object `{}` as root and `combine()` as the reducer:

```js
import {stree, formatSTree} from '/s/lib/simpatico.js';

const s = stree(), a = {a:1}, b = {b:2};

const n0 = s.root;
as.equals({}, n0.value);
as.equals(0, n0.branchIndex);
as.equals({}, n0.residue);

const n1 = s.add(a);
as.equals(a, n1.residue);
as.equals(n0, n1.parent);
as.equals(0, n1.branchIndex);

const n2 = s.add(a);
as.equals({a:2}, n2.residue);
as.equals(n1, n2.parent);
as.equals(0, n2.branchIndex);
//nothing has changed with n1
as.equals(a, n1.residue);

// branch from n1
const n3 = s.add(b, n1);
as.equals({a:1, b:2}, n3.residue);
as.equals(1, n3.branchIndex);

const n4 = s.add(b);
as.equals({a:1, b:4}, n4.residue);
as.equals(1, n4.branchIndex);

//branch from n3
const n5 = s.add(b, n3);
as.equals({a:1, b:4}, n5.residue);
as.equals(2, n5.branchIndex);

// add to the first row again
const n6 = s.add(a,-0);
log(formatSTree(s));


// node by number tests: positive are just node ids
as.equals(n0, s.nodeByNumber(0));
as.equals(n4, s.nodeByNumber(4));
// negative values return the "leaf" of the row.
as.equals(n6, s.nodeByNumber(-0));
as.equals(n4, s.nodeByNumber(-1));
as.equals(n5, s.nodeByNumber(-2));

// check residue and summary
as.equals([{a:3},{a:1,b:4},{a:1,b:4}], s.residues());
as.equals(s.summary, undefined);

// check leaf behavior
as.equals(n6, n0.getLeaf());
```
