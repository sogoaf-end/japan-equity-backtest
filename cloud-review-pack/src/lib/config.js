import { loadEnvFiles } from "./env.js";

let cachedConfig;

export function loadConfig({ cwd = process.cwd(), force = false } = {}) {
  if (cachedConfig && !force) {
    return cachedConfig;
  }

  loadEnvFiles(cwd);

  cachedConfig = {
    jquants: {
      apiVersion: readString("JQUANTS_API_VERSION", "v2").toLowerCase(),
      baseUrl: readString("JQUANTS_API_BASE_URL", "https://api.jquants.com"),
      apiKey: readString("JQUANTS_API_KEY", ""),
      apiKeyHeader: readString("JQUANTS_API_KEY_HEADER", "x-api-key"),
      apiKeyPrefix: readString("JQUANTS_API_KEY_PREFIX", ""),
      dailyQuotesPath: readString("JQUANTS_DAILY_QUOTES_PATH", ""),
      listedInfoPath: readString("JQUANTS_LISTED_INFO_PATH", ""),
      refreshToken: readString("JQUANTS_REFRESH_TOKEN", ""),
      email: readString("JQUANTS_EMAIL", ""),
      password: readString("JQUANTS_PASSWORD", "")
    },
    backtest: {
      initialCash: readNumber("BACKTEST_INITIAL_CASH", 1_000_000)
    }
  };

  return cachedConfig;
}

function readString(key, fallback) {
  const value = process.env[key];

  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function readNumber(key, fallback) {
  const parsed = Number.parseFloat(process.env[key] ?? "");

  return Number.isFinite(parsed) ? parsed : fallback;
}