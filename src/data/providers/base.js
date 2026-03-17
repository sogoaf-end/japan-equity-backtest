/**
 * DataProvider: abstract interface for all data sources.
 *
 * Price-axis methods → implemented by JQuantsProvider
 * Fundamental-axis methods → implemented by EdinetProvider
 * Composite metrics → implemented by CompositeProvider
 */
export class DataProvider {
  /** @returns {Promise<Array<import('../../backtest/engine.js').BacktestBar>>} */
  async getBars(_code, _from, _to) { throw new Error('not implemented'); }

  /** Market cap in JPY. @returns {Promise<number|null>} */
  async getMarketCap(_code, _date) { throw new Error('not implemented'); }

  /** Annual financials as of date (look-ahead bias safe). @returns {Promise<object|null>} */
  async getFinancials(_code, _asOfDate) { throw new Error('not implemented'); }

  /** Most recent earnings disclosure as of date. @returns {Promise<object|null>} */
  async getEarnings(_code, _asOfDate) { throw new Error('not implemented'); }

  /** Financial health score (0-100). @returns {Promise<number|null>} */
  async getHealthScore(_code) { throw new Error('not implemented'); }

  /** Universe of companies matching filters. @returns {Promise<Array<object>>} */
  async getUniverse(_filters) { throw new Error('not implemented'); }

  /** Full EventTimeline for look-ahead-bias-safe as-of queries. @returns {Promise<import('../eventTimeline.js').EventTimeline>} */
  async getEventTimeline(_code) { throw new Error('not implemented'); }
}
