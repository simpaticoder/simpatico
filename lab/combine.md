# Combine and friendly functions
This convention supports the use of [friendly functions](friendly.md) to do validation on handler arguments.
(This will be a regular pattern in most handlers, so we will eventually move the boilerplate into combine.)
```js
import { combine } from '/s/lib/combine.js';
import { validate } from '/s/lib/friendly.js';

const user = {
  name: 'user',
  pattern: {
      name: ['str', 'between', 1,10],
      age: [ 'num', 'between', 1, 100],
  },
  example: {
      name: 'alice',
      age: 25,
  },
  handle: function (core, msg) {
      // check that the msg is valid
      const errors = validate(this.pattern, msg);
      if (errors) return errors;
      // if valid, remove the handler property to avoid blowing the stack and return in an array
      const {handler, ...user} = msg;
      return [user];
  }
}
let result;

// no user data at all
try {
  result = combine([{handlers: {user}}, {handler: 'user'}]);
  assertTrue(false);
}catch (e){
  assertEquals({name: ['str', 'between', 1,10], age: [ 'num', 'between', 1, 100]}, e.customData);
  assertEquals(undefined, result);
}
// only the name, missing age
try {
  result = combine([{handlers: {user}}, {handler: 'user', name: 'alice'}]);
  assertTrue(false);
}catch (e){
  assertEquals({age: [ 'num', 'between', 1, 100]}, e.customData);
  assertEquals(undefined, result);
}
// both name and age are present
result = combine([{handlers: {user}}, {handler: 'user', name: 'alice', age: 25}]);
assertEquals('alice', result.name);
assertEquals(25, result.age);

```

# Custom rules
You can override the default ruleset in combine.
```js
import {combineRules} from '/s/lib/combine.js';

assertEquals(6, combineRules(2,3, (a,b) => a * b));
// custom embedded rules are scalar so they work in objects.
// to do general custom rules would require type-checking
assertEquals({a: 6}, combineRules({a:2},{a:3}, (a,b) => a * b));

//To make it a reducer you need to do a manaul partial application.
const mulCombine = (a,b) => combineRules(a,b,(a,b) => a * b);
assertEquals(16, [2,2,2,2].reduce(mulCombine, 1));
```
Note that in a [previous version](/notes/combine.md) combine rules were specified as a ruleset, and so easily replaced without function composition.

# Message Cascade with msgs
It is sometimes useful to expose the message cascade to calling code.
This only applies when a handler calls another handler.
In this case, `combine` will add a `msgs` property to the residue, and include a simple, linear representation of the message cascade.

TODO add a code example



_________________________________________________________
# Next: stree

Modeling program state as a monotonically increasing list of input, all of which are objects, gives us a great benefit:
We can imagine branching our program state in a very natural way.
This method of branching turns out to be both simpler and more expressive than either inheritance relationships or instantiation.
This will be dealt with in the `stree` section.

Continue with [stree3](./stree3.md).