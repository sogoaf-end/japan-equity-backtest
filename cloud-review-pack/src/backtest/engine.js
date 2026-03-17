export function runBacktest({
  bars,
  strategy,
  initialCash = 1_000_000,
  commission = 0
}) {
  validateBars(bars);

  if (!strategy || typeof strategy.decide !== "function") {
    throw new Error("A strategy with a decide() function is required.");
  }

  let cash = initialCash;
  let shares = 0;
  let pendingTargetWeight = null;

  const trades = [];
  const equityCurve = [];

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];

    if (pendingTargetWeight !== null) {
      const equityAtOpen = cash + shares * bar.open;
      const targetShares = Math.max(
        0,
        Math.floor((equityAtOpen * pendingTargetWeight) / bar.open)
      );
      const deltaShares = targetShares - shares;

      if (deltaShares !== 0) {
        const notional = deltaShares * bar.open;
        cash -= notional;
        cash -= commission;
        shares = targetShares;

        trades.push({
          date: bar.date,
          action: deltaShares > 0 ? "buy" : "sell",
          shares: deltaShares,
          price: bar.open,
          notional
        });
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

    const desiredWeight = strategy.decide({
      index,
      bars,
      position: shares > 0 ? 1 : 0
    });

    if (desiredWeight !== null && desiredWeight !== undefined && index < bars.length - 1) {
      pendingTargetWeight = clamp(desiredWeight, 0, 1);
    }
  }

  return {
    strategy: strategy.name ?? "strategy",
    initialCash,
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