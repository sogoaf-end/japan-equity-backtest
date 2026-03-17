/**
 * 営業利益率改善モメンタム バックテスト ランナー
 *
 * 対象: 東京エレクトロン(8035) / アドバンテスト(6857) / レーザーテック(6920)
 * 期間: 2020-01-01 〜 2024-12-31
 *
 * 実行:
 *   node src/cli/run-opMarginImprovement.js
 */

import { loadConfig } from '../lib/config.js';
import { JQuantsProvider } from '../data/providers/jquantsProvider.js';
import { EdinetProvider, normalizeCode } from '../data/providers/edinetProvider.js';
import { DataCache } from '../data/cache.js';
import { runBacktest, createCostModel } from '../backtest/engine.js';
import { createOpMarginImprovementStrategy } from '../backtest/strategies/opMarginImprovement.js';
import { nextBusinessDay } from '../data/eventTimeline.js';

// ── Parameters ──────────────────────────────────────────────────────────────
const STOCKS = [
  { code: '8035', name: '東京エレクトロン',  edinetCode: 'E02652' },
  { code: '6857', name: 'アドバンテスト',    edinetCode: 'E01950' },
  { code: '6920', name: 'レーザーテック',    edinetCode: 'E01991' },
];

const FROM             = '2020-01-01';
const TO               = '2024-12-31';
const INITIAL_CASH     = 1_000_000;   // ¥1,000,000 per stock
const LOT_SIZE         = 100;
const FEE_BPS          = 10;          // 0.1 % one-way
const MIN_IMPROVEMENT  = 2;           // %pt
const MIN_EQUITY_RATIO = 20;          // %
const HOLD_BARS        = 20;          // trading days

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const config = loadConfig();
  const cache  = new DataCache({ mode: 'live' });

  const jquants = new JQuantsProvider({ config: config.jquants, cache });
  const edinet  = new EdinetProvider({
    apiKey: config.edinetDb.apiKey,
    mcpUrl: config.edinetDb.mcpUrl,
    cache,
  });

  // Lightweight dataProvider: annual fundamentals only.
  // Skips getCFMetrics() to avoid ~1 200 extra J-Quants market-cap API calls.
  function makeDataProvider() {
    return {
      async getSnapshot(code, date) {
        const timeline = await edinet.getEventTimeline(code);
        const snapshot = timeline.getSnapshot(date);
        return { annual: snapshot.annual, earnings: snapshot.earnings, cfMetrics: null };
      },
    };
  }

  const costModel = createCostModel({ feeBps: FEE_BPS });

  printHeader();

  const allRoundtrips = [];
  const stockResults  = [];

  for (const stock of STOCKS) {
    const jcode = normalizeCode(stock.code);  // "8035" → "80350"
    console.log(`\n処理中: ${stock.name}（${stock.code}）...`);

    // ── 1. Fetch price bars ─────────────────────────────────────────────────
    let bars;
    try {
      bars = await jquants.getBars(jcode, FROM, TO);
    } catch (err) {
      console.error(`  ⚠ 価格データ取得失敗 [${stock.code}]: ${err.message}`);
      stockResults.push({ ...stock, error: err.message });
      continue;
    }

    if (bars.length < HOLD_BARS + 2) {
      console.error(`  ⚠ バー不足: ${bars.length} 本`);
      stockResults.push({ ...stock, error: `bars=${bars.length}` });
      continue;
    }

    // ── 2. Run strategy backtest ────────────────────────────────────────────
    const strategy     = createOpMarginImprovementStrategy({
      minImprovement:  MIN_IMPROVEMENT,
      minEquityRatio:  MIN_EQUITY_RATIO,
      holdBars:        HOLD_BARS,
    });
    const dataProvider = makeDataProvider();

    const result = await runBacktest({
      bars,
      strategy,
      initialCash: INITIAL_CASH,
      lotSize:     LOT_SIZE,
      costModel,
      code:        jcode,
      dataProvider,
    });

    // ── 3. Pre-compute expected signals from the timeline (for reporting) ───
    const timeline = await edinet.getEventTimeline(jcode);
    const signals  = computeSignals(timeline, MIN_IMPROVEMENT, MIN_EQUITY_RATIO);

    // ── 4. Pair buy/sell into round-trips ───────────────────────────────────
    const roundtrips = pairTrades(result.trades, stock.name, stock.code);
    allRoundtrips.push(...roundtrips);

    // ── 5. Buy & Hold baseline ──────────────────────────────────────────────
    const bah = buyAndHold(bars, INITIAL_CASH, LOT_SIZE, FEE_BPS);

    stockResults.push({
      ...stock,
      bars:      bars.length,
      metrics:   result.metrics,
      signals,
      roundtrips,
      bah,
    });
  }

  // ── Per-stock report ──────────────────────────────────────────────────────
  for (const s of stockResults) {
    if (s.error) {
      console.log(`\n${line('━')}`);
      console.log(` ${s.name}（${s.code}）  ⚠ エラー: ${s.error}`);
      continue;
    }

    console.log(`\n${line('━')}`);
    console.log(` ${s.name}（${s.code}）  取引日数: ${s.bars} 本`);
    console.log(line('━'));

    // Signal analysis (from annual report timeline)
    const rangeSignals = s.signals.filter(
      sg => sg.signalDate >= FROM && sg.signalDate <= TO
    );
    if (rangeSignals.length === 0) {
      console.log('  ▸ シグナル分析: 期間内シグナルなし（+2%pt 以上の改善なし）');
    } else {
      console.log('  ▸ シグナル分析 (期間内):');
      const execDates = new Set(s.roundtrips.map(t => t.buyDate));
      for (const sg of rangeSignals) {
        const bday = nextBusinessDayStr(sg.signalDate);
        const executed = execDates.has(bday) ? '✓ 執行' : '✗ 未執行（資金不足）';
        console.log(
          `    FY${sg.fiscalYear}  有報提出: ${sg.signalDate}` +
          `  Δ利益率: +${sg.improvement.toFixed(2)}%pt` +
          `  自己資本比率: ${sg.equityRatio.toFixed(1)}%` +
          `  → 翌営業日買 ${bday}  [${executed}]`
        );
      }
    }
    console.log('');

    // Trade list
    if (s.roundtrips.length === 0) {
      console.log('  ▸ 取引一覧: 執行トレードなし');
    } else {
      console.log(
        `  ${'買日付'.padEnd(13)}${'売日付'.padEnd(13)}` +
        `${'買値(¥)'.padStart(10)}${'売値(¥)'.padStart(10)}` +
        `${'株数'.padStart(6)}${'損益(¥)'.padStart(13)}${'損益率'.padStart(8)}`
      );
      console.log('  ' + '─'.repeat(73));
      for (const t of s.roundtrips) {
        const pnlStr = t.pnl >= 0 ? `+${t.pnl.toLocaleString()}` : t.pnl.toLocaleString();
        const retStr = (t.returnPct >= 0 ? '+' : '') + t.returnPct.toFixed(2) + '%';
        console.log(
          `  ${t.buyDate.padEnd(13)}${t.sellDate.padEnd(13)}` +
          `${t.buyPrice.toLocaleString().padStart(10)}` +
          `${t.sellPrice.toLocaleString().padStart(10)}` +
          `${String(t.shares).padStart(6)}` +
          `${pnlStr.padStart(13)}` +
          `${retStr.padStart(8)}`
        );
      }
    }

    const m    = s.metrics;
    const n    = s.roundtrips.length;
    const wins = s.roundtrips.filter(t => t.pnl > 0).length;
    const avgPnl = n > 0
      ? Math.round(s.roundtrips.reduce((a, t) => a + t.pnl, 0) / n)
      : 0;

    console.log(`\n  ▸ 戦略成績`);
    console.log(`    最終資産    : ¥${Math.round(m.finalEquity).toLocaleString()}`);
    console.log(`    総収益率    : ${fmtPct(m.totalReturn)}  (CAGR ${m.cagr != null ? fmtPct(m.cagr) : 'N/A'})`);
    console.log(`    最大DD      : ${fmtPct(m.maxDrawdown)}`);
    console.log(`    トレード数  : ${n} 回`);
    console.log(`    勝率        : ${n > 0 ? fmtPct(wins / n) : 'N/A'}  (${wins} 勝 / ${n - wins} 敗)`);
    console.log(`    平均損益    : ¥${avgPnl.toLocaleString()}`);

    console.log(`\n  ▸ バイ・アンド・ホールド比較`);
    console.log(`    買値: ¥${s.bah.buyPrice.toLocaleString()}  →  売値: ¥${s.bah.sellPrice.toLocaleString()}  (${s.bah.shares} 株)`);
    console.log(`    最終資産    : ¥${Math.round(s.bah.finalEquity).toLocaleString()}`);
    console.log(`    総収益率    : ${fmtPct(s.bah.totalReturn)}`);
    const alpha = m.totalReturn - s.bah.totalReturn;
    const alphaStr = (alpha >= 0 ? '▲' : '▽') + ' ' + fmtPct(Math.abs(alpha)) + ' (超過リターン)';
    console.log(`    戦略 vs B&H : ${alphaStr}`);
  }

  // ── All-stocks aggregate ──────────────────────────────────────────────────
  const validResults = stockResults.filter(s => !s.error && s.metrics);

  if (allRoundtrips.length > 0) {
    console.log(`\n${line('═')}`);
    console.log(' 全銘柄合計');
    console.log(line('═'));

    const n      = allRoundtrips.length;
    const wins   = allRoundtrips.filter(t => t.pnl > 0).length;
    const totalPnl = allRoundtrips.reduce((a, t) => a + t.pnl, 0);
    const avgPnl   = Math.round(totalPnl / n);
    const maxDD    = Math.max(...validResults.map(s => s.metrics.maxDrawdown));

    console.log(`  トレード数        : ${n} 回`);
    console.log(`  勝率              : ${fmtPct(wins / n)}  (${wins} 勝 / ${n - wins} 敗)`);
    console.log(`  合計損益          : ¥${totalPnl.toLocaleString()}`);
    console.log(`  平均損益/トレード  : ¥${avgPnl.toLocaleString()}`);
    console.log(`  最大DD（個別最大） : ${fmtPct(maxDD)}`);
  } else if (validResults.length > 0) {
    console.log(`\n  シグナルが発生しませんでした。`);
    console.log(`  （J-Quantsの価格データ範囲またはAnnual Report提出日のカバレッジを確認してください）`);
  }

  console.log(`\n${line('═')}\n`);
  console.log('⚠ 注意事項:');
  console.log('  - 各銘柄の初期資金は独立した ¥1,000,000 で計算しています。');
  console.log('  - シグナル源: get_financials（有価証券報告書）の submitDateTime');
  console.log('    TDNet get_earnings は直近のみ対応（2020-2024履歴には不十分）のため非採用。');
  console.log('  - 買い: シグナル発生翌営業日の始値  /  売り: 20営業日後の始値');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pair buy/sell trades into round-trips (FIFO).
 * @param {Array<object>} trades - from engine result
 * @param {string} stockName
 * @param {string} code
 */
function pairTrades(trades, stockName, code) {
  const result = [];
  let lastBuy  = null;

  for (const t of trades) {
    if (t.action === 'buy') {
      lastBuy = t;
    } else if (t.action === 'sell' && lastBuy) {
      const grossPnl = (t.price - lastBuy.price) * Math.abs(t.shares);
      const pnl      = Math.round(grossPnl - lastBuy.cost - t.cost);
      result.push({
        stockName,
        code,
        buyDate:   lastBuy.date,
        sellDate:  t.date,
        buyPrice:  lastBuy.price,
        sellPrice: t.price,
        shares:    Math.abs(t.shares),
        pnl,
        returnPct: ((t.price / lastBuy.price) - 1) * 100,
      });
      lastBuy = null;
    }
  }

  // Unclosed position at end of backtest (no matching sell)
  if (lastBuy) {
    result.push({
      stockName,
      code,
      buyDate:   lastBuy.date,
      sellDate:  '(未決済)',
      buyPrice:  lastBuy.price,
      sellPrice: null,
      shares:    Math.abs(lastBuy.shares),
      pnl:       null,
      returnPct: null,
    });
  }

  return result;
}

/**
 * Buy & Hold baseline: buy maxAffordable lots on day 0, sell on last day.
 */
function buyAndHold(bars, initialCash, lotSize, feeBps) {
  const feeRate = feeBps / 10_000;
  const first   = bars[0];
  const last    = bars[bars.length - 1];

  const maxLots      = Math.floor(initialCash / (first.open * (1 + feeRate) * lotSize));
  const shares       = maxLots * lotSize;
  const buyNotional  = shares * first.open;
  const buyCost      = buyNotional * feeRate;
  const remaining    = initialCash - buyNotional - buyCost;
  const sellNotional = shares * last.close;
  const sellCost     = sellNotional * feeRate;
  const finalEquity  = remaining + sellNotional - sellCost;

  return {
    buyPrice:    first.open,
    sellPrice:   last.close,
    shares,
    finalEquity,
    totalReturn: finalEquity / initialCash - 1,
  };
}

/**
 * Pre-compute buy signals from an EventTimeline (for reporting).
 * Mirrors the strategy logic but operates on the raw timeline events.
 */
function computeSignals(timeline, minImprovement, minEquityRatio) {
  const annuals = timeline.events
    .filter(e => e.type === 'annual_report')
    .sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));

  const signals = [];
  for (let i = 1; i < annuals.length; i++) {
    const prev = annuals[i - 1].data;
    const curr = annuals[i].data;

    const equityPct = (curr.equityRatioOfficial ?? 0) * 100;
    if (equityPct < minEquityRatio) continue;

    const curMargin  = curr.revenue > 0 ? (curr.operatingIncome / curr.revenue) * 100 : null;
    const prevMargin = prev.revenue > 0 ? (prev.operatingIncome / prev.revenue) * 100 : null;
    if (curMargin === null || prevMargin === null) continue;

    const improvement = curMargin - prevMargin;
    if (improvement >= minImprovement) {
      signals.push({
        fiscalYear:  curr.fiscalYear,
        signalDate:  annuals[i].availableFrom,
        prevMargin,
        curMargin,
        improvement,
        equityRatio: equityPct,
      });
    }
  }
  return signals;
}

/** Wrapper: nextBusinessDay from eventTimeline.js */
function nextBusinessDayStr(dateStr) {
  return nextBusinessDay(dateStr);
}

/** Format a decimal as ±xx.x% */
function fmtPct(value) {
  const abs = Math.abs(value * 100).toFixed(1);
  return (value >= 0 ? '+' : '-') + abs + '%';
}

function line(ch) {
  return ch.repeat(65);
}

function printHeader() {
  console.log(line('═'));
  console.log(' 営業利益率改善モメンタム バックテスト');
  console.log(` 期間: ${FROM} ～ ${TO}`);
  console.log(` 初期資金: ¥${INITIAL_CASH.toLocaleString()} / 銘柄  |  手数料: ${FEE_BPS / 100}% (片道)  |  保有: ${HOLD_BARS}営業日`);
  console.log(` シグナル: 営業利益率 前期比 +${MIN_IMPROVEMENT}%pt 以上改善  AND  自己資本比率 ≥ ${MIN_EQUITY_RATIO}%`);
  console.log(line('═'));
}

main().catch(err => {
  console.error('\nERROR:', err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exitCode = 1;
});
