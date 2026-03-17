import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDailyQuotesResponse,
  normalizeListedInfoResponse,
  toJQuantsDate
} from "../src/lib/jquants/marketData.js";

test("normalizeDailyQuotesResponse maps V1 adjusted prices", () => {
  const items = normalizeDailyQuotesResponse({
    daily_quotes: [
      {
        Code: "7203",
        Date: "20240105",
        Open: "100",
        High: "110",
        Low: "90",
        Close: "105",
        Volume: "10000"
      },
      {
        Code: "7203",
        Date: "20240104",
        AdjustmentOpen: "98",
        AdjustmentHigh: "109",
        AdjustmentLow: "88",
        AdjustmentClose: "104",
        AdjustmentVolume: "9000"
      }
    ]
  });

  assert.deepEqual(items[0], {
    code: "7203",
    date: "2024-01-05",
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10000
  });

  assert.deepEqual(items[1], {
    code: "7203",
    date: "2024-01-04",
    open: 98,
    high: 109,
    low: 88,
    close: 104,
    volume: 9000
  });
});

test("normalizeDailyQuotesResponse maps V2 short keys", () => {
  const items = normalizeDailyQuotesResponse({
    data: [
      {
        Date: "2024-01-31",
        Code: "72030",
        O: 2940,
        H: 3000,
        L: 2939,
        C: 3000,
        Vo: 28387200,
        AdjO: 2940,
        AdjH: 3000,
        AdjL: 2939,
        AdjC: 3000,
        AdjVo: 28387200
      }
    ]
  });

  assert.deepEqual(items, [
    {
      code: "72030",
      date: "2024-01-31",
      open: 2940,
      high: 3000,
      low: 2939,
      close: 3000,
      volume: 28387200
    }
  ]);
});

test("normalizeListedInfoResponse extracts V2 code, name, and market", () => {
  const items = normalizeListedInfoResponse({
    data: [
      {
        Date: "2026-03-09",
        Code: "72030",
        CoName: "トヨタ自動車",
        CoNameEn: "TOYOTA MOTOR CORPORATION",
        Mkt: "0111",
        MktNm: "プライム"
      }
    ]
  });

  assert.deepEqual(items, [
    {
      code: "72030",
      name: "トヨタ自動車",
      market: "プライム"
    }
  ]);
});

test("toJQuantsDate converts ISO date format", () => {
  assert.equal(toJQuantsDate("2024-01-05"), "20240105");
  assert.equal(toJQuantsDate("20240105"), "20240105");
});