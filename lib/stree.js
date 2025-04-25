import {stringifyWithFunctions, parseWithFunctions} from "./core.js";
import {combineRules} from "./combine.js";

/**
 * Create a serializable n-ary tree with a well-defined, cached reduction defined on all nodes.
 *
 * @param value if an array or string, reconstitute stree from contents. if other, use as root.
 * @param reducer reducer used to compute the residue of a node. default is combine
 * @param summarize an optional function that updates summary based on the new node
 * @returns {[]|string|*}
 */
function stree(value = {}, reducer = (a, b) => combineRules(a, b, null, true), summarize) {
    let summary;

    const root = {
        value, parent: null, residue: value, branchIndex: 0, id: 0, leaf: true,
        add: a => add(a, root),
        addAll: a => addAll(a, root),
        addLeaf: a => addLeaf(a, root),
        addLeafs: a => addLeafs(a, root),
        getLeaf: () => getLeaf(root),
        summary,
    };
    const branches = [root];
    const nodes = [root];
    let lastNode = root;
    if (summarize) summary = summarize(null, root);

    /**
     * Add a value to an n-ary tree.
     * Return the node that wraps these parameters.
     * Updates branches[] and lastNode
     * The parent can be specified as either a node or an index into nodes.
     * If the reducer is not commutative (combine isn't), the order of the children matters.
     * If the reducer fails (throws), the node is not added and the lastNode is not updated.
     *
     * @param value The value associated with the node. Set to lastNode for future calls. Note that it will be Object.freeze'd
     * @param parent The node considered as a parent. Can be null for root. If it's an integer, treated as index of parent in nodes
     * @returns {{parent, value, value}}
     */
    function add(value, parent = lastNode) {
        if (typeof parent === 'number') {
            parent = nodeByNumber(parent);
        }
        Object.freeze(value);
        const node = {
            value, parent, //residue, branchIndex, and id added below
            add: a => add(a, node),
            addAll: a => addAll(a, node),
            addLeaf: a => addLeaf(a, node),
            addLeafs: a => addLeaf(a, node),
            getLeaf: () => getLeaf(node),
            summary,
        };

        if (parent.leaf) {
            node.residue = reducer(parent.residue, node.value);
            // Move msgs up to the stree node to not interfere with future residues.
            if (node.residue.msgs) {
                node.msgs = node.residue.msgs;
                delete node.residue.msgs;
            }
            node.branchIndex = parent.branchIndex;
            // replace branch node
            branches[parent.branchIndex] = node;
            node.leaf = true;
            parent.leaf = false;
            // delete parent.residue; //deleting saves some memory and time computing residue. it also presence also signals "branchness".
        } else {
            node.residue = residue(node);
            node.branchIndex = branches.length;
            node.leaf = true;
            branches.push(node);
        }

        if (summarize) summary = summarize(summary, node);

        lastNode = node;
        node.id = nodes.length;
        nodes.push(node);
        return node;
    }

    function addAll(arrValue, parent = lastNode) {
        if (typeof parent === 'number') {
            parent = nodeByNumber(parent);
        }
        for (value of arrValue) {
            parent = add(value, parent)
        }
        return parent;
    }

    /**
     * Add a value as a leaf of the branch containing node
     */
    function addLeaf(value, node) {
        const parent = branches[node.branchIndex];
        return add(value, parent);
    }

    /**
     * Add several values as a leaf of the branch containing node
     *
     * @param value - an array of values
     * @param node
     */
    function addLeafs(values, node) {
        const parent = branches[node.branchIndex];
        return addAll(values, parent);
    }

    function getLeaf(node) {
        return branches[node.branchIndex];
    }

    /**
     * The array of all nodes from root to the specified node, inclusive.
     *
     * @param node The node to start with
     * @returns {*[]} An array of nodes between `node` and root, inclusive
     */
    function nodePath(node = lastNode) {
        let nodePath = [node];
        while (node.parent) {
            nodePath.push(node.parent);
            node = node.parent;
        }
        return nodePath.reverse();
    }

    /**
     * The residue of a node is the reduction of the path from root to the node.
     *
     * @param node
     * @returns {*}
     */
    function residue(node = lastNode) {
        if (typeof node === 'number') {
            node = nodeByNumber(node);
        }
        return node.residue ? node.residue : nodePath(node).map(n => n.value).reduce(reducer);
    }

    function residues() {
        return branches.map(a => a.residue);
    }

    function nodeByNumber(num) {
        let node;
        if (Object.is(num, -0)) {
            node = branches[0];
        } else {
            node = num >= 0 ? nodes[num] : branches[-num];
        }
        return node;
    }

    /**
     * Return a representation of the n-ary tree as [{}, {}, 0, {}, {}].
     * The objects are values, and the integers parent node indexes.
     *
     * The inverse of fromArray()
     * Example: [{a: 0}, {a: 1}, {a: 2}, {a: 3}, 1, {a: 4}];
     *
     * @returns {[{}|number]}
     */
    function toArray() {
        const arr = [root.value];
        let prevNode = root;
        let currNode = root;
        for (let i = 1; i < nodes.length; i++) {
            currNode = nodes[i];
            if (currNode.parent !== prevNode) {
                arr.push(currNode.parent.id)
            }
            arr.push(currNode.value);
            prevNode = currNode;
        }
        return arr;
    }

    /**
     * Compute a string representation of the stree, including function bodies as strings
     * inverse is fromString().
     *
     * @returns {string} a string representation of the stree, including function bodies as strings.
     */
    function serializeToString() {
        return stringifyWithFunctions(toArray());
    }

    return {
        add,
        addAll,
        nodePath,
        residue,
        residues,
        toArray,
        fromArray,
        serializeToString,
        nodeByNumber,
        branches,
        nodes,
        root,
        summary
    };
}


/**
 * Produce an stree from the given array.
 * The inverse of stree.toArray().
 *
 * @param arr where number types are treated as parent node index.
 * @param reducer
 * @param summarize
 * @returns a new stree
 */
function fromArray(arr, reducer = (a, b) => combineRules(a, b, null, true), summarize) {
    const s = stree(arr[0], reducer, summarize);
    let value, parent;
    for (let i = 1; i < arr.length; i++) {
        value = arr[i];
        if (typeof value === 'number') {
            parent = s.nodeByNumber(value);
            value = arr[++i]; // note the index skip
            s.add(value, parent);
        } else {
            s.add(value);
        }
    }
    return s;
}

/**
 * Reconstitute the stree from a string representation.
 * inverse is stree.serializeToString().
 *
 * @param str
 * @param reducer
 * @param summarize
 * @returns stree
 */
function fromString(str, reducer = (a, b) => combineRules(a, b, null, true), summarize) {
    return fromArray(parseWithFunctions(str), reducer, summarize);
}

function formatResidue(residue) {
    if (typeof residue === 'string') {
        return `:r(${residue.split('').join(',')})`; // Original string behavior
    }
    if (typeof residue === 'number' || residue === null || residue === undefined) {
        return `:r(${residue})`; // Direct stringification
    }
    if (Array.isArray(residue)) {
        return `:r(${residue.join(',')})`; // Array joining
    }
    if (typeof residue === 'object') {
        // For objects, use JSON.stringify (with spacing removed for compactness)
        const objString = JSON.stringify(residue)
            .replace(/"/g, '')    // Remove quotes from keys
            .replace(/\s+/g, ''); // Remove all whitespace
        return `:r(${objString.slice(1, -1)})`; // Remove outer {}
    }
    return `:r(${String(residue)})`; // Fallback string conversion
}


function formatSTree(stree) {
    const nodes = stree.nodes;
    const rows = ['\n']; //initial newline useful for alignment in log
    const valueMap = new Map(); // node.id -> value character

    // Assign letters to nodes in insertion order
    let currentCharCode = 97; // 'a'
    nodes.forEach(node => {
        if (node.value.length === 1 && /[a-z]/.test(node.value)) {
            valueMap.set(node.id, node.value);
        } else {
            valueMap.set(node.id, String.fromCharCode(currentCharCode++));
        }
    });

    // Group nodes by branchIndex and build rows
    const branches = new Map();
    nodes.forEach(node => {
        if (!branches.has(node.branchIndex)) {
            branches.set(node.branchIndex, []);
        }
        branches.get(node.branchIndex).push(node);
    });

    // Generate rows
    branches.forEach(branchNodes => {
        const rowValues = [];
        let parentIndicator = '-';

        // Find parent indicator
        if (branchNodes[0].parent) {
            const parentId = branchNodes[0].parent.id;
            const parentPosition = nodes.findIndex(n => n.id === parentId);
            parentIndicator = String.fromCharCode(65 + parentPosition);
        }

        // Collect values in row
        branchNodes.forEach(node => {
            rowValues.push(valueMap.get(node.id));
        });

        // Get residue for last node in branch
        const residue = branchNodes[branchNodes.length - 1].residue ||
            stree.residue(branchNodes[branchNodes.length - 1]);

        // Format row
        const row = [
            parentIndicator,
            ...rowValues,
            formatResidue(residue) // Now handles all types
        ].join(' ');


        rows.push(row);
    });

    return rows.join('\n');
}


export {stree, fromString, fromArray, formatSTree}
