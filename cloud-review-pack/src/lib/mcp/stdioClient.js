import { spawn } from "node:child_process";

export class StdioMcpClient {
  constructor({
    command,
    args = [],
    cwd = process.cwd(),
    env = process.env,
    protocolVersion,
    clientInfo,
    defaultTimeoutMs = 30_000
  }) {
    if (!command) {
      throw new Error("An MCP server command is required.");
    }

    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.protocolVersion = protocolVersion;
    this.clientInfo = clientInfo;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.process = null;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.serverInfo = null;
  }

  async connect() {
    if (this.process) {
      return {
        serverInfo: this.serverInfo
      };
    }

    this.process = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true
    });

    this.process.on("error", (error) => {
      this.rejectAll(error);
    });

    this.process.on("exit", (code, signal) => {
      if (this.pending.size === 0) {
        return;
      }

      const reason = new Error(
        `MCP server exited before completing pending requests (code=${code}, signal=${signal ?? "none"}).`
      );
      this.rejectAll(reason);
    });

    this.process.stdout.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainBuffer();
    });

    const initialize = await this.request("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: this.clientInfo
    });

    this.serverInfo = initialize.serverInfo ?? null;
    this.notify("notifications/initialized", {});

    return initialize;
  }

  async request(method, params = {}, { timeoutMs = this.defaultTimeoutMs } = {}) {
    if (!this.process) {
      throw new Error("MCP server is not connected.");
    }

    const id = this.nextId;
    this.nextId += 1;

    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });

      this.write({
        jsonrpc: "2.0",
        id,
        method,
        params
      });
    });

    if (response.error) {
      throw new Error(`MCP request failed for ${method}: ${response.error.message}`);
    }

    return response.result;
  }

  notify(method, params = {}) {
    if (!this.process) {
      throw new Error("MCP server is not connected.");
    }

    this.write({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  async close() {
    if (!this.process) {
      return;
    }

    const processRef = this.process;
    this.process = null;
    processRef.stdin.end();

    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        processRef.kill();
        resolve();
      }, 1_000);

      processRef.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  write(message) {
    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
    this.process.stdin.write(header + json);
  }

  drainBuffer() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const lengthMatch = /Content-Length:\s*(\d+)/iu.exec(header);

      if (!lengthMatch) {
        throw new Error("Received MCP message without Content-Length header.");
      }

      const bodyLength = Number(lengthMatch[1]);
      const messageEnd = headerEnd + 4 + bodyLength;

      if (this.buffer.length < messageEnd) {
        return;
      }

      const body = this.buffer.slice(headerEnd + 4, messageEnd).toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);

      const message = JSON.parse(body);
      const resolver = this.pending.get(message.id);

      if (resolver) {
        this.pending.delete(message.id);
        resolver.resolve(message);
      }
    }
  }

  rejectAll(error) {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      pending.reject(error);
    }
  }
}