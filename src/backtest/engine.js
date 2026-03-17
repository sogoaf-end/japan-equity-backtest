/**
 * @typedef {Object} BacktestBar
 * @property {string} date
 * @property {number} open
 * @property {number} close
 * @property {number} [high]
 * @property {number} [low]
 * @property {number} [volume]
 */

/**
 * `bars` contains only data visible at the decision point.
 * `index` always points to the latest visible bar.
 *
 * Fundamental fields are populated when a `dataProvider` is passed to runBacktest().
 * They are always null when running a pure technical strategy.
 *
 * @typedef {Object} StrategyInput
 * @property {number} index
 * @property {number} absoluteIndex
 * @property {BacktestBar} bar               - current bar (latest visible bar)
 * @property {ReadonlyArray<BacktestBar>} bars
 * @property {0|1} position
 * @property {object|null} fundamentals      - annual report data as of bar.date (look-ahead safe)
 * @property {object|null} earnings          - latest earnings disclosure as of bar.date
 * @property {{pCF:number|null,cfYield:number|null,fcfYield:number|null,perPcfRatio:number|null}|null} cfMetrics
 */

/**
 * Return `1` for fully long, `0` for flat, or `null` to skip.
 *
 * @typedef {Object} Strategy
 * @property {string} [name]
 * @property {(input: StrategyInput) => number | null | undefined} decide
 */

/**
 * @typedef {Object} CostModelInput
 * @property {'buy' | 'sell'} action
 * @property {number} notional
 * @property {number} price
 * @property {number} shares
 * @property {number} lotSize
 */

/**
 * @param {object} options
 * @param {Array<BacktestBar>} options.bars
 * @param {Strategy} options.strategy
 * @param {number} [options.initialCash=1_000_000]
 * @param {number} [options.commission=0]
 * @param {Function} [options.costModel]
 * @param {number} [options.lotSize=100]
 * @param {string} [options.code]              - stock code, required when dataProvider is set
 * @param {import('../data/providers/composite.js').CompositeProvider} [options.dataProvider]
 *   When provided, fundamental data is fetched for each bar and passed to strategy.decide().
 *   getSnapshot(code, date) must be async; runBacktest becomes async in this case.
 */
export async function runBacktest({
  bars,
  strategy,
  initialCash = 1_000_000,
  commission = 0,
  costModel,
  lotSize = 100,
  code,
  dataProvider,
}) {
  validateBars(bars);
  validateLotSize(lotSize);

  if (!strategy || typeof strategy.decide !== "function") {
    throw new Error("A strategy with a decide() function is required.");
  }

  const resolvedCostModel = normalizeCostModel({
    commission,
    costModel
  });

  let cash = initialCash;
  let shares = 0;
  let pendingTargetWeight = null;

  const trades = [];
  const equityCurve = [];

  for (let absoluteIndex = 0; absoluteIndex < bars.length; absoluteIndex += 1) {
    const bar = bars[absoluteIndex];

    if (pendingTargetWeight !== null) {
      const equityAtOpen = cash + shares * bar.open;
      const desiredShares = alignDownToLotSize(
        Math.floor((equityAtOpen * pendingTargetWeight) / bar.open),
        lotSize
      );
      const targetShares = rebalanceToAffordableShares({
        currentShares: shares,
        desiredShares,
        cash,
        price: bar.open,
        lotSize,
        costModel: resolvedCostModel
      });
      const deltaShares = targetShares - shares;

      if (deltaShares !== 0) {
        const trade = buildTrade({
          date: bar.date,
          deltaShares,
          price: bar.open,
          lotSize,
          costModel: resolvedCostModel
        });

        cash -= trade.notional;
        cash -= trade.cost;
        shares = targetShares;
        trades.push(trade);
      }

      pendingTargetWeight = null;
    }

    const equity = cash + shares * bar.close;

    equityCurve.push({
      date: bar.date,
      close: bar.close,
      cash,
      shares,
      equity
    });

    const visibleBars = createVisibleBars(bars, absoluteIndex);
    const currentBar  = visibleBars[visibleBars.length - 1];

    // Fetch fundamental snapshot for the current date (look-ahead bias safe).
    // Falls back to null when no dataProvider is given (pure technical strategies).
    let fundamentals = null;
    let earnings     = null;
    let cfMetrics    = null;
    if (dataProvider && code) {
      const snapshot = await dataProvider.getSnapshot(code, bar.date);
      fundamentals = snapshot.annual   ?? null;
      earnings     = snapshot.earnings ?? null;
      cfMetrics    = snapshot.cfMetrics ?? null;
    }

    const desiredWeight = strategy.decide({
      index: visibleBars.length - 1,
      absoluteIndex,
      bar: currentBar,
      bars: visibleBars,
      position: shares > 0 ? 1 : 0,
      fundamentals,
      earnings,
      cfMetrics,
    });

    if (desiredWeight !== null && desiredWeight !== undefined && absoluteIndex < bars.length - 1) {
      pendingTargetWeight = clamp(desiredWeight, 0, 1);
    }
  }

  return {
    strategy: strategy.name ?? "strategy",
    initialCash,
    lotSize,
    finalEquity: equityCurve.at(-1)?.equity ?? initialCash,
    trades,
    equityCurve,
    metrics: summarizeBacktest({
      initialCash,
      equityCurve,
      trades
    })
  };
}

export function createCostModel({ fixedCost = 0, feeBps = 0 } = {}) {
  const safeFixedCost = Math.max(0, fixedCost);
  const safeFeeRate = Math.max(0, feeBps) / 10_000;

  return ({ notional }) => safeFixedCost + Math.abs(notional) * safeFeeRate;
}

function normalizeCostModel({ commission, costModel }) {
  if (costModel === undefined) {
    return createCostModel({ fixedCost: commission });
  }

  if (typeof costModel !== "function") {
    throw new Error("costModel must be a function.");
  }

  return costModel;
}

function buildTrade({ date, deltaShares, price, lotSize, costModel }) {
  const action = deltaShares > 0 ? "buy" : "sell";
  const notional = deltaShares * price;
  const cost = costModel({
    action,
    notional: Math.abs(notional),
    price,
    shares: Math.abs(deltaShares),
    lotSize
  });

  return {
    date,
    action,
    shares: deltaShares,
    price,
    notional,
    cost
  };
}

function createVisibleBars(bars, endIndex) {
  // Copy and freeze the visible window so strategies cannot mutate shared market data.
  return Object.freeze(
    bars.slice(0, endIndex + 1).map((bar) => Object.freeze({ ...bar }))
  );
}

function rebalanceToAffordableShares({
  currentShares,
  desiredShares,
  cash,
  price,
  lotSize,
  costModel
}) {
  if (desiredShares <= currentShares) {
    return desiredShares;
  }

  let targetShares = desiredShares;

  while (targetShares > currentShares) {
    const deltaShares = targetShares - currentShares;
    const notional = deltaShares * price;
    const cost = costModel({
      action: "buy",
      notional: Math.abs(notional),
      price,
      shares: deltaShares,
      lotSize
    });
    const resultingCash = cash - notional - cost;

    if (resultingCash >= 0) {
      return targetShares;
    }

    targetShares = Math.max(currentShares, targetShares - lotSize);
  }

  return currentShares;
}

function alignDownToLotSize(shares, lotSize) {
  return Math.floor(Math.max(0, shares) / lotSize) * lotSize;
}

function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length < 2) {
    throw new Error("At least 2 bars are required for a backtest.");
  }

  for (const bar of bars) {
    if (!(bar?.date && Number.isFinite(bar?.open) && Number.isFinite(bar?.close))) {
      throw new Error("Each bar must contain date, open, and close.");
    }
  }
}

function validateLotSize(lotSize) {
  if (!Number.isInteger(lotSize) || lotSize <= 0) {
    throw new Error("lotSize must be a positive integer.");
  }
}

function summarizeBacktest({ initialCash, equityCurve, trades }) {
  const first = equityCurve[0];
  const last = equityCurve.at(-1);

  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  let investedBars = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);

    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - point.equity) / peak);
    }

    if (point.shares > 0) {
      investedBars += 1;
    }
  }

  const totalReturn = last.equity / initialCash - 1;
  const years = calculateYears(first.date, last.date);
  const cagr =
    years > 0 && last.equity > 0 ? Math.pow(last.equity / initialCash, 1 / years) - 1 : null;

  return {
    startDate: first.date,
    endDate: last.date,
    bars: equityCurve.length,
    investedRatio: investedBars / equityCurve.length,
    tradeCount: trades.length,
    initialCash,
    finalEquity: last.equity,
    totalReturn,
    cagr,
    maxDrawdown
  };
}

function calculateYears(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();

  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return 0;
  }

  return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}