/**
 * EdinetProvider: EDINET DB data source via MCP HTTP (streamable HTTP/JSON-RPC).
 *
 * Design review concerns addressed:
 *  #4 - resolveEdinetCode: lazy-loaded codeMap with file-cache; batch resolution available.
 *  #5 - multi-stock cost: resolveBatch() uses search_companies_batch for bulk lookups.
 *
 * The EDINET DB MCP server is called via JSON-RPC over HTTP (--transport http).
 * Each tool call is a POST to the MCP endpoint with a JSON-RPC 2.0 body.
 *
 * Data units from EDINET DB:
 *   get_financials → amounts in full JPY (e.g., 48_036_704_000_000 for 48兆円)
 *   get_earnings   → amounts in millions JPY
 */

import { DataProvider } from './base.js';
import { EventTimeline } from '../eventTimeline.js';
import { loadConfig } from '../../lib/config.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** secCode normalization: "7203" → "72030", "72030" → "72030" */
export function normalizeCode(code) {
  const s = String(code).replace(/\D/g, '');
  return s.length === 4 ? `${s}0` : s;
}

/** Today's date as YYYY-MM-DD (UTC). */
function today() {
  return new Date().toISOString().slice(0, 10);
}

export class EdinetProvider extends DataProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]   - Bearer token for EDINET DB
   * @param {string} [options.mcpUrl]   - MCP endpoint URL
   * @param {import('../cache.js').DataCache} [options.cache]
   * @param {string} [options.cacheDir] - directory for code-map persistence
   */
  constructor({ apiKey, mcpUrl, cache, cacheDir = '.cache' } = {}) {
    super();
    const cfg = loadConfig().edinetDb;
    this.apiKey  = apiKey  ?? cfg.apiKey;
    this.mcpUrl  = mcpUrl  ?? cfg.mcpUrl;
    this.cache   = cache   ?? null;
    this.cacheDir = resolve(cacheDir);

    /** @type {Map<string, string>|null} secCode → edinetCode */
    this._codeMap = null;
    this._rpcId = 1;
  }

  // ---------------------------------------------------------------------------
  // DataProvider interface
  // ---------------------------------------------------------------------------

  /** @override */
  async getFinancials(code, asOfDate) {
    const timeline = await this.getEventTimeline(code);
    return timeline.getAsOf(asOfDate, 'annual_report');
  }

  /** @override */
  async getEarnings(code, asOfDate) {
    const timeline = await this.getEventTimeline(code);
    return timeline.getAsOf(asOfDate, 'earnings');
  }

  /** @override */
  async getHealthScore(code) {
    const edinetCode = await this.resolveEdinetCode(code);
    if (!edinetCode) return null;
    const analysis = await this._callTool('get_analysis', { edinet_code: edinetCode });
    return analysis?.credit?.score ?? null;
  }

  /**
   * Search for companies by industry, health score, etc.
   * @override
   * @param {{ query?: string, industry?: string, minHealthScore?: number, limit?: number }} filters
   */
  async getUniverse({ query = '', industry, minHealthScore, limit = 50 } = {}) {
    const cacheParams = { query, industry, min_health_score: minHealthScore, limit };
    const cached = this.cache?.get('search_companies', cacheParams, today());
    if (cached) return cached;

    const result = await this._callTool('search_companies', {
      query,
      ...(industry        != null && { industry }),
      ...(minHealthScore  != null && { min_health_score: minHealthScore }),
      limit,
    });

    const companies = result?.companies ?? [];
    this.cache?.set('search_companies', cacheParams, companies, today());
    return companies;
  }

  /**
   * Build a full EventTimeline for a company (annual reports + earnings).
   * Results are cached in memory (per-code) for the lifetime of this provider instance.
   * @override
   * @param {string} code - J-Quants secCode (e.g. "72030")
   */
  async getEventTimeline(code) {
    const edinetCode = await this.resolveEdinetCode(code);
    if (!edinetCode) return new EventTimeline();

    // Memory cache per provider instance (timeline is immutable for a given code+day)
    if (!this._timelines) this._timelines = new Map();
    const cacheKey = `${edinetCode}:${today()}`;
    if (this._timelines.has(cacheKey)) return this._timelines.get(cacheKey);

    const [financialsRaw, earningsRaw] = await Promise.all([
      this._fetchFinancials(edinetCode),
      this._fetchEarnings(edinetCode),
    ]);

    const timeline = new EventTimeline();

    // Annual reports: only register entries with a known submitDateTime
    // (pre-FY2016 data may have null submitDateTime - Section 9 / concern note)
    for (const fy of financialsRaw) {
      if (fy.submitDateTime) {
        timeline.addAnnualReport(fy.submitDateTime, fy);
      }
    }

    // Earnings disclosures
    for (const e of earningsRaw) {
      if (e.disclosureDate) {
        timeline.addEarnings(e.disclosureDate, e.disclosureTime ?? null, e);
      }
    }

    this._timelines.set(cacheKey, timeline);
    return timeline;
  }

  // ---------------------------------------------------------------------------
  // secCode ↔ edinetCode resolution (concern #4)
  // ---------------------------------------------------------------------------

  /**
   * Resolve a J-Quants secCode to an EDINET code.
   * Uses a file-persisted codeMap so the lookup survives process restarts.
   *
   * @param {string} secCode
   * @returns {Promise<string|null>}
   */
  async resolveEdinetCode(secCode) {
    const normalized = normalizeCode(secCode);
    const map = await this._getCodeMap();
    if (map.has(normalized)) return map.get(normalized) ?? null;

    // Not in map yet → fetch individually and update
    const result = await this._callTool('search_companies', { query: normalized, limit: 1 });
    const company = result?.companies?.[0];
    const edinetCode = company?.edinetCode ?? null;
    map.set(normalized, edinetCode);
    this._persistCodeMap(map);
    return edinetCode;
  }

  /**
   * Resolve multiple secCodes in one batch (concern #5: reduces API call count).
   * Uses search_companies_batch when available, falls back to sequential resolution.
   *
   * @param {string[]} secCodes
   * @returns {Promise<Map<string, string|null>>} secCode → edinetCode
   */
  async resolveBatch(secCodes) {
    const map = await this._getCodeMap();
    const missing = secCodes
      .map(c => normalizeCode(c))
      .filter(c => !map.has(c));

    if (missing.length > 0) {
      await this._batchFetch(missing, map);
      this._persistCodeMap(map);
    }

    return new Map(
      secCodes.map(c => [normalizeCode(c), map.get(normalizeCode(c)) ?? null])
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  async _getCodeMap() {
    if (this._codeMap) return this._codeMap;

    // Load persisted map from disk
    const fp = this._codeMapPath();
    if (existsSync(fp)) {
      try {
        const raw = JSON.parse(readFileSync(fp, 'utf8'));
        this._codeMap = new Map(Object.entries(raw));
        return this._codeMap;
      } catch { /* start fresh */ }
    }
    this._codeMap = new Map();
    return this._codeMap;
  }

  _codeMapPath() {
    return resolve(this.cacheDir, 'edinet-codemap.json');
  }

  _persistCodeMap(map) {
    const dir = this.cacheDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(map);
    writeFileSync(this._codeMapPath(), JSON.stringify(obj), 'utf8');
  }

  /** Batch-fetch up to N codes using search_companies_batch, falling back to sequential. */
  async _batchFetch(normalized, map) {
    try {
      const result = await this._callTool('search_companies_batch', { codes: normalized });
      const companies = result?.companies ?? [];
      for (const c of companies) {
        if (c.secCode && c.edinetCode) map.set(normalizeCode(c.secCode), c.edinetCode);
      }
    } catch {
      // Fallback: resolve sequentially
      for (const code of normalized) {
        if (!map.has(code)) await this.resolveEdinetCode(code);
      }
    }
  }

  async _fetchFinancials(edinetCode) {
    const params = { edinet_code: edinetCode, period: 'annual', years: 6 };
    const cached = this.cache?.get('get_financials', params, today());
    if (cached) return cached;

    const data = await this._callTool('get_financials', params);
    const result = Array.isArray(data) ? data : [];
    this.cache?.set('get_financials', params, result, today());
    return result;
  }

  async _fetchEarnings(edinetCode) {
    const params = { edinet_code: edinetCode, limit: 30 };
    const cached = this.cache?.get('get_earnings', params, today());
    if (cached) return cached;

    const data = await this._callTool('get_earnings', params);
    const result = data?.earnings ?? [];
    this.cache?.set('get_earnings', params, result, today());
    return result;
  }

  /**
   * Call an EDINET DB MCP tool via JSON-RPC 2.0 over HTTP.
   * The MCP server is accessed with --transport http (streamable HTTP).
   *
   * @param {string} toolName
   * @param {object} args
   * @returns {Promise<unknown>}
   */
  async _callTool(toolName, args) {
    const id = this._rpcId++;
    const response = await fetch(this.mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method:  'tools/call',
        params:  { name: toolName, arguments: args },
        id,
      }),
    });

    if (!response.ok) {
      throw new Error(`EDINET DB MCP error ${response.status} on tool "${toolName}"`);
    }

    const envelope = await response.json();

    if (envelope.error) {
      throw new Error(`EDINET DB RPC error: ${envelope.error.message ?? JSON.stringify(envelope.error)}`);
    }

    // MCP returns { result: { content: [{ type: 'text', text: '...' }] } }
    const text = envelope.result?.content?.[0]?.text;
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
