#Notes

## 9-4-2025 
For a variety of reasons I picked Angular (20) to play around with a real UI framework for Simpatico (specifically, the Simpatico Shell, which is first and foremost a chat client). I used AI also, in part to test out IntelliJ's AI integration - which is pretty bad TBH. It's using ChatGPT-5 and it's not clear what context its sending, and the code it writes didn't compile and required significant changes to both compile and avoid deprecation warnings...But I digress.

Thoughts in random order
1. Map the build to a nicer [URL](http://localhost:8080/lab/angular/dist/angular/browser/). For now I'm okay making a one-off change in `server.js`. I'd also like to print out the working URL when code changes, because currently chokidar only detects source code files and prints out the wrong URL.
2. TypeScript is *so nice*. Especially for the chat application, where there are specific structs floating around that must match. TypeScript is great for this. Of course, I should be using `friendly` but haven't started doing that. Would be a good comparison. 
3. vite is so incredibly fast, even `ng build --watch` is instantaneous.
4. The Angular bundles are suprisingly small, even the tailwind css bundle is relatively small. 110kb over the wire is still huge compared to most resources simpatico currently serves, but it's 10x less than I expected.
5. Eventually I will want to import some classes into angular, and for that purpose I'll need to export at least `SecureWebSocketClient` and maybe `crypto`. It's a bit of friction to serve the libs one way (directly from Simpatico) and then have to bundle them in another way.
6. I need to make a package script to build angular on install after deploy if I want to see this in production. I can do it manually for now, but I know I'll want something convenient.
7. IntelliJ's ability to execute bash commands in markdown is surprisingly handy. A nice flourish on a good tool. It's also nice variant of literate markdown. The only downside I see is that it doesn't leave behind a run configuration (although I can see how that might get annoying, especially for one-offs).
8. The code the AI generated has good bones, UI-wise. It even made some useful classes around storing contacts and messages in localStorage. It even had some good ideas about the message format (an id: UUID and sentAt: date.now()). However, all of its socket assumptions are wrong and need to be reworked. It assumes one websockt per client, but in fact I plan to multiplex everything over a single socket. 

In other news I have long known and worked with callbacks and Promises + async/await in JavaScript, and once (professionally) with RxJs in TypeScript (which I really didn't like). However,I recently became aware of [Effect](https://effect.website/) which looks interesting. And of course Angular has `signal()` and React has `hooks` like `useState() useMemo() useEffect()`. So many solutions to the same problem exists. That probably means that programmers haven't really figured out a good solution to "reactivity." 

## 9-5-2025

So there are 3 big problems with the setup right now, and they are somewhat related:
1. If you refresh the page within the Angular router, you get a 404. That's because the router path isn't "real" in the sense that it doesn't map to a resource. On the file-system, it maps back to the SPA index.html, and then the client routes to the path.
2. The URL for the angular build is long and nasty. I'd like to make it shorter, like `/angular`.
3. One of Simpatico's nice features is that it shows you the last edited file as a URL you can click to check it out. I designed this assuming you'd want to access that resource. But with angular, the url and resource are decoupled.

The obvious place to start is with `server.js` and modify `getCandidateFileName()` to know about Angular. Anything that starts with /angular and ends in a file extension we can map to dist directory. This solves 1 and 2. Will need to modify `<base href` to be `/angular/`.

To solve 3, we do the inverse - anything that changes in the dist directory will output the `/angular` url. For extra-credit, we could try to parse `routes.ts` and map a changed source file to a specific route. That seems complicated so I'll leave it for now.
