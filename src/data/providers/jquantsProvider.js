import { DataProvider } from './base.js';
import { JQuantsClient } from '../../lib/jquants/client.js';
import { getDailyQuotes, getListedInfo } from '../../lib/jquants/marketData.js';
import { loadConfig } from '../../lib/config.js';

export class JQuantsProvider extends DataProvider {
  /**
   * @param {object} [options]
   * @param {object} [options.config] - jquants config (defaults to loadConfig().jquants)
   * @param {import('../cache.js').DataCache} [options.cache]
   */
  constructor({ config, cache } = {}) {
    super();
    const cfg = config ?? loadConfig().jquants;
    this.client = new JQuantsClient(cfg);
    this.cache = cache ?? null;
  }

  /**
   * Fetch adjusted daily OHLCV bars for a stock code.
   * @param {string} code - J-Quants code e.g. "72030"
   * @param {string} from - YYYY-MM-DD
   * @param {string} to   - YYYY-MM-DD
   * @returns {Promise<Array<import('../../backtest/engine.js').BacktestBar>>}
   */
  async getBars(code, from, to) {
    const { items } = await getDailyQuotes(this.client, { code, from, to });
    return items.map(q => ({
      code: q.code,
      date: q.date,
      open:   q.open,
      high:   q.high,
      low:    q.low,
      close:  q.close,
      volume: q.volume,
    }));
  }

  /**
   * Get market cap (in JPY) for a specific date.
   * J-Quants provides MarketCapitalization in millions of JPY when available.
   * Falls back to null if data is unavailable (e.g., free-plan restriction).
   *
   * @param {string} code - J-Quants code
   * @param {string} date - YYYY-MM-DD
   * @returns {Promise<number|null>} market cap in JPY
   */
  async getMarketCap(code, date) {
    const { items } = await getDailyQuotes(this.client, { code, date });
    const bar = items[0];
    if (!bar) return null;
    // MarketCapitalization from J-Quants is in millions of JPY
    if (bar.marketCap != null) return bar.marketCap * 1_000_000;
    return null;
  }

  /**
   * Fetch company master data (listed info).
   * @param {string} [code]
   */
  async getListedInfo(code) {
    const { items } = await getListedInfo(this.client, { code });
    return items;
  }
}
