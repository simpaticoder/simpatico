# Print a staircase coding challenge

Basically they wanted you to write a function that print out something like this for `n=4`:

```text
   #
  ##
 ###
####
```

It was simple to solve but I initially forgot to lose the initial space!

```js
function staircase(n) {
    const result = [];
    let level;
    for (let i = 0; i < n; i++){
        level = [];
        result.push(level);
        for (let j = 0; j <= n; j++){
            level.push((j < n - i) ? ' ' : '#');
        }
        level.shift();
    }
    const out = result.map(level => level.join('')).join('\n');
    console.log(out);
}
```

# Compute partial sums
This was specified as adding all the elements of an array except one, and finding the smallest and largest such sum.
My solution computed the total sum of the array, mapped the array by subtracting that elt from the sum, and sorting.
Got it on the first try, too!

```js
function miniMaxSum(arr) {
    const sum = arr.reduce((a,b) => a+b);
    const s = arr.map(a => sum - a);
    s.sort();
    console.log(s.shift() + ' ' + s.pop());
}

```