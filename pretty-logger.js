import {formatBytes, formatDuration, getStatusColor} from "./reflector-core.js";

export default class PrettyLogger {
  constructor(options = {}) {
    this.options = {
      color: true,
      showUserAgent: false,
      showFileName: false,
      ...options,
    };

    this.groups = new Map();
  }

  log(event) {
    switch (event.type) {
      case "resource-group-start":
        this.startGroup(event);
        break;

      case "http-request":
        this.request(event);
        break;

      case "resource-group-end":
        this.endGroup(event);
        break;

      default:
        this.generic(event);
    }
  }

  startGroup(event) {
    this.groups.set(event.requestId, {
      ...event,
      requests: [],
    });

    const time = event.timestamp.slice(11, 23);

    this.write(`${time}  ${event.method.padEnd(4)} ${event.url}`);
  }

  request(event) {
    const group = event.parentRequestId
      ? this.groups.get(event.parentRequestId)
      : this.groups.get(event.requestId);

    if (group) {
      group.requests.push(event);

      if (event.parentRequestId) {
        return;
      }
    }

    if (!event.parentRequestId) {
      this.writeRequest(event);
    }
  }

  endGroup(event) {
    const group = this.groups.get(event.requestId);

    if (!group) return;

    for (const request of group.requests) {
      if (request.parentRequestId) {
        this.writeSubresource(request);
      }
    }

    this.groups.delete(event.requestId);
  }

  writeRequest(event) {
    const status = this.colorize(
      getStatusColor(event.status),
      String(event.status),
    );

    this.write(
      `        ${status}  ` +
        `${formatBytes(event.bytes).padStart(9)}  ` +
        `${formatDuration(event.duration)}`,
    );
  }

  writeSubresource(event) {
    const status = this.colorize(
      getStatusColor(event.status),
      String(event.status),
    );

    this.write(
      `  ├─ ${event.url.padEnd(42)} ` +
        `${status}  ` +
        `${formatBytes(event.bytes).padStart(9)}  ` +
        `${formatDuration(event.duration)}`,
    );
  }

  generic(event) {
    this.write(`${event.timestamp} ${event.type}`);
  }

  write(line) {
    this.options.output?.log?.(line);
  }

  colorize(color, text) {
    if (!this.options.color) return text;

    const colors = {
      red: "\x1b[31m",
      yellow: "\x1b[33m",
      green: "\x1b[32m",
      cyan: "\x1b[36m",
      gray: "\x1b[90m",
      reset: "\x1b[0m",
    };

    return `${colors[color] || ""}${text}${colors.reset}`;
  }
}
