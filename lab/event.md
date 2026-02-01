---
title: Event Loop Foundations
date: 2026-02-01
description: Exploring call chain propagation, event loop mechanics, and reentrancy prevention in functional JavaScript applications
---

# Event Loop Foundations
2025

This lab explores the foundations of a mostly functional application design, with particular attention to:
1. How the **call chain spreads and terminates** in the context of a single world-event
2. JavaScript techniques to **intentionally break the call chain** such that future computation occurs on a future iteration of the event loop
3. How systems like `stree` avoid reentrancy by distinguishing between results that should be immediately recombined vs. those that should be deferred to the outer event loop

See:
[home](/),
[combine](/test/combine.md),
[stree](/test/stree.md),
[litmd](/test/lit.md)

The basic _application idea_ in JavaScript programs is something like the following:
```js
// Initial State
const initialState = [];

// Compute a new state and render it.
function handleEvent(event){
    let state = compute(state, event);
    render(state);
}

// Begin the steady-state of the application
addEventListener('some event', handleEvent);

// ============== Support Functions =================//
// Define how to combine events to produce a new state
function compute(state = initialState, event){
    const nextState = state;
    state.push(event);
    return nextState;
}
// Define side-effects
function render(state){
    console.log(state);
}
```
This is an example of a long-lived _daemon_ and there is an implicit event loop that runs outside of the
programmers control that handles enqueing of events, backpressure, and periodically calling functions like this one.
Libraries like Redux have something to say about the first line; libraries like React have something to say about the second.
In particular, React (and every framework that uses the shadow dom concept), implicitly store the previous state
in order to optimize rendering of the current state.

_________________________________________________________
# Call Chain Anatomy

When a world-event enters the system, it triggers a **call chain** that spreads through the application. Understanding how this chain propagates and terminates is fundamental to functional application design.

## Synchronous Call Chain Spread

In a purely synchronous system, the call chain is a simple tree:

```js
// A world event triggers a cascade of synchronous calls
function worldEvent(data) {
    const result1 = processA(data);      // Call 1
    const result2 = processB(result1);   // Call 2
    const result3 = processC(result2);   // Call 3
    return result3;                      // Chain terminates, returns to event loop
}

addEventListener('click', worldEvent);
```

The call stack looks like:
```
worldEvent()
  └─ processA()
      └─ processB()
          └─ processC()
              └─ [returns] ← chain terminates here
```

## Message Cascade in Combine

The `combine()` function implements a **message cascade** where handlers can trigger other handlers:

```js
import {combine} from '/lib/simpatico.js';

// Handler that triggers another handler
const h1 = {
    handle: (ctx, msg) => [
        {a: 1},                    // Update state
        {handler: 'h2', value: 2}  // Trigger h2 (recursive combine call)
    ]
};

const h2 = {
    handle: (ctx, msg) => [
        {b: msg.value}             // Update state, chain terminates
    ]
};

const result1 = combine(
    {handlers: {h1, h2}},
    {handler: 'h1'}  // World event
);

// Result contains both state and handlers
assertEquals(1, result1.a);
assertEquals(2, result1.b);
```

The call chain spreads like this:
```
combine(ctx, {handler: 'h1'})
  └─ h1.handle()
      └─ combine(ctx, {a: 1})        ← immediate recombination
      └─ combine(ctx, {handler: 'h2'}) ← recursive handler call
          └─ h2.handle()
              └─ combine(ctx, {b: 2})  ← immediate recombination
                  └─ [returns] ← chain terminates
```

All of this happens **synchronously** in a single event loop iteration.

_________________________________________________________
# Breaking the Call Chain

Sometimes we want to **intentionally break the call chain** to defer computation to a future event loop iteration. This is crucial for:
1. **Avoiding reentrancy** (especially in stree)
2. **Yielding to the browser** for rendering or user input
3. **Preventing stack overflow** in deep recursions
4. **Batching updates** for performance

## Technique 1: setTimeout(fn, 0)

The classic technique - schedules `fn` as a **macrotask**:

```js
// Synchronous - all in one event loop iteration
function immediate() {
    console.log('1');
    console.log('2');
    console.log('3');
}

// Asynchronous - breaks into multiple iterations
function deferred() {
    console.log('1');
    setTimeout(() => console.log('2'), 0);  // New call chain root
    console.log('3');
}

immediate(); // Logs: 1, 2, 3
deferred();  // Logs: 1, 3, 2
```

The call chain is broken:
```
Event Loop Iteration 1:
  deferred()
    └─ console.log('1')
    └─ setTimeout(...)  ← schedules macrotask
    └─ console.log('3')
    └─ [returns]

Event Loop Iteration 2:
  [setTimeout callback]  ← NEW call chain root
    └─ console.log('2')
    └─ [returns]
```


## Technique 2: queueMicrotask(fn)

Schedules `fn` as a **microtask** - runs before the next macrotask but after the current call stack clears:

```js
const taskLog = [];

function testMicrotask() {
    taskLog.push('1');
    queueMicrotask(() => taskLog.push('microtask'));
    setTimeout(() => taskLog.push('macrotask'), 0);
    taskLog.push('2');
}

testMicrotask();

// After current call stack clears:
// taskLog = ['1', '2', 'microtask']

// After next event loop iteration:
// taskLog = ['1', '2', 'microtask', 'macrotask']

setTimeout(() => {
    assertEquals(['1', '2', 'microtask', 'macrotask'], taskLog);
}, 10);
```

The event loop processes tasks in this order:
```
1. Execute current call stack (synchronous code)
2. Process ALL microtasks (queueMicrotask, Promise.then)
3. Render (if browser)
4. Process ONE macrotask (setTimeout, setInterval, I/O)
5. Repeat from step 2
```

## Technique 3: Promise.then(fn)

Promises schedule their callbacks as **microtasks**:

```js
///
const logPromise = [];

function testPromise() {
    logPromise.push('1');
    Promise.resolve().then(() => logPromise.push('promise'));
    logPromise.push('2');
}

testPromise();
// logPromise = ['1', '2', 'promise']
```

This is equivalent to `queueMicrotask()` but with the added benefit of error handling and chaining.

## Technique 4: requestAnimationFrame(fn)

Schedules `fn` to run **before the next repaint** - ideal for animations:

```js
///
function animate() {
    console.log('frame 1');
    requestAnimationFrame(() => {
        console.log('frame 2');  // Runs before next paint
        requestAnimationFrame(() => {
            console.log('frame 3');  // Runs before paint after that
        });
    });
}

animate();
```

See the [clock implementation](/lib/svg.js) for a production example.

_________________________________________________________
# Reentrancy and STree

The `stree` data structure is **not reentrant** by design. When a handler calls `stree.add()`, we want to avoid confusing call chain behavior.

## The Reentrancy Problem

Consider this problematic code:

```js
import {stree} from '/lib/simpatico.js';

const s = stree({a: 0});

// Handler that tries to add to stree during its own execution
const reentrantHandler = {
    handle: (ctx, msg) => {
        s.add({a: 1, inner: true});  // ← REENTRANT CALL
        return [{a: 1}];
    }
};

s.add({handlers: {reentrantHandler}});
s.add({handler: 'reentrantHandler'});

log(s.residues());
```

The call chain becomes confusing:
```
s.add({handler: 'reentrantHandler'})
  └─ combine(ctx, {handler: 'reentrantHandler'})
      └─ reentrantHandler.handle()
          └─ s.add({a: 1, inner: true})  ← REENTRANT!
              └─ combine(ctx, {a: 1, inner: true})
                  └─ [returns with residue {a: 1, inner: true}]
          └─ return [{a: 1}]  ← This executes AFTER the inner add
              └─ combine(ctx, {a: 1})
                  └─ [returns with residue {a: 2}]
```

The inner `add()` completes **before** the outer handler finishes, which is counterintuitive and error-prone.

## Solution: Break the Call Chain

The solution is to **defer** the inner add to a future event loop iteration:

```js
import {stree} from '/lib/simpatico.js';

const s2 = stree({a: 0});

// Handler that defers the add
const deferredHandler = {
    handle: (ctx, msg) => {
        // Use setTimeout to break the call chain
        setTimeout(() => s2.add({a: 1, deferred: true}), 0);
        return [{a: 1}];
    }
};

s2.add({handlers: {deferredHandler}});
s2.add({handler: 'deferredHandler'});

log(s2.residues());
```

Now the call chains are separate:
```
Event Loop Iteration 1:
  s2.add({handler: 'deferredHandler'})
    └─ combine(ctx, {handler: 'deferredHandler'})
        └─ deferredHandler.handle()
            └─ setTimeout(...)  ← schedules future add
            └─ return [{a: 1}]
                └─ combine(ctx, {a: 1})
                    └─ [returns with residue {a: 1}]

Event Loop Iteration 2:
  [setTimeout callback]  ← NEW call chain root
    └─ s2.add({a: 1, deferred: true})
        └─ combine(ctx, {a: 1, deferred: true})
            └─ [returns with residue {a: 2, deferred: true}]
```

## Real-World Example: WebSocket in STree

The [stree-websocket implementation](/lab/websocket/stree-based/stree-websocket.js) uses this pattern:

```js
export const send = ({ws, remote}, {msg}) => {
  const msgString = JSON.stringify(msg);
  ws.send(msgString);

  // setTimeout prevents reentrance into stree.add()
  // This simulates the remote receiving the message asynchronously
  if (remote) setTimeout(() => remote.getLeaf().residue.ws.receive(msgString));

  return [];
};
```

The `setTimeout` ensures that when the remote receives the message, it happens in a **new call chain** rather than during the current `send` handler execution.

_________________________________________________________
# Practical Patterns

## Pattern 1: Immediate vs. Deferred Results

Handlers can return two types of results:

```js
///
// Immediate results - recombined synchronously
const immediateHandler = (ctx, msg) => [
    {a: 1},           // ← Immediate
    {b: 2},           // ← Immediate
    {handler: 'foo'}  // ← Immediate (triggers foo handler)
];

// Deferred results - scheduled for later
const deferredHandler = (ctx, msg) => {
    setTimeout(() => ctx.add({a: 1}), 0);  // ← Deferred
    queueMicrotask(() => ctx.add({b: 2})); // ← Deferred (sooner)
    return [];  // ← No immediate results
};
```

## Pattern 2: Async Handlers with Promises

When handlers need to do async work (crypto, network, etc.), they should:
1. Return immediate state updates (e.g., `{state: 'LOADING'}`)
2. Use `.then()` to schedule future updates

```js
///
// Example from the websocket stree implementation
export const register2 = ({publicKey, privateKey, conn}, {serverPublicKeyPem, t1}) => {
  const t2 = Date.now();
  const messageText = JSON.stringify({t1, t2, dt: t2-t1});

  // Start async work
  wcb.importPublicKeyPem(serverPublicKeyPem)
    .then(serverPublicKey => wcb.encryptTo({message, privateKey, publicKey: serverPublicKey}))
    .then(box => wcb.encodeHex(box))
    .then(encoded => {
        // Deferred update - new call chain root
        conn.addLeaf({handler: 'state', state2: 'RESPONDED'})
            .add({handler: 'send', msg: {handler: 'register3', cypherText: encoded}});
    })
    .catch(error => {
        // Deferred error handling
        conn.addLeaf({handler: 'state', state2: 'ERROR', error});
    });

  // Immediate update - synchronous return
  return [{handler: 'state', state2: 'COMPUTING', serverPublicKeyPem}];
};
```

The call chain structure:
```
Event Loop Iteration 1 (synchronous):
  conn.add({handler: 'register2', ...})
    └─ register2.handle()
        └─ wcb.importPublicKeyPem(...)  ← starts async work
        └─ return [{state2: 'COMPUTING'}]  ← immediate update
            └─ [returns]

Event Loop Iteration N (after crypto completes):
  [Promise.then callback]  ← NEW call chain root
    └─ conn.addLeaf({state2: 'RESPONDED'})
        └─ conn.add({handler: 'send', ...})
            └─ [returns]
```

## Pattern 3: Batching with Microtasks

Use microtasks to batch multiple synchronous updates:

```js
///
let pendingUpdates = [];
let scheduled = false;

function scheduleUpdate(update) {
    pendingUpdates.push(update);

    if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => {
            // Process all pending updates in one batch
            const batch = pendingUpdates;
            pendingUpdates = [];
            scheduled = false;

            processBatch(batch);
        });
    }
}

function processBatch(batch) {
    console.log('Processing batch:', batch);
}

// Multiple synchronous calls...
scheduleUpdate({a: 1});
scheduleUpdate({b: 2});
scheduleUpdate({c: 3});

// ...all processed together in one microtask
```

This is similar to how React batches state updates.

_________________________________________________________
# Visualization: Event Loop Phases

```js
// This code demonstrates the order of execution
const eventLog = [];

console.log('=== Start ===');
eventLog.push('1: sync');

setTimeout(() => eventLog.push('4: macrotask'), 0);

Promise.resolve().then(() => eventLog.push('3: microtask'));

queueMicrotask(() => eventLog.push('3: microtask (queue)'));

eventLog.push('2: sync');

console.log('=== End of synchronous code ===');

// At this point:
// - Call stack is empty
// - Microtask queue has 2 tasks
// - Macrotask queue has 1 task

// Event loop processes:
// 1. All microtasks (in order)
// 2. One macrotask
// 3. Repeat

setTimeout(() => {
    console.log(eventLog);
    // ['1: sync', '2: sync', '3: microtask', '3: microtask (queue)', '4: macrotask']
}, 10);
```

_________________________________________________________
# Summary

## Call Chain Spread
- **Synchronous**: Call chain spreads through direct function calls
- **Message Cascade**: Handlers trigger other handlers via `combine()`
- **All synchronous**: Happens in one event loop iteration

## Call Chain Termination
- **Natural**: Handler returns, no more messages to process
- **Intentional**: Use `setTimeout`, `queueMicrotask`, `Promise.then()`, or `requestAnimationFrame`

## Reentrancy Prevention
- **Problem**: Calling `stree.add()` from within a handler creates confusing execution order
- **Solution**: Defer the add using `setTimeout` or `Promise.then()`
- **Pattern**: Immediate results return synchronously, deferred results schedule future updates

## Event Loop Mechanics
```
┌─────────────────────────────┐
│   Execute Call Stack        │  ← Synchronous code
│   (synchronous code)        │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   Process ALL Microtasks    │  ← queueMicrotask, Promise.then
│   (until queue empty)       │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   Render (if browser)       │  ← requestAnimationFrame
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   Process ONE Macrotask     │  ← setTimeout, setInterval
└──────────┬──────────────────┘
           │
           └──────────────────────┐
                                  │
                                  ▼
                            (repeat)
```

## Key Takeaways

1. **Synchronous code** runs to completion before yielding to the event loop
2. **Microtasks** run before the next macrotask (good for batching)
3. **Macrotasks** run one at a time (good for breaking up work)
4. **Reentrancy** is avoided by deferring recursive calls to future iterations
5. **Async handlers** return immediate state, then schedule deferred updates via promises

This foundation enables building complex, reactive systems like `stree` that remain predictable and debuggable despite asynchronous operations.



