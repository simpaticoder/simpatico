---
title: Plans for Simpatico
date: 2026-01-30
description: Future directions - litmd improvements, multi-site hosting, and browser-to-browser social networking
---

Although there is a TODO.md in the root of the project, this file is a little more free-form.
I'd like to render front-matter a little better, which is an adjustment to litmd, although currently it will only affect the blog.
Litmd is also ripe for completion, in that I'd like to derive the libraries from the litmd files themselves.
The litmd format could use hints from front-matter, like whether to start off with code expanded or not.
It would also be nice to have user's choice about expansion retained in local storage.

There's a lot to do to make the Simpatico website itself a bit more presentable. I still want to keep it minimalist,
but even within that constraint I think it can be greatly improved in terms of design. I'm hopeful to learn
(and relearn) modern CSS tricks that make bloated libraries unnecessary.

I'm excited about the potential use of Simpatico to serve more than one website. This avoids the need for another process
like nginx or caddy if you want to host more than one site on your server. This might make it more attractive to the kind of
technology-forward person that might be interested in installing it. Speaking of which, I'm also excited about
the much improved scripts around preparing a VPS and deploying/upgrading Simpatico. It's a rare thing for a piece of
software to be both simple and convenient to use. It feels like I'm hitting a sweet spot there.

So, these are things that involve Simpatico as a server, as platform on which to write other software.
But the real purpose of Simpatico was and is to be a social tool that connects browsers together in real-time.
That's why I haven't bothered with a database. The sum of all browsers will be a database. There are lots of
applications with an infrastructure like that. The first thing that comes to mind is chat - obvious, but powerful
and in fact quite general since you can phrase any other software interaction as a kind of structured chat.
Of _those_ applications, I think the best option is a social network. Imagine a social network that is not a silo,
where you can log in with your browser and your friends can log in with their browser. No servers, no databases,
just a network of browsers. The only server is the Simpatico server, which is just a bootstrap to get you into
the network. The only database is the stree in your browser. The only data is the data you enter. The only
identity is the public key of your browser. The only authentication is the private key of your browser. The
only authorization is the permission of your friends. The only encryption is the encryption provided by the
browser itself. The only code is the code you write. The only interface is the interface you design. The only
constraint is the constraint of the network itself.

And of course, there is my continued attempt to visualize and make sense of the programming world through the stree.
There are some seemingly small applications that I think would be an important stepping stone to proving its general
use. In particular, modeling and control of a websocket. This would stress the stree in a way that is similar to
how a reactive UI would stress it, particularly in the presence of side-effects. (I just realized that
programmers who don't like the stree would call it a "stress tree". Haha.)

