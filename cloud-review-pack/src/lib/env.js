import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_FILES = [".env.local", ".env"];

export function loadEnvFiles(cwd = process.cwd(), fileNames = DEFAULT_FILES) {
  for (const fileName of fileNames) {
    const filePath = resolve(cwd, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const contents = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

    for (const rawLine of contents.split(/\r?\n/u)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = stripQuotes(line.slice(separatorIndex + 1).trim());

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}