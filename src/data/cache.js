/**
 * DataCache: two-track caching strategy (design review concern #3).
 *
 *  - "backtest" mode: persistent JSON file cache keyed by (tool, params, asOfDate).
 *    Never expires; every API response is stored by the date it was fetched,
 *    making backtest runs deterministic and reproducible.
 *
 *  - "live" mode: in-memory TTL cache.
 *    Data expires after the policy defined in DEFAULT_TTL_MS.
 *    Suitable for paper trading or real-time signal generation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/** @typedef {'backtest' | 'live'} CacheMode */

/** TTL in milliseconds for live mode, keyed by EDINET DB tool name. */
const DEFAULT_TTL_MS = {
  get_financials:    24 * 60 * 60 * 1000,       // 24 h  (annual update)
  get_earnings:       1 * 60 * 60 * 1000,        //  1 h  (TDNet updates frequently)
  get_company:       24 * 60 * 60 * 1000,        // 24 h
  get_ranking:       24 * 60 * 60 * 1000,        // 24 h
  get_analysis:      24 * 60 * 60 * 1000,        // 24 h
  get_text_blocks:   30 * 24 * 60 * 60 * 1000,  // 30 d  (annual report text)
  search_companies:   7 * 24 * 60 * 60 * 1000,  //  7 d  (company master)
  getDailyQuotes:     1 * 60 * 60 * 1000,        //  1 h  (today's price)
};

export class DataCache {
  /**
   * @param {object} [options]
   * @param {CacheMode} [options.mode='live']
   * @param {string} [options.cacheDir='.cache']
   */
  constructor({ mode = 'live', cacheDir = '.cache' } = {}) {
    this.mode = mode;
    this.cacheDir = resolve(cacheDir);
    /** @type {Map<string, {data: unknown, expiresAt: number}>} */
    this.memory = new Map();
  }

  /**
   * Retrieve a cached value.
   *
   * @param {string} tool - API tool / method name
   * @param {object} params - call parameters (used as cache key)
   * @param {string} [asOfDate] - YYYY-MM-DD; required for backtest mode
   * @returns {unknown|null}
   */
  get(tool, params, asOfDate) {
    const key = buildKey(tool, params);

    if (this.mode === 'backtest') {
      return asOfDate ? this._fileGet(tool, key, asOfDate) : null;
    }

    const entry = this.memory.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.data;
    this.memory.delete(key);
    return null;
  }

  /**
   * Store a value in the cache.
   *
   * @param {string} tool
   * @param {object} params
   * @param {unknown} data
   * @param {string} [asOfDate] - required for backtest mode
   */
  set(tool, params, data, asOfDate) {
    const key = buildKey(tool, params);

    if (this.mode === 'backtest') {
      if (asOfDate) this._fileSet(tool, key, asOfDate, data);
      return;
    }

    const ttl = DEFAULT_TTL_MS[tool] ?? DEFAULT_TTL_MS.get_financials;
    this.memory.set(key, { data, expiresAt: Date.now() + ttl });
  }

  // ---------------------------------------------------------------------------
  // Backtest: persistent file cache
  // Layout: <cacheDir>/backtest/<tool>/<asOfDate>.json
  //         Each file is a JSON object mapping key → data.
  // ---------------------------------------------------------------------------

  _filePath(tool, asOfDate) {
    return resolve(this.cacheDir, 'backtest', tool, `${asOfDate}.json`);
  }

  _fileGet(tool, key, asOfDate) {
    const fp = this._filePath(tool, asOfDate);
    if (!existsSync(fp)) return null;
    try {
      const store = JSON.parse(readFileSync(fp, 'utf8'));
      return key in store ? store[key] : null;
    } catch {
      return null;
    }
  }

  _fileSet(tool, key, asOfDate, data) {
    const fp = this._filePath(tool, asOfDate);
    const dir = dirname(fp);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let store = {};
    if (existsSync(fp)) {
      try { store = JSON.parse(readFileSync(fp, 'utf8')); } catch { /* ok, start fresh */ }
    }
    store[key] = data;
    writeFileSync(fp, JSON.stringify(store), 'utf8');
  }
}

/** Stable JSON key regardless of property insertion order. */
function buildKey(tool, params) {
  return `${tool}:${JSON.stringify(params, Object.keys(params ?? {}).sort())}`;
}
