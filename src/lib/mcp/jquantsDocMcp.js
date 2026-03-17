import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

export async function connectJQuantsDocMcp({ cwd = process.cwd(), command } = {}) {
  return new JQuantsDocMcpClient({
    cwd,
    command: command ?? resolveMcpCommand(cwd)
  });
}

export function resolveMcpCommand(cwd = process.cwd()) {
  const local = resolve(cwd, ".venv", "Scripts", "j-quants-doc-mcp.exe");

  if (existsSync(local)) {
    return local;
  }

  return "j-quants-doc-mcp";
}

export function resolveLocalPythonExecutable(cwd = process.cwd()) {
  const local = resolve(cwd, ".venv", "Scripts", "python.exe");

  if (existsSync(local)) {
    return local;
  }

  return "python";
}

export class JQuantsDocMcpClient {
  constructor({ cwd, command }) {
    this.cwd = cwd;
    this.command = command;
    this.serverInfo = null;
  }

  getServerInfo() {
    return this.serverInfo;
  }

  async listTools() {
    const response = await runBridge({
      cwd: this.cwd,
      payload: {
        action: "tools",
        command: this.command,
        args: []
      }
    });

    this.serverInfo = response.serverInfo ?? this.serverInfo;
    return response.tools ?? [];
  }

  async searchEndpoints(keyword, category) {
    return this.callTool("search_endpoints", compact({ keyword, category }));
  }

  async describeEndpoint(endpointName) {
    return this.callTool("describe_endpoint", {
      endpoint_name: endpointName
    });
  }

  async generateSampleCode(endpointName, params) {
    return this.callTool("generate_sample_code", {
      endpoint_name: endpointName,
      language: "python",
      params: compact(params)
    });
  }

  async answerQuestion(question) {
    return this.callTool("answer_question", { question });
  }

  async callTool(name, args = {}) {
    const response = await runBridge({
      cwd: this.cwd,
      payload: {
        action: "call_tool",
        command: this.command,
        args: [],
        name,
        arguments: args
      }
    });

    this.serverInfo = response.serverInfo ?? this.serverInfo;
    return normalizeToolResult(response.result);
  }

  async close() {
    return undefined;
  }
}

export function normalizeToolResult(result) {
  const text =
    result?.text?.trim() ||
    (result?.content ?? [])
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim() ||
    null;

  const data = result?.data ?? result?.structuredContent ?? tryParseJson(text) ?? null;

  return {
    raw: result,
    text,
    data,
    isError: result?.isError ?? false
  };
}

export function extractSampleCode(result) {
  const candidate =
    result?.data?.code ??
    result?.data?.sample_code ??
    result?.data?.sampleCode ??
    result?.text ??
    "";

  return stripCodeFences(candidate).trim();
}

export function preparePythonSampleCode(sampleCode, endpointName, params = {}) {
  const safeName = endpointName.replaceAll("-", "_");
  let code = stripCodeFences(sampleCode).replaceAll(endpointName, safeName);

  code = code.replace(/\nif __name__ == "__main__":[\s\S]*$/u, "\n").trimEnd();

  const callableName = code.includes(`def ${safeName}_all(`) ? `${safeName}_all` : safeName;
  const lines = [];

  if (params.code) {
    lines.push(`        code=${JSON.stringify(params.code)},`);
  }

  if (params.date) {
    lines.push(`        date=${JSON.stringify(params.date)},`);
  }

  if (params.from) {
    lines.push(`        from_=${JSON.stringify(params.from)},`);
  }

  if (params.to) {
    lines.push(`        to_=${JSON.stringify(params.to)},`);
  }

  const invocation = lines.length > 0 ? `\n${lines.join("\n")}` : "";

  return `${code}\n\nif __name__ == "__main__":\n    import json\n    api_key = os.getenv("JQUANTS_API_KEY")\n    if not api_key:\n        raise ValueError("JQUANTS_API_KEY is required")\n    result = ${callableName}(\n        api_key=api_key,${invocation}\n    )\n    print(json.dumps(result, ensure_ascii=False))\n`;
}

export function stripCodeFences(value) {
  if (typeof value !== "string") {
    return "";
  }

  const fenced = /^```[a-z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/iu.exec(value.trim());

  return fenced ? fenced[1] : value;
}

async function runBridge({ cwd, payload }) {
  const command = resolveLocalPythonExecutable(cwd);
  const bridgePath = resolve(cwd, "src", "lib", "mcp", "bridge.py");
  const input = JSON.stringify(payload);

  const result = await runProcess(command, [bridgePath], {
    cwd,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    },
    input
  });

  return JSON.parse(result.stdout.trim());
}

function runProcess(command, args, { cwd, env, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `MCP bridge failed with exit code ${code}.\nSTDOUT:\n${stdout || "<empty>"}\nSTDERR:\n${stderr || "<empty>"}`
        )
      );
    });

    child.stdin.end(input);
  });
}

function tryParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function compact(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}