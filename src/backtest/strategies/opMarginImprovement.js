/**
 * 営業利益率改善モメンタム戦略
 *
 * Signal: annual operating margin (operatingIncome / revenue) improved ≥ minImprovement %pt YoY
 *         AND equityRatioOfficial × 100 ≥ minEquityRatio
 *
 * Data source: `fundamentals` (annual reports, get_financials, 6-year history via EDINET DB)
 *
 *   ⚠ NOTE on data source:
 *   TDNet get_earnings only covers the most recent ~30 disclosures from the live feed.
 *   For a 2020–2024 historical backtest this is insufficient — only 1 recent record was
 *   returned in practice.  Annual report data (有価証券報告書, get_financials) is used
 *   instead: it provides 6 fiscal years of history and is the authoritative disclosure.
 *   The signal timing is identical in spirit: it fires on the annual report filing date
 *   (submitDateTime), which is EDINET's look-ahead-safe availableFrom date.
 *
 * Entry: next bar's open after signal bar (engine-standard, look-ahead-safe)
 * Exit:  holdBars trading days after signal bar → sell at open on that bar
 *
 * @param {object}  [options]
 * @param {number}  [options.minImprovement=2]   minimum YoY margin improvement in %pt
 * @param {number}  [options.minEquityRatio=20]  minimum equity ratio in %
 * @param {number}  [options.holdBars=20]        trading days to hold after signal
 */
export function createOpMarginImprovementStrategy({
  minImprovement = 2,
  minEquityRatio = 20,
  holdBars = 20,
} = {}) {
  /** @type {object|null} Previous annual report (for YoY comparison). */
  let prevAnnual = null;
  /** @type {number|null} Fiscal year of the most recent annual report we have seen. */
  let lastFiscalYear = null;
  /**
   * absoluteIndex of the bar on which the buy signal fired.
   * null = not in a position.
   * @type {number|null}
   */
  let entryAbsoluteIndex = null;

  return {
    name: 'op_margin_improvement',

    /**
     * @param {import('../engine.js').StrategyInput} input
     * @returns {number|null}
     */
    decide({ absoluteIndex, fundamentals }) {
      // ── Exit: sell on bar (entryAbsoluteIndex + holdBars), i.e. holdBars bars after signal ──
      // Buy executes at bar (entry+1)'s open; sell executes at bar (entry+holdBars+1)'s open.
      if (entryAbsoluteIndex !== null) {
        const held = absoluteIndex - entryAbsoluteIndex;
        if (held >= holdBars) {
          entryAbsoluteIndex = null;
          return 0;  // pendingTargetWeight = 0 → sell at next bar's open
        }
        return 1;   // hold full position
      }

      // No fundamental data yet (before first annual report in the timeline).
      if (!fundamentals) return null;

      // ── Detect new annual report: fiscalYear changed ──────────────────────
      const fy = fundamentals.fiscalYear;
      if (fy === lastFiscalYear) return null;   // same report, nothing to do

      const prev = prevAnnual;
      prevAnnual    = fundamentals;
      lastFiscalYear = fy;

      // First report seen — no prior year available for comparison yet.
      if (!prev) return null;

      // ── Equity ratio filter ──────────────────────────────────────────────
      // Annual financials: equityRatioOfficial is a decimal (0.641 = 64.1 %)
      const equityPct = (fundamentals.equityRatioOfficial ?? 0) * 100;
      if (equityPct < minEquityRatio) return null;

      // ── Operating margin YoY comparison ──────────────────────────────────
      const curMargin  = _operatingMargin(fundamentals);
      const prevMargin = _operatingMargin(prev);
      if (curMargin === null || prevMargin === null) return null;

      const improvement = curMargin - prevMargin;
      if (improvement >= minImprovement) {
        entryAbsoluteIndex = absoluteIndex;
        return 1;   // buy signal → pendingTargetWeight = 1
      }

      return null;
    },
  };
}

/**
 * @param {object} annual
 * @returns {number|null} operating margin in %
 */
function _operatingMargin(annual) {
  const rev = annual?.revenue;
  const oi  = annual?.operatingIncome;
  if (rev == null || oi == null || rev === 0) return null;
  return (oi / rev) * 100;
}
