# Git

## Line endings

```bash
# Windows: checkout converts LF→CRLF, commit converts CRLF→LF
git config --global core.autocrlf true

# Unix: commit converts CRLF→LF, checkout untouched
git config --global core.autocrlf input

# No conversion
git config --global core.autocrlf false
```

## Identity

```bash
git config user.name "Simpaticoder"
git config user.email "hello@simpatico.io"
```

> Without `--global` these apply only to the current repository.
