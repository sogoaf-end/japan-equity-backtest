import test from "node:test";
import assert from "node:assert/strict";

import { runBacktest } from "../src/backtest/engine.js";
import { createSmaCrossStrategy } from "../src/backtest/strategies/smaCross.js";

test("runBacktest executes buy and sell on SMA cross", () => {
  const bars = [
    { date: "2024-01-01", open: 100, close: 100 },
    { date: "2024-01-02", open: 101, close: 101 },
    { date: "2024-01-03", open: 102, close: 102 },
    { date: "2024-01-04", open: 103, close: 103 },
    { date: "2024-01-05", open: 102, close: 102 },
    { date: "2024-01-06", open: 101, close: 101 },
    { date: "2024-01-07", open: 100, close: 100 }
  ];

  const strategy = createSmaCrossStrategy({
    shortWindow: 2,
    longWindow: 3
  });

  const report = runBacktest({
    bars,
    strategy,
    initialCash: 10_000
  });

  assert.equal(report.trades.length, 2);
  assert.equal(report.trades[0].action, "buy");
  assert.equal(report.trades[0].date, "2024-01-04");
  assert.equal(report.trades[1].action, "sell");
  assert.equal(report.trades[1].date, "2024-01-07");
  assert.equal(report.metrics.tradeCount, 2);
});