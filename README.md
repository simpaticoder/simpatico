# Simpatico
The simpatico `server.js` is an http/https/websocket server. It can serve [literate markdown](/test/lit.md) without a build-step, supports [Let's Encrypt](https://letsencrypt.org/) for SSL/TLS, has privacy-preserving headers, and caches it's responses. It answers the question: what is the smallest most secure and privacy-preserving way to offer a fun, fast build-test-debug cycle for web experiments? It's kind of like [codepen.io](https://codepen.io) but where you own the files, use your own editor, can run it locally, can modify it to your taste, and even run it in production. Alternatively, it's a bit like React's [create-react-app](https://create-react-app.dev/) but without the build-step and much simpler, approachable code.

The `simpatico` **npm module** exposes a small set of isomorphic vanilla javascript libraries with no dependencies: utility functions [`core`](/test/core), a transducer function [`combine`](/test/combine), a novel multiverse data structure [`stree`](/test/stree), and a runtime type system called [`friendly`](/test/friendly).

# Server Installation

## Requirements

1. Linux-like OS (Linux, macOS, Windows WSL)
2. Node 17+
3. pnpm 10+ 

> **Tip:** Install requirements with [mise](https://mise.jdx.dev/) with `curl https://mise.run | sh` and then `mise use node@latest pnpm@latest` within your project directory to easily meet the runtime requirements without affecting your global toolchain. Mise (pronounced 'meez') is a modern tool that replaces and improves many version managers like `nvm`, `rvm`, and `sdkman`. No affiliation!
> **Note** `npm` and `yarn` *may* be supported in lieu of `pnpmp`, but untested.  
> **Note** Rather than cloning this repository, consider forking this repo and cloning the fork.

## Running in Development
```bash
git clone git@github.com:simpaticoder/simpatico.git
pnpm install
node server.js
```

At this point you have a running simpatico server and can add/remove/modify files and they will update without a server restart.
The main feature you get is a very fast [literate markdown](/test/lit.md) BTD loop.

### Development HTTPS

HTTPS is a requirement for any modern production server, and so you should use it for local testing as well. 
`make-certs.sh` is a helper script to generate a self-signed certificate for testing purposes. It does the following:

1. Create your own root CA 
2. Use the root CA to generate your own `<domain>.crt.pem` and `<domain>.key.pem` files 
3. Run `simpatico` with an argument that points to the generated certificate files
4. (only for non .localhost domains) Install the root CA in all testing browsers on all devices (e.g. nav to `about:settings`, search `certificates`, then follow the UI to add `~/.ssh/RootCA`)

The `make-certs` script will generate the correct files and output a `simpatico` command line that will work for your mode of operation
(testing/production + privileged/unprivileged ports). Here is an example generating certs for domain `simpatico.localhost`:

```bash
 alias p=pnpm
 p make-certs simpatico.localhost
 # Lots of descriptive output describing what to do next..
 # ...run on the default unprivileged ports
 p simpatico '{"cert":"./simpatico.localhost.crt.pem","key":"./simpatico.localhost.key.pem", "useTls":true}'
```

## Running in Production

**Important note** as of 8/25/2025 dropping process privileges is not functional.
It's not clear why but until it is, you must run `simpatico` as root.
There is a test script, `test/test-suid.js' that reproduces the issue.

### Privileged Ports

`simpatico` can bind to ports < 1024 and drop privileges immediately if run as root via `sudo`.
Both `node` and `pnpm` must be available to root and on its path, which is non-interactive (so don't bother with `/root/.bashrc`)
Assuming you've installed `mise` as root, add its tools to the non-interactive root path like so:

```bash
sudo visudo
# Add mise/shims 
Defaults secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin:/root/.local/share/mise/shims"
```
Now execute as root, binding to privileged ports, dropping privileges to user `alice`, and serving on https:

```bash
sudo pnpm simpatico '{"cert":"./simpatico.localhost.crt.pem","key":"./simpatico.localhost.key.pem", "useTls":true, "http":80, "https":443, "ws":443, "runAsUser":"alice"}'
```

We may run `node` as root, but we mitigate that by dropping privileges asap, just like other production servers.
We also do not want to run `mise` and `pnpm` as root, but again, we do so only briefly.
`apt install nginx` is highly trusted mainly because it is well-known, but has it's own (supply chain, operational) risk.


### Networking and DNS
Domains ending in `.localhost` do not need an entry in `/etc/hosts` to be served locally. Other domains either need an entry or a static ip and dns entry in your router. 

Windows WSL2 users may need to connect the WSL loopback address to the external address: `netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=192.168.X.X`

### Using a proxy server
Why not just proxy behind `nginx` or `caddy`? You can. It is the industry standard and in some ways simplifies running `simpatico` (no need to run with sudo or with TLS).
This is absolutely necessary if you want to host multiple domains.
For beginners, running simpatico as a single stand-alone process makes it simpler to get started, especially in the mental model of a single process.

A strong argument for the conventional proxy is it's enormous feature-set - nginx can serve many domains, for example, where simpatico cannot.
Nginx is far more standards compliant; simpatico does the bare minimum HTTP/1.1 and does not support all MIME types and has inflexible headers.
As with all software tools, there are tradeoffs.