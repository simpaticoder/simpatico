# Simpatico
Simpatico is an npm package that exposes one executable utility and a module. The executable a fast, small, secure, privacy respecting http and websocket server called `simpatico`. The module `simpatico` exposes a small set of isometric vanilla javascript libraries with no dependencies: utility functions `core`, a transducer function `combine`, a data structure `stree`, and a runtime type system called `friendly`. The module and utility are used to develop each other, but you can safely use one and ignore the other.

# Installation
Prerequisites:
1. Linux-like OS (Linux, macOS, Windows WSL)
2. Node 17+
3. pnpm 10+ (Optional)

> **Tip:** Install requirements with [mise](https://mise.jdx.dev/) with `curl https://mise.run | sh` and then `mise use node@latest pnpm@latest` within your project directory to easily meet the runtime requirements without affecting your global toolchain. Mise (pronounced 'meez') is a modern tool that replaces and improves many version managers like `nvm`, `rvm`, and `sdkman`.

```bash
mkdir mywebsite && cd mywebsite
# mise use node@latest pnpm@latest
npm init
npm add @simpaticoder/simpatico
npm install
npx simpatico
```
Additionally you may run `simpatico` from your own `package.json` scripts instead of with `npx simpatico`:
```json
{ //package.json
  ...
  "scripts": {
    "start": "simpatico"
  },
  ...
}
```
Invoke this script with `npm start`. At this point you can add/remove/modify ordinary website resources and they will be picked up and served by the server. Html and markdown are supported, along with the most common subresource types like css and various image formats.

> **Note:** These instructions use `npm` however they are equally valid for `pnpm` and `yarn`. Other node-like runtimes like `bun` or `deno` may also work, but this is untested. Simpatico uses `node` and `pnpm` for its development. 

## Configuration
The default configuration is sufficient for local testing and development. To 