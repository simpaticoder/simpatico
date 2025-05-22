# Core.js
2024

A handful of comprehensive helper functions to make working with ES6 more functional. Focus is on types, predicates, assertions, functional helpers and general utilites.

## Logging

```js
  core.info('welcome to core.js')
  core.log(new Date().toUTCString());
  core.debug('this is a debugging statement') //won't show up if your console isn't set to verbose
```

## Assertions

```js
import {cast, TYPES} from '/s/lib/core.js';

//   Uncomment to test and make sure it actually fails.
//   assertThrows(1)
//   assertThrows(()=>{}, 'testing assertion failure');

assertEquals({a: 1, b: [2, 3]}, {a: 1, b: [2, 3]})
assertEquals({b:[{a:1},{b:2}], a:1},{a:1, b:[{a:1},{b:2}]});

// Some negative testing.
assertThrows(() => {throw ''})
assertThrows(() => {core.error('this is an error ')})
assertThrows(() => {assert(false, 'testing assertion failure')})
assertThrows(() => as.num('1'))
assertThrows(() => as.bool('1'))
assertThrows(() => as.obj([]))
assertThrows(() => as.between(0, 10, 11))
assertThrows(() => as.between(10, 10, 11))
assertThrows(()=>  as.same([false, true]))
assertThrows(() => as.same([1, 1, 2]))
assertThrows(() => as.all([true, false]))
assertThrows(() => as.num(core.cast('a', TYPES.NUM)))
assertThrows(() => assertEquals({a: 1, b: [2, 3]}, {a: 1, b: [2, 3, false]}))
```

## Object Functions

```js
  const a = {a: 1};
  const b = {b: 2};

  is.hasProp(a, 'a');
  as.hasProp(a, 'a');
  assert(core.hasProp(a, 'a'))
  assert(!core.hasProp(a, 'b'))

  as.equals(core.getProp(a, 'a'), 1)
  // test the default behavior of getProp
  as.equals(core.getProp(a, 'b', 3), 3)

  const d = core.mapObject(a, ([k, v]) => [k, v + 5])
  as.hasProp(d, 'a')
  as.equals(d['a'], 6)
```

## Equals

```js
  const a = {a: 1}, b = {b: 2}
  as.equals(1, 1)
  as.notEquals(1, 2)
  as.notEquals(a, b)
  as.equals(a, {a: 1})
  as.notEquals(a, {a: 1, b: 2})

  const arr0 = [], arr1 = [1, 3, 5], arr2 = [1, 3, 5], arr3 = [1, 3], arr4 = [1, 3, 5, 'a']
  as.equals(arr1, arr2)
  as.notEquals(arr0, arr1)
  as.notEquals(arr1, arr3)
  as.notEquals(arr1, arr4)
  as.notEquals(arr0, arr4)
```
## Booleans
```js
  assert(core.and(true, true))
  assert(!core.and(true, false))
  assert(core.or(true, false))
  assert(core.or(false, true))
  assert(!core.or(false, false))

```
## Predicates
```js
  assert(is.num(.1))
  assert(is.int(1))
```

## Arrays
Functional, non-mutating versions of the built in array functions.

```js
  const arr0 = [], arr1 = [1, 3, 5], arr2 = [1, 3, 5], arr3 = [1, 3], arr4 = [1, 3, 5, 'a']
  as.equals(core.peek(arr1), 5)
  as.equals(core.peek(arr0), null)
  as.equals(core.peek(arr0, 0), 0)


  const arr5 = core.push(arr1, 3)
  as.equals([1, 3, 5, 3], arr1)
  as.equals(arr5, arr1)
```
## Types

```js
  assertEquals(core.getType(1), core.TYPES.NUM)
  assertEquals(core.getType([]), core.TYPES.ARR)
  assertEquals(core.getType({}), core.TYPES.OBJ)

  // Simpatico specific duck-typing
  assertEquals(core.getType({
    handle: () => {}
  }), core.TYPES.HANDLER)
  assertEquals(core.getType({handler: ''}), core.TYPES.MSG)

  // Size is defined differently for different types.
  assertEquals(core.size(10), 10)
  assertEquals(core.size('foo'), 3)
  assertEquals(core.size([3, 2, 5, 4]), 4)
  assertEquals(core.size({foo: 1, bar: 2}), 2)
  assertEquals(core.size(() => {
  }), 0)
  assertEquals(core.size(null), 0)
  assertEquals(core.size(), 0)

  assertEquals({},{})
  assertEquals([1],[1])

```
## Assertions

```js
  as.str('foobar')
  as.num(1)
  as.bool(false)
  as.fun(() => {})
  as.obj({})
  as.arr([])
  as.between(0, 10, 5)
  as.between(0, 10, 'a') //between assumes string length
  as.between(0, 4, [1, 2])
  as.exists([])
  as.exists({})
  as.exists(0)

  as.equals([], [])
  as.contains([1, 3, 4], 3)
  as.excludes([1, 3, 4], 5)
  as.bool(core.cast('false'))
  as.num(core.cast('1234'))
  as.all([1, 1, 1])
  as.all(['a','a','a'])
  as.same([true, true])
  as.same([false, false])
  as.same([1, 1, 1, 1, 1])
  as.same(['a', 'a', 'a'])
  as.same([{}, {}, {}, {}])

```

## De/Serialization

```js
  // Lets test the function detecting regex.
  const functionString = "async function greet(name) {\n  console.log(`Hello, ${name}!`);\n}";
  const arrowFunctionString = "(async (x, y) => x + y)";
  const notFunctionString = "const message = 'Hello, world!'";
  assert(core.regex.functions.test(functionString));
  assert(core.regex.functions.test(arrowFunctionString));
  assert(!core.regex.functions.test(notFunctionString));
  const o1 = {
    a: 1,
    b: {
      c: function() {
        console.log('hello');
      },
      d: {
        e: function() {
          console.log('world');
        }
      },
      f: (a,b) => {console.log('arrows')}
    },
    g: 'hello',
    h: 'world() && foo',
  };
  const strActual = core.stringifyWithFunctions(o1);
  const strExpected = `{"a":1,"b":{"c":"function() {\\n        console.log('hello');\\n      }","d":{"e":"function() {\\n          console.log('world');\\n        }"},"f":"_ArrowF_(a,b) => {console.log('arrows')}"},"g":"hello","h":"world() && foo"}`;
  assertEquals(strActual, strExpected);
```
