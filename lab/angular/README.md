# Angular & Tailwind Lab

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.2.2.

## Development server

`ng serve` still works, although you may have to modify `<base href=>` in `index.html`. 
Running in Simpatico requires this:

```bash
ng build --watch
```
Then navigate to http://localhost:8080/lab/angular/dist/angular/browser/
All of it's sub/resources will be cached as usual.

TODO: it would be nice to make that URL a bit nicer, e.g. map `dist/angular/browser` to `../../..`

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```
