# Source Map Test

This is a test file to verify source mapping works.

```js
// This is line 6 in the markdown
const x = 1;
const y = 2;
// This should throw an error on line 10
as.equals(5, x + y);
```

The error above should report line 10 in the markdown file, not some random line in the generated HTML.

---

# Source Map Implementation for Litmd - Continuation Prompt

## Context
I want to continue work on adding source map support to the litmd processor in Simpatico to get better line numbers when errors happen in markdown files.

## Problem Statement
When litmd processes markdown files with JavaScript code blocks, errors point to the wrong line numbers. For example, in `lab/stree-2.md`, an error on line 119 of the markdown file shows up as line 324 in the generated HTML because:
1. Code blocks are extracted from markdown
2. Default imports are prepended (3 lines)
3. HTML header is added (~100+ lines)
4. Everything is wrapped in `<script>` tags

## What Has Been Done So Far

### Implementation Approach
Instead of generating full source maps (complex for discrete code blocks), I implemented a simpler custom solution using data attributes and error rewriting.

### Files Modified

#### 1. `lib/litmd.js`
- **Added `findCodeBlocks()` function** (lines 46-86): Parses markdown to extract code blocks with their line numbers, types, and content
- **Modified `buildHtmlFromLiterateMarkdown()`** (lines 96-134): Extracts code blocks before conversion and passes them to the converter
- **Modified `createCodePassThroughExtension()`** (lines 189-243):
  - Matches code blocks to their source information
  - Adds data attributes to generated `<script>` tags: `data-source-file`, `data-source-line`, `data-import-offset`
  - Wraps JavaScript code execution in try/finally block that sets `window.__litmdCurrentScript` context

#### 2. `lib/litmd-header.js`
- **Added source map support** (lines 6-73):
  - Overrides `Error` constructor to capture current script context
  - Overrides `console.error` to rewrite stack traces
  - Adds global error handler to display source-mapped locations
  - Rewrites stack trace lines from `file.html:324:4` to `file.md:119:4`

#### 3. `lab/test-sourcemap.md` (new file)
- Simple test file to verify source mapping works

### How It Works
1. `findCodeBlocks()` scans markdown and records each code block's position
2. Generated `<script>` tags include data attributes with source file and line info
3. JavaScript code is wrapped to set `window.__litmdCurrentScript` before execution
4. Overridden `Error` constructor captures this context
5. When errors are logged, `console.error` rewrites stack traces to show original line numbers

## Current Issue
The implementation is complete but **not working correctly**. Getting this error:
```
Uncaught SyntaxError: Unexpected token '*' (at stree-2.md:116:8)
```

This suggests the source mapping is partially working (it's showing `stree-2.md` instead of the HTML file), but there may be issues with:
- The line number calculation/mapping logic
- How the code wrapping interacts with module imports
- The `findCodeBlocks()` function's line counting
- The matching logic between code blocks and generated HTML

## Next Steps to Debug
1. Check the generated HTML for `lab/stree-2.md` to see what the actual script content looks like
2. Verify the `data-source-line` attributes are correct
3. Check if the wrapping code is causing syntax issues with imports
4. Test with simpler examples in `lab/test-sourcemap.md`
5. Add debug logging to see what line numbers are being calculated
6. Consider if the import offset calculation is correct (currently hardcoded to 3)

## Testing
Server can be started with:
```bash
node server.js
```

Then access:
- `http://localhost:8080/lab/test-sourcemap.md` - Simple test case
- `http://localhost:8080/lab/stree-2.md` - Original problematic file

To inspect generated HTML:
```bash
curl -s http://localhost:8080/lab/stree-2.md | gunzip > /tmp/output.html
```

## Key Code Locations
- Source map logic: `lib/litmd.js` lines 46-86, 189-243
- Error handler: `lib/litmd-header.js` lines 6-73
- Test file: `lab/test-sourcemap.md`
