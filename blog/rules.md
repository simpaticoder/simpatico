---
title: Simpatico Rules
date: 2026-11-23
description: The rules of simpatico development
---

1. Keep it minimal. Few or no dependencies.
2. Spend more time making md experiments than on the platform.
3. Always start in litmd.
4. Write libraries in litmd and export them statically.
5. Every md file needs front matter and a meaningful short name.
6. The file system is used for tags, but the mds are linear in time.

# Ideas

## Better library support
Libraries are different than random experiments. They have 3 phases: ideation, finalization, and tests.
In the ideation tests, litmd's default isolated module scripts are ideal. This allows exploration of
different paths. Finalization is the actual code of the library, potentially as separate code sections
that refer to each other. Tests can be used in both sections, but are only "canonical" for the finalized code.
The final phase is "export" which by default is dynamic, happening as part of the litmd to web resource
conversion process. However it can also be static, running a simpatico command line to produce a library js file.
This is handy if you want to export your library into something like npm. 

Some of the libraries _feed back_ into the server, but that's handled by static export. I'd like the site content to be more linear.

## Dynamic index

In the same way that individual md files are converted on the fly to web resources, so too should index files.
I've played around with statically generated indices and I don't like it.

## Describe the server
It has grown past a single file and there are many decisions that went into its making.
What about the loose dependencies? Why are they there?
