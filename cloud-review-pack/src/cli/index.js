import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import { loadConfig } from "../lib/config.js";
import { JQuantsClient } from "../lib/jquants/client.js";
import { getDailyQuotes, getListedInfo, toJQuantsDate } from "../lib/jquants/marketData.js";
import { runBacktest } from "../backtest/engine.js";
import { createSmaCrossStrategy } from "../backtest/strategies/smaCross.js";
import {
  connectJQuantsDocMcp,
  extractSampleCode,
  preparePythonSampleCode,
  resolveLocalPythonExecutable
} from "../lib/mcp/jquantsDocMcp.js";

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const [scope, command] = positional;

  if (!scope || !command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();

  if (scope === "mcp") {
    await handleMcpCommand(command, options);
    return;
  }

  const client = new JQuantsClient(config.jquants);

  if (scope === "jquants" && command === "ping") {
    const result = await getListedInfo(client, {
      code: options.code ?? "7203"
    });

    printJson({
      ok: true,
      authMode: client.getAuthMode(),
      path: result.path,
      sample: result.items[0] ?? null
    });
    return;
  }

  if (scope === "jquants" && command === "quotes") {
    requireOption(options, "code");

    const result = await getDailyQuotes(client, {
      code: options.code,
      from: options.from,
      to: options.to,
      date: options.date
    });

    const limit = parseInteger(options.limit, 5);

    printJson({
      ok: true,
      authMode: client.getAuthMode(),
      path: result.path,
      count: result.items.length,
      sample: result.items.slice(0, limit)
    });
    return;
  }

  if (scope === "backtest" && command === "sma") {
    requireOption(options, "code");
    requireOption(options, "from");
    requireOption(options, "to");

    const shortWindow = parseInteger(options.short, 5);
    const longWindow = parseInteger(options.long, 20);
    const initialCash = parseInteger(options.cash, config.backtest.initialCash);

    const marketData = await getDailyQuotes(client, {
      code: options.code,
      from: options.from,
      to: options.to
    });

    if (marketData.items.length < longWindow + 1) {
      throw new Error(
        `Not enough bars for SMA(${shortWindow}, ${longWindow}). Received ${marketData.items.length} bars.`
      );
    }

    const strategy = createSmaCrossStrategy({
      shortWindow,
      longWindow
    });

    const report = runBacktest({
      bars: marketData.items,
      strategy,
      initialCash
    });

    printJson({
      ok: true,
      authMode: client.getAuthMode(),
      path: marketData.path,
      code: options.code,
      bars: marketData.items.length,
      strategy: report.strategy,
      metrics: formatMetrics(report.metrics),
      recentTrades: report.trades.slice(-5)
    });
    return;
  }

  throw new Error(`Unknown command: ${scope} ${command}`);
}

async function handleMcpCommand(command, options) {
  const mcp = await connectJQuantsDocMcp();

  try {
    if (command === "tools") {
      const tools = await mcp.listTools();

      printJson({
        ok: true,
        serverInfo: mcp.getServerInfo(),
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title ?? null
        }))
      });
      return;
    }

    if (command === "search") {
      requireOption(options, "keyword");
      const result = await mcp.searchEndpoints(options.keyword, options.category);

      printJson({
        ok: true,
        serverInfo: mcp.getServerInfo(),
        result: result.data ?? result.text
      });
      return;
    }

    if (command === "describe") {
      requireOption(options, "endpoint");
      const result = await mcp.describeEndpoint(options.endpoint);

      printJson({
        ok: true,
        serverInfo: mcp.getServerInfo(),
        endpoint: options.endpoint,
        result: result.data ?? result.text
      });
      return;
    }

    if (command === "sample-code") {
      requireOption(options, "endpoint");
      const result = await mcp.generateSampleCode(options.endpoint, buildEndpointParams(options));
      const sampleCode = extractSampleCode(result);

      printJson({
        ok: true,
        serverInfo: mcp.getServerInfo(),
        endpoint: options.endpoint,
        sampleCode
      });
      return;
    }

    if (command === "fetch-bars") {
      requireOption(options, "code");
      requireOption(options, "from");
      requireOption(options, "to");

      const params = buildEndpointParams(options);
      const result = await mcp.generateSampleCode("eq-bars-daily", params);
      const sampleCode = extractSampleCode(result);

      if (!sampleCode) {
        throw new Error("MCP did not return executable sample code.");
      }

      const executableCode = preparePythonSampleCode(sampleCode, "eq-bars-daily", params);
      const scriptPath = join(tmpdir(), `jquants-mcp-sample-${Date.now()}.py`);

      try {
        await writeFile(scriptPath, executableCode, "utf8");
        const execution = await runProcess(resolveLocalPythonExecutable(), [scriptPath], {
          cwd: process.cwd(),
          env: process.env
        });
        const parsed = tryParseJson(execution.stdout.trim());

        printJson({
          ok: true,
          serverInfo: mcp.getServerInfo(),
          endpoint: "eq-bars-daily",
          params,
          generatedByMcp: true,
          sampleCodePreview: executableCode.split(/\r?\n/u).slice(0, 12),
          result: summarizeExecution(parsed, execution.stdout.trim())
        });
      } finally {
        await unlink(scriptPath).catch(() => undefined);
      }
      return;
    }

    throw new Error(`Unknown command: mcp ${command}`);
  } finally {
    await mcp.close();
  }
}

function summarizeExecution(parsed, raw) {
  if (Array.isArray(parsed)) {
    return {
      count: parsed.length,
      sample: parsed.slice(0, 5)
    };
  }

  if (parsed && typeof parsed === "object") {
    return parsed;
  }

  return raw;
}

function buildEndpointParams(options) {
  return {
    code: options.code,
    from: toJQuantsDate(options.from),
    to: toJQuantsDate(options.to),
    date: toJQuantsDate(options.date)
  };
}

function runProcess(command, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
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
          `Process failed with exit code ${code}.\nSTDOUT:\n${stdout || "<empty>"}\nSTDERR:\n${stderr || "<empty>"}`
        )
      );
    });
  });
}

function parseArgs(argv) {
  const positional = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return {
    positional,
    options
  };
}

function requireOption(options, key) {
  if (!options[key]) {
    throw new Error(`Missing required option --${key}`);
  }
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }

  return parsed;
}

function formatMetrics(metrics) {
  return {
    ...metrics,
    investedRatio: round(metrics.investedRatio),
    totalReturn: round(metrics.totalReturn),
    cagr: metrics.cagr === null ? null : round(metrics.cagr),
    maxDrawdown: round(metrics.maxDrawdown)
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
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

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printUsage() {
  console.log(`Usage:
  node src/cli/index.js jquants ping --code 7203
  node src/cli/index.js jquants quotes --code 7203 --from 2024-01-01 --to 2024-03-31
  node src/cli/index.js backtest sma --code 7203 --from 2024-01-01 --to 2024-12-30 --short 5 --long 20
  node src/cli/index.js mcp tools
  node src/cli/index.js mcp describe --endpoint eq-bars-daily
  node src/cli/index.js mcp fetch-bars --code 7203 --from 2024-01-01 --to 2024-01-31`);
}

main().catch((error) => {
  console.error(error.message);

  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }

  process.exitCode = 1;
});