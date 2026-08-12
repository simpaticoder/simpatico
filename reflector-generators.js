export async function* httpEvents(server, protocol) {
  const queue = [];
  let wake;

  const onRequest = (request, response) => {
    queue.push({
      type: "request",
      protocol,
      request,
      response,
    });

    wake?.();
    wake = undefined;
  };

  server.on("request", onRequest);

  try {
    while (true) {
      if (!queue.length) {
        await new Promise((resolve) => {
          wake = resolve;
        });
      }

      while (queue.length) {
        yield queue.shift();
      }
    }
  } finally {
    server.off("request", onRequest);
  }
}

export async function* fileEvents(watcher) {
  const queue = [];
  let wake;

  const push = (type, fileName) => {
    queue.push({
      type,
      fileName,
    });

    wake?.();
    wake = undefined;
  };

  const listeners = {
    add: (fileName) => push("file-added", fileName),
    change: (fileName) => push("file-changed", fileName),
    unlink: (fileName) => push("file-removed", fileName),
    addDir: (fileName) => push("directory-added", fileName),
    unlinkDir: (fileName) => push("directory-removed", fileName),
  };

  for (const [event, listener] of Object.entries(listeners)) {
    watcher.on(event, listener);
  }

  try {
    while (true) {
      if (!queue.length) {
        await new Promise((resolve) => {
          wake = resolve;
        });
      }

      while (queue.length) {
        yield queue.shift();
      }
    }
  } finally {
    for (const [event, listener] of Object.entries(listeners)) {
      watcher.off(event, listener);
    }
  }
}

export async function* certificateEvents(watcher) {
  for await (const event of fileEvents(watcher)) {
    if (event.type === "file-changed" || event.type === "file-added") {
      yield {
        type: "certificate-changed",
        fileName: event.fileName,
      };
    }
  }
}

export async function* mergeEvents(...generators) {
  const iterators = generators.map((generator) =>
    generator[Symbol.asyncIterator](),
  );

  const pending = new Map();

  for (const iterator of iterators) {
    pending.set(iterator, iterator.next());
  }

  try {
    while (pending.size) {
      const entries = [...pending.entries()];

      const { iterator, result } = await Promise.race(
        entries.map(async ([iterator, promise]) => ({
          iterator,
          result: await promise,
        })),
      );

      pending.delete(iterator);

      if (!result.done) {
        yield result.value;
        pending.set(iterator, iterator.next());
      }
    }
  } finally {
    await Promise.all(
      [...pending.keys()].map((iterator) => iterator.return?.()),
    );
  }
}
