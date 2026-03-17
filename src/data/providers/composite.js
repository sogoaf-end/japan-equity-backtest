/**
 * CompositeProvider: combines JQuantsProvider (price) and EdinetProvider (fundamentals).
 *
 * Also computes cross-source metrics that require both datasets:
 *   - P/CF (price-to-cash-flow)
 *   - CF yield
 *   - FCF yield
 *   - PER÷P/CF divergence ratio
 *
 * Unit notes:
 *   J-Quants MarketCapitalization → converted to full JPY in JQuantsProvider.getMarketCap()
 *   EDINET get_financials cfOperating → full JPY (e.g., 3_696_934_000_000)
 *   EDINET get_earnings revenue → millions JPY (different source!)
 *   All CF calculations in this file use full-JPY values from get_financials.
 */

import { DataProvider } from './base.js';

export class CompositeProvider extends DataProvider {
  /**
   * @param {object} options
   * @param {import('./jquantsProvider.js').JQuantsProvider} options.priceProvider
   * @param {import('./edinetProvider.js').EdinetProvider} options.fundamentalProvider
   */
  constructor({ priceProvider, fundamentalProvider }) {
    super();
    this.price       = priceProvider;
    this.fundamental = fundamentalProvider;
  }

  /** @override */
  async getBars(code, from, to) {
    return this.price.getBars(code, from, to);
  }

  /** @override */
  async getMarketCap(code, date) {
    return this.price.getMarketCap(code, date);
  }

  /** @override */
  async getFinancials(code, asOfDate) {
    return this.fundamental.getFinancials(code, asOfDate);
  }

  /** @override */
  async getEarnings(code, asOfDate) {
    return this.fundamental.getEarnings(code, asOfDate);
  }

  /** @override */
  async getHealthScore(code) {
    return this.fundamental.getHealthScore(code);
  }

  /** @override */
  async getUniverse(filters) {
    return this.fundamental.getUniverse(filters);
  }

  /** @override */
  async getEventTimeline(code) {
    return this.fundamental.getEventTimeline(code);
  }

  /**
   * Compute cash-flow metrics that require both market cap (J-Quants) and
   * CF data (EDINET).  All monetary values are in full JPY.
   *
   * @param {string} code     - J-Quants secCode
   * @param {string} asOfDate - YYYY-MM-DD
   * @returns {Promise<{
   *   pCF: number|null,
   *   cfYield: number|null,
   *   fcfYield: number|null,
   *   perPcfRatio: number|null
   * }|null>}
   */
  async getCFMetrics(code, asOfDate) {
    const [fin, mktCap] = await Promise.all([
      this.fundamental.getFinancials(code, asOfDate),
      this.price.getMarketCap(code, asOfDate),
    ]);

    if (!fin || mktCap == null || mktCap <= 0) return null;

    const opCF = fin.cfOperating ?? null;
    const invCF = fin.cfInvesting ?? null;

    if (opCF == null) return null;  // operating CF required for all metrics

    const fcf = invCF != null ? opCF + invCF : null;

    const pCF       = opCF > 0 ? mktCap / opCF : null;
    const cfYield   = opCF > 0 ? (opCF / mktCap) * 100 : null;
    const fcfYield  = fcf != null && mktCap > 0 ? (fcf / mktCap) * 100 : null;

    // PER ÷ P/CF: values > 1 mean the stock generates more cash than its earnings
    // imply, a signal for CF-divergence strategies.
    const per = fin.per ?? null;
    const perPcfRatio = per != null && per > 0 && pCF != null && pCF > 0
      ? per / pCF
      : null;

    return { pCF, cfYield, fcfYield, perPcfRatio };
  }

  /**
   * Convenience: returns both the fundamental snapshot and CF metrics for
   * a given code and date in a single call (reduces round-trips in the engine).
   *
   * @param {string} code
   * @param {string} date - YYYY-MM-DD
   */
  async getSnapshot(code, date) {
    const timeline = await this.fundamental.getEventTimeline(code);
    const snapshot = timeline.getSnapshot(date);

    const cfMetrics = snapshot.annual
      ? await this.getCFMetrics(code, date)
      : null;

    return { ...snapshot, cfMetrics };
  }
}
