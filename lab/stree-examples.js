import {assertHandler, logHandler} from "../lib/handlers.js";
import {DELETE, h} from '/s/lib/combine.js';

// it would be nice to support non-object values in stree, however this conflicts with both fromArray and other things.
// the trailing empty strings allow branching off the last node, ensuring a new row per word.
const trieOps = [
  'he', '',
  0, 'y', '',
  0, 're', '',
  4, 'tic', '',
  0, 'rmit', '',
].map(a => (typeof a === 'number') ? a : {a});

const objOps = [
  {name: '', age: 0},
  {name: 'alice', age: 20},
  0, {name: 'bob', age: 30},
  0, {name: 'charlie', age: 40},
  1, {notes: 'alice is great'},
  2, {notes: 'bob is also pretty great'},
  5, {notes: DELETE},
  3, {notes: 'charlie is so so'},
];

// Here's a more usual set of handlers
const incHandler = {handle: () => [{a: 1}], call: () => ({handler: 'inc'})};
const decHandler = {handle: () => [{a: -1}], call: () => ({handler: 'dec'})};
const mulHandler = {
  handle: (core, msg) => [{a: null}, {a: msg.factor * core.a}],
  call: a => ({handler: 'mul', factor: a})
}
const inc2 = () => [{handler: 'inc'}, {handler: 'inc'}];

// These are convenience methods for authoring; we're still just adding objects together.
// note that assertHandler and logHandler are auto-imported from combine2. however they are small and inlinable.
// 'log' is a default import so call the logHandler function 'loggy'
const has = assertHandler.call, loggy = logHandler.call;
const inc = incHandler.call, dec = decHandler.call, mul = mulHandler.call;
const arithmeticOps = [
  assertHandler.install(),
  logHandler.install(), has({debug: true, lastOutput: ''}),
  {handlers: {inc: incHandler, dec: decHandler, mul: mulHandler}},
  {a: 10}, has({a: 10}), // nodes 5 and 6
  inc(), has({a: 11}),
  dec(), has({a: 10}), // nodes 9 and 10
  dec(), has({a: 9}),
  mul(5), has({a: 45}),
  loggy('okay, lets backtrack and start from an earlier node.'),
  5, has({a: 10}),
  mul(2), has({a: 20}),
  inc(), has({a: 21}),
  loggy('now lets backtrack to node 10 and '),
  10, has({a: 9}),
  mul(20), has({a: 180}),
  h(inc2), {handler: 'inc2'}, has({a:182})//demo late adding handlers and an alternative authoring method
];

// build up an arbitrary very simple stree. the values don't matter, only the structure
const a = {a:1};
//           0,1,2,  3,4,  5,6,  7,  8,9,  a,  b,  c,d,   e,   f
const trivialOps = [a,a,a,1,a,a,3,a,a,1,a,3,a,a,2,a,5,a,8,a,a,-2,a,-3,a];

export {trieOps, objOps, arithmeticOps, trivialOps}
