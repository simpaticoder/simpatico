# Simpatico
Simpatico is an npm package that exposes one executable and one module. The `simpatico` executable is a (fast, small, secure, low dependency, privacy respecting http and websocket) server. It can serve markdown, and supports [Let's Encrypt](https://letsencrypt.org/) for SSL/TLS. 

The `simpatico` **module** exposes a small set of isomorphic vanilla javascript libraries with no dependencies: utility functions `core`, a transducer function `combine`, a novel data structure `stree`, and a runtime type system called `friendly`. 

The module and utility are used to develop each other, but you can safely use one and ignore the other in your own packages.

# Server Installation
Prerequisites:
1. Linux-like OS (Linux, macOS, Windows WSL)
2. Node 17+
3. pnpm 10+ (Optional?)

> **Tip:** Install requirements with [mise](https://mise.jdx.dev/) with `curl https://mise.run | sh` and then `mise use node@latest pnpm@latest` within your project directory to easily meet the runtime requirements without affecting your global toolchain. Mise (pronounced 'meez') is a modern tool that replaces and improves many version managers like `nvm`, `rvm`, and `sdkman`.
> **Note** I have not done any testing with `npm` or `yarn` so YMMV with these package managers. 

```bash
alias p=pnpm
mkdir mywebsite && cd mywebsite
# mise use node pnpm
p init
p install simpatico
p simpatico # or `npx simpatico`
```
You may also run `simpatico` from your own `package.json` scripts:
```text
{ // mywebsite/package.json
  ...
  "scripts": {
    "start": "simpatico"
  },
  ...
}
```
Invoke this script with `pnpm start`. 

At this point you have a running simpatico server and can add/remove/modify files and they will be served.

> **Note:** These installation instructions use `pnpm` however they are equally valid for `npm` and `yarn`. Other node-like runtimes like `bun` or `deno` may also work, but this is untested. Simpatico uses `node` and `pnpm` for its development. 

# TLS/SSL - make https urls work

1. Create your own root CA 
2. Pick a domain-name, use the root CA to generate your own `<domain>.crt.pem` and `<domain>.key.pem` files 
3. Run `simpatico` with an argument that points to the generated certificate files
4. Install the root CA in all testing browsers on all devices (e.g. nav to `about:settings`, search `certificates`, then follow the UI to add `~/.ssh/RootCA`)

The `make-certs` script will generate the correct files and output a `simpatico` command line that will work for your mode of operation
(testing/production + privileged/unprivileged ports). Here is an example generating certs for domain `simpatico.localhost`:

```bash
 alias p=pnpm
 p make-certs simpatico.localhost
 # Lots of descriptive output describing what to do next..
 # ...run on the default unprivileged ports
 p simpatico '{"cert":"./simpatico.localhost.crt.pem","key":"./simpatico.localhost.key.pem", "useTls":true}'
```

## Privileged execution
`simpatico` can bind to ports < 1024 and drop privileges immediately if run as root via `sudo`.
Both `node` and `pnpm` must be available to root and on its path, which is non-interactive (so don't bother with `/root/.bashrc`)
Assuming you've installed `mise` as root, add its tools to the non-interactive root path like so:

```bash
sudo visudo
# Add mise/shims 
Defaults secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin:/root/.local/share/mise/shims"
```
Now execute as root, binding to privileged ports:

```bash
sudo pnpm simpatico '{"cert":"./simpatico.localhost.crt.pem","key":"./simpatico.localhost.key.pem", "useTls":true, "http":80, "https":443, "ws":443, "runAsUser":"alice"}'
```

> Domains ending in `.localhost` do not need an entry in `/etc/hosts` to be served locally. Other domains either need an entry or a static ip and dns entry in your router.
> Windows WSL2 users may need to connect the WSL loopback address to the external address: `netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=192.168.X.X`

> **Aside**: Why not just proxy behind `nginx` or `caddy`? You can. But you also have the option to run simpatico as a single stand-alone process,
> and I think that option is valuable. We may run `node` as root, but we mitigate that by dropping privileges asap. 
> We also do not want to run `mise` and `pnpm` as root, but again, we do so only briefly. 
> `apt install nginx` is highly trusted mainly because it is well-known, but not without (supply chain, operational) risk.
> A strong argument for the conventional proxy is it's enormous feature-set - nginx can serve many domains, for example, where simpatico cannot.
> Nginx is far more standards compliant; simpatico does the bare minimum HTTP/1.1.