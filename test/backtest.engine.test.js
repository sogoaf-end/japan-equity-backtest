import test from "node:test";
import assert from "node:assert/strict";

import { createCostModel, runBacktest } from "../src/backtest/engine.js";
import { createSmaCrossStrategy } from "../src/backtest/strategies/smaCross.js";

test("runBacktest executes buy and sell on SMA cross", async () => {
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

  const report = await runBacktest({
    bars,
    strategy,
    initialCash: 10_000,
    lotSize: 1
  });

  assert.equal(report.trades.length, 2);
  assert.equal(report.trades[0].action, "buy");
  assert.equal(report.trades[0].date, "2024-01-04");
  assert.equal(report.trades[1].action, "sell");
  assert.equal(report.trades[1].date, "2024-01-07");
  assert.equal(report.metrics.tradeCount, 2);
});

test("runBacktest only exposes visible bars to the strategy", async () => {
  const bars = [
    { date: "2024-01-01", open: 10, close: 10 },
    { date: "2024-01-02", open: 11, close: 11 },
    { date: "2024-01-03", open: 12, close: 12 }
  ];

  const seen = [];

  await runBacktest({
    bars,
    lotSize: 1,
    strategy: {
      name: "visible-bars-check",
      decide({ index, absoluteIndex, bars: visibleBars }) {
        seen.push({
          index,
          absoluteIndex,
          length: visibleBars.length,
          nextBar: visibleBars[index + 1]
        });
        return 0;
      }
    }
  });

  assert.deepEqual(seen, [
    { index: 0, absoluteIndex: 0, length: 1, nextBar: undefined },
    { index: 1, absoluteIndex: 1, length: 2, nextBar: undefined },
    { index: 2, absoluteIndex: 2, length: 3, nextBar: undefined }
  ]);
});

test("runBacktest respects lot size and transaction costs", async () => {
  const bars = [
    { date: "2024-01-01", open: 50, close: 50 },
    { date: "2024-01-02", open: 50, close: 50 },
    { date: "2024-01-03", open: 55, close: 55 }
  ];

  const report = await runBacktest({
    bars,
    initialCash: 10_000,
    lotSize: 100,
    costModel: createCostModel({ fixedCost: 50 }),
    strategy: {
      name: "lot-size-check",
      decide({ absoluteIndex }) {
        if (absoluteIndex === 0) {
          return 1;
        }

        if (absoluteIndex === 1) {
          return 0;
        }

        return null;
      }
    }
  });

  assert.deepEqual(report.trades, [
    {
      date: "2024-01-02",
      action: "buy",
      shares: 100,
      price: 50,
      notional: 5000,
      cost: 50
    },
    {
      date: "2024-01-03",
      action: "sell",
      shares: -100,
      price: 55,
      notional: -5500,
      cost: 50
    }
  ]);
  assert.equal(report.finalEquity, 10_400);
});