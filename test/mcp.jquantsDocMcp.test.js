import test from "node:test";
import assert from "node:assert/strict";

import {
  extractSampleCode,
  normalizeToolResult,
  preparePythonSampleCode,
  stripCodeFences
} from "../src/lib/mcp/jquantsDocMcp.js";

test("normalizeToolResult parses JSON text payload", () => {
  const result = normalizeToolResult({
    content: [
      {
        type: "text",
        text: '{"endpoint":"eq-bars-daily","path":"/v2/equities/bars/daily"}'
      }
    ]
  });

  assert.deepEqual(result.data, {
    endpoint: "eq-bars-daily",
    path: "/v2/equities/bars/daily"
  });
});

test("stripCodeFences removes fenced markdown wrapper", () => {
  const value = stripCodeFences("```python\nprint('hello')\n```");
  assert.equal(value, "print('hello')");
});

test("extractSampleCode prefers structured code fields", () => {
  const sampleCode = extractSampleCode({
    data: {
      code: "print('sample')"
    },
    text: "ignored"
  });

  assert.equal(sampleCode, "print('sample')");
});

test("preparePythonSampleCode sanitizes endpoint names and injects params", () => {
  const prepared = preparePythonSampleCode(
    "def eq-bars-daily(api_key):\n    return []\n\ndef eq-bars-daily_all(api_key):\n    return []\n\nif __name__ == \"__main__\":\n    pass\n",
    "eq-bars-daily",
    { code: "7203", from: "20240101", to: "20240131" }
  );

  assert.match(prepared, /def eq_bars_daily\(api_key\):/);
  assert.match(prepared, /def eq_bars_daily_all\(api_key\):/);
  assert.match(prepared, /code="7203"/);
  assert.match(prepared, /from_="20240101"/);
  assert.match(prepared, /to_="20240131"/);
  assert.doesNotMatch(prepared, /def eq-bars-daily/);
});