@simpaticoder 2025

# A string coding challenge 

Got an challenge question today that asked me:

>write an algorithm that takes two strings and returns the indices of the first string that can be removed such that it is equal to the second string. The strings always differ in length by 1. If they never match return `[-1]`

The most straightforward idea is to break the strings into characters and then do a comparison of each character, skipping over an index in the longer string (`str1`). This is solution 1. 

Things got interesting when they required it to be high-performing code. I managed to make it linear time in solution 2.

## Setup and tests
I am by no means a "TDD" guy, but I do like to write tests, especially for little puzzles like this. I find it helps me understand the problem boundary much better. 
It's also a huge help to work with my tools rather than theirs, those strange, quirky, feature-poor web-based coding tools.

```js
window.tests = [
    ["foobars", "barfoo", [-1]],    // these never match
    ["a", "", [0]],                 // an edge case
    ["aaa", "aa", [0, 1, 2]],       // a run from start to finish
    ["baabb", "babb", [1,2]],       // a middle run
]
```
## Solution 0 - Simplest, Slowest, Slice
This is the simplest solution, but it's memory inefficient. `slice()` creates a new string, and so does `+` concat.

```js
function computeIndices(str1, str2) {
    if (str1.length !== str2.length + 1) throw 'invalid input';
    let result = [];
    for (let i = 0; i < str1.length; i++) {
        // Remove character at index i from str1
        if (str1.slice(0, i) + str1.slice(i + 1) === str2) {
            result.push(i);
        }
    }
    return result.length ? result : [-1];
}
window.tests.forEach(([str1, str2, result], i)=>{
    log("soln 0", i, str1, str2, result, computeIndices(str1, str2))
    as.equals(result, computeIndices(str1, str2), str1);
})

```
## Solution 1 - Fast Fiddly indices
This may be fast enough, and may be what the question was looking for. In particular it's memory efficient and avoids making new strings. It is fiddly with indices which interviewers tend to like: 

```js
function computeIndices(str1, str2) {
    as.str(str1); as.str(str2); 
    as.equals(str1.length-1, str2.length);
    
    const result = [];
    // Loop over the longer array, mask the ith character, and check for equality.
    for (let i = 0; i < str1.length; i++){
        let matches = true;
        for (let j = 0; j < str2.length; j++) {
            // The indices align differently before and after i
            if (str1[(j < i) ? j : j+1] !== str2[j]) {
                matches = false;
                break;
            }
        }
        if (matches) result.push(i);
    }
    return result.length === 0 ? [-1] : result;
}

// Now run the tests
window.tests.forEach(([str1, str2, result], i)=>{
    log("soln 1", i, str1, str2, result, computeIndices(str1, str2))
    as.equals(result, computeIndices(str1, str2), str1);
 })
```
## Solution 2 - Linear insight logic
Here is my best performing solution informed by the insight that only runs of the same characters can result in more than one index returned (proof?). We use this fact to avoid even the (relatively fast) O(n^2) comparisons required by **Solution 1**. In the case where the strings match all the way, it makes sense to assume that the extra letter is at the end of str1. However, consider "aaa" and "aa". The answer is `[0, 1, 2]` not `[2]`. `baaa` and `baa` are similar. Not that `baab` and `baa` is indeed `[3]`.

```js
function computeIndices(str1, str2) {
    as.str(str1); as.str(str2); 
    as.equals(str1.length-1, str2.length);
    
    const n = str2.length;
    let i = 0;
    // Find first mismatch
    while (i < n && str1[i] === str2[i]) i++;
    
    // Check if removing str1[i] matches the rest
    for (let j = i; j < n; j++) {
        if (str1[j+1] !== str2[j]) return [-1];
    }
    
    // We know removing ith char will work; now check for runs. Use unshift to put elts at the beginning of the array.
    let result = [];
    let char = str1[i];
    while (i >= 0 && str1[i] === char) {
        result.unshift(i);
        i--;
    }
    return result;
}
window.tests.forEach(([str1, str2, result], i)=>{
    log("soln2", i, str1, str2, result, computeIndices(str1, str2))
    as.equals(result, computeIndices(str1, str2), str1);
})
```

## Conclusion
It's a so-so question, but it's a little too low-level for my taste. It's pretty rare to do character-level work on strings, and many programmers might not have that knowledge handy. For example, even I momentarily forgot that you can do array access in strings in JavaScript and my first solutions had unnecessary code like `const arr1 = str1.split("")`. I think also certain constructs like `while` loops tend to get dusty in a professional programmer's work - in part because we use abstractions that make them unneeded. So they aren't really comfortable to work with, especially because they often come with subtle off-by-one caveats. Same for functions like `unshift()` which is a js builtin that avoids `push()` then `reverse()`, but which I couldn't remember. The web UI wasn't going to help me remember either, and if code completion in a browser console is cheating, then I'm a cheater. 

It *feels* like this algorithm is wanting the second solution with its fiddly indices. Maybe they know about the third solution and it's the most desirable? I'm really not a fan of this kind of puzzle; it is, at best, a good warm-up for later problems, making you aware of the trade-offs of online hacker interviews.