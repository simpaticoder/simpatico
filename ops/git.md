```git config --global core.autocrlf true```

  1 true: On Windows, converts LF to CRLF when checking out, and CRLF to LF when committing. Ensures developers don’t get stray Unix-style line endings on Windows, but the repository stores files with LF endings.
  2 input: On Unix-like systems, converts CRLF to LF when committing, but does not modify files when checking out. Good for Unix projects where you want commits to stay LF, even if a file accidentally gets CRLFs.
  3 false: No conversion performed either way. Files go in and out as they appear on disk. Use this if you want to keep line endings untouched, but it can lead to inconsistency, especially in cross-platform projects.

```
# without --global will only set for current repo
git config user.name "Simpaticoder"
git config user.email "hello@simpatico.io"
```