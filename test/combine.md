# combine()
2024

A generalization of `Object.assign` that supports reduction, adding/removing properties and invoking functions.

> See:
[home](/),
[stree](./stree.md),
[litmd](./lit.md),
[audience](./audience.md)


`combine(a, b)` combines two object arguments `b` with `a` and returns the result. Example usage:

```html
<script type="module">
  import {assertEquals} from '/s/lib/core.js';
  import {combine} from '/s/lib/combine.js';

  assertEquals(3, combine(1, 2));
</script>
```

To use the library in node, omit the script tags and set `{"type": "module"}` in `package.json`.
Note: I'd like to support npm `require()` as well, however that requires a UMD wrapping tool like Webpack, which I'm unwilling to add at this point.

_________________________________________________________
# Combining data objects 
Combine's action varies according to the types of its arguments.
Numbers add. Most other scalars "replace":

```js
import {combine} from "/s/lib/combine.js";

assertEquals('bar', combine('foo', 'bar'), 'strings replace');
assertEquals(false, combine(true, false), 'booleans replace');
let a = () => {}, b = () => {};
assertEquals(b, combine(a, b), 'functions replace');
```
For objects, combine mostly behaves just like `Object.assign`, but recursive. See [lodash merge()](https://lodash.com/docs/4.17.15#merge) for another example of this behavior.

```js
import {combine} from "/s/lib/combine.js";

assertEquals({a: 1, b: 2}, combine({a: 1}, {b: 2}), 'combine merges keys');
assertEquals({a: 1, b: 2}, Object.assign({}, {a: 1}, {b: 2}), 'Object.assign merges keys');
```
 `Object.assign` is shallow, `combine()` is deep:

```js
import {combine} from "/s/lib/combine.js";

assertEquals({a: {b: 2}}, combine(          {a: {b: 1}}, {a: {b: 1}}), 'combine is deep');
assertEquals({a: {b: 1}}, Object.assign({}, {a: {b: 1}}, {a: {b: 1}}), 'Object.assign is shallow');
```

## Deleting
Ideally we could use a type like 'undefined' to delete object properties.
However javascript cannot differentiate between missing and undefined properties.
Null indicates 'zero'. Each JavaScript type has it's own zero, so the zeroes for `[number, string, object, array]` are  `0, "", {}, []`.


A `Symbol` would work, but cannot be easily de/serialized. (We might do `Symbol(DELETE)`, however)
So we pick a special string and export it from `combine`.

```js
import {combine, DELETE} from "/s/lib/combine.js";

assertEquals({}, combine({a:1}, {a: DELETE}), 'special delete token deletes');
```
_________________________________________________________
# Combining with Handlers

`combine()` supports *handlers*. A handler looks like this:

```js
// This handler ignores its arguments and returns an array of 2 objects:
const inc = {handle: (core, msg) => [ {a:1}, {b:2} ] };
assertEquals([ {a:1}, {b:2} ], inc.handle());
```

Handlers are how you program cores in Simpatico.
Handlers are objects with a `handle` property, which should be a function that takes two arguments, `core` and `msg`.
The core is the target, or destination, of the message. It is similar to `this` in some javascript contexts.
The result is an array of objects that describe how the core should change.

> In some places the `core` argument is called `ctx` for "context". 
_________________________________________________________
## handle : (core, msg) => [ ]
Handlers take two arguments, the target and the message, in the first and second position respectively.
Also, we add a 'msg' entry that describes a typical message for this handler:

```js
import {combine} from "/s/lib/combine.js";

// This handler returns an array of 2 objects:
const inc = {handle: (core, msg) => [{a: 1}, {b: 2}]};
assertEquals([{a: 1}, {b: 2}], inc.handle());

// the simpaticore is a handlers object, plus some state, called residue
// in this case the residue is initialized to {a:10, b:20}
const residue = {a:10, b:20}
const simpaticore = {handlers: {inc}, ...residue};

// call the handler with a message
const msg = {handler: 'inc'};

// check the effect on residue
assertEquals({handlers: {inc}, a: 11, b: 22}, combine(simpaticore, msg), 'shows a side-effect on residue.');
assertEquals({handlers: {inc}, a: 10, b: 20}, simpaticore, 'simpaticore is untouched');
assertEquals({handlers: {inc}, a: 11, b: 22}, combine(simpaticore, msg));
assertEquals({handlers: {inc}, a: 12, b: 24}, combine(simpaticore, msg, msg), 'increments compound');
assertEquals({handlers: {inc}, a: 13, b: 26}, combine(simpaticore, msg, msg, msg));
```
> Note that while a `handle()` function returns an array of mutations to residue, the `combine()` function returns a new Simpaticore.

The handler above takes no arguments and gives a constant result.
We leave the `(core, msg)` function signature for consistency, even though we're not using them.
It's a dual counter, where `a` is incremented by 1, and `b` by 2.
We initialize both `a` and `b` to show there is interaction between the result of `inc` and current core state.

> **Similarity to apply()**: The handler signature is similar to js-native `Function.prototype.apply(thisArg, ...args)`.
> The first argument, the "`thisArg`" is the core, the context, the second argument, the args, is the message itself.
> See: [JavaScript Function specification](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-function.prototype.apply)

### Aside: Use explicit residue?
It might seem like a good idea to make the residue explicit, as below. However, I've found in practice this is uncomfortable to work with.

```js
    const simpaticore = {handlers: {}, residue:{a:1, b:2}};
```
_________________________________________________________
## Assertion handler
Before moving on its useful to define an "assertion handler". 
This handler looks more complex because it has more fields in the handler itself, which are only convenience functions to make installing and using it easier.

> **Note:** This handler is exposed by [`handlers.js`](/s/lib/handlers.js).

```js
import {combine} from "/s/lib/combine.js";

const assertHandlerDemo = {
  name: 'assert',
  install: function () {
    return {handlers: {assert: this}}
  },
  call: a => ({handler: 'assert', ...a}),
  handle: (core, msg) => {
    Object.entries(msg).forEach(([key, msgValue]) => {
      if (key === 'handler' || key === 'parent') return; // skip the handler name itself
      if (core.hasOwn(key)) assertEquals(msgValue, core[key]);
      else throw 'core is missing asserted property ' + key;
    });
    return [{}];
  },
};
const has = assertHandlerDemo.call;

//1. The long-winded way to use the assert handler:
assertThrows(() => {
  combine(
    {a: 1, handlers: {assert: assertHandlerDemo}},
    {a: 2, handler: 'assert'},
  );
});
combine(
  {a: 1, handlers: {assert: assertHandlerDemo}},
  {a: 1, handler: 'assert'},
);

// 2. the shorter way to call the assert handler:
assertThrows(() => 
    combine(assertHandlerDemo.install(), {a: 1}, has({a: 2}))
);
combine(assertHandlerDemo.install(), {a: 1}, has({a: 1}));

// 3. A nice call and response pattern using the shorter form:
combine(assertHandlerDemo.install(),
  {a: 1}, has({a: 1}),
  {c: 'foo'}, has({c: 'foo'}), 
  ...etc
);
```
The object structure is primary - the rest of it is just window dressing.
(It might also be nice to experiment defining handlers not as plain objects that contain a function,
but as a function object that can both be invoked and have properties added to it.)

Here is a somewhat redundant example that I may remove in the future (although it does demonstrate using core values in the handler result):

```js
import {combine} from "/s/lib/combine.js";
import {assertHandler} from "/s/lib/handlers.js";

const has = assertHandler.call;
const dbl = {
  call: () => ({handler: 'dbl'}),
  install: function () {
    return {handlers: {dbl: this}, a: 0, b: 0}
  },
  handle: (core, msg) => [{a: core.a}, {b: core.b}],
}

const ops = [
  assertHandler.install(), dbl.install(),
  {a: 10, b: 20}, has({a: 10, b: 20}),
  dbl.call(), has({a: 20, b: 40}),
  dbl.call(), has({a: 40, b: 80}),
  ...etc
];
combine(ops);
```
_________________________________________________________
## Log Handler
This is a handler that logs: 
> **Note:** This handler is exposed by `handlers.js`
```js
import {hasProp} from "/s/lib/core.js";
import {combine} from "/s/lib/combine.js";
import {assertHandler, logHandler} from "/s/lib/handlers.js";

const logHandlerDemo = {
  name: 'log',
  install: function (outputFunction = log) {
    this.outputFunction = outputFunction;
    return {
      handlers: {log: this},
      debug: true, // residue can turn off logging
      lastOutput: '', // the last thing logged
    }
  },
  call: a => {
    if (typeof a === 'string') a = {msg: a};
    return {handler: 'log', ...a};
  },
  handle: function (core, msg) {
    if (core.debug) {
      this.outputFunction('logHandler', msg, core);
      if (hasProp(msg, 'msg'))
        return [{lastOutput: msg.msg}];
    }
    return [];
  }
};


const has = assertHandler.call;
const logh = logHandlerDemo.call;
const ops = [
  assertHandler.install(),
  logHandlerDemo.install(), has({debug: true, lastOutput: ''}),
  {a: 10, b: 20}, logh('prints the core'), has({lastOutput: 'prints the core'}),
  {debug: false}, logh('does not print'), has({lastOutput: 'prints the core'}),
  {debug: true}, logh('prints again'), has({lastOutput: 'prints again'}),
  ...etc
];
combine(ops);

```
_________________________________________________________
## Handlers replace each other
Handlers replace, so we can overwrite the old handler and call it with the same message:

```js
import {combine} from "/s/lib/combine.js";
import {assertHandler} from "/s/lib/handlers.js";

const has = assertHandler.call;
const inc1 = {handle: () => [{a: 1}, {b: 2}]};
const inc2 = {handle: () => [{a: -1}, {b: -2}]}
const msg = {handler: 'inc'}

const ops = [
  assertHandler.install(), {handlers: {inc: inc1}},
  {a: 10, b: 20}, has({a: 10, b: 20}),
  msg, has({a: 11, b: 22}), // The message increased residue
  {handlers: {inc: inc2}},             // Replace inc1 with inc2 answering to the 'inc' msg
  msg, has({a: 10, b: 20}), // The message decreased residue
  msg, has({a: 9, b: 18}),
  ...etc
];
combine(ops);
```
The handler overwriting feature is key to enabling *type versioning* in the [stree](/kata/stree.md).

_________________________________________________________
## Handlers call each other

Functions replace, so we can overwrite the old handler and call it with the same message:

```js
import {combine} from "/s/lib/combine.js";
import {assertHandler} from "/s/lib/handlers.js";

const has = assertHandler.call;
const h1 = {
  handle: () => [{handler: 'h2'}, {a: 1}],
  call: () => ({handler: 'h1'}),
};
const h2 = {
  handle: () => [{b: 1}],
  call: () => ({handler: 'h2'}),
};

const ops = [
  asserHandler.install(),
  {handlers: {h1, h2}},
  {a: 0, b: 0}, has({a: 0, b: 0}),
  h1.call(), has({a: 1, b: 1}), // The only way that b increments is if h2 is called; hence h2 been called indirectly.
  h1.call(), has({a: 2, b: 2}),
  ...etc
];
combine(ops);
```

# Handlers that return non-array results are treated as an error
A non-array return value is treated as a recoverable error.
Because `combine` is a pure function, no modification of the core occurs.


```js
import { combine } from '/s/lib/combine.js';

const alwaysErrorHandler = {handlers: {err: {name: 'err', handle: () => ({a:1, b:2})}}};
let result;
let throws = false;
try{
  result = combine([alwaysErrorHandler, {handler: 'err'} ]);
} catch(e) {
  throws = true;
  assertEquals({a:1, b:2}, e.customData);
  assertEquals(undefined, result);
}
if (!throws) throw 'should have thrown';
```

