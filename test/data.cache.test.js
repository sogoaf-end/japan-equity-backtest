import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DataCache } from '../src/data/cache.js';

// ---------------------------------------------------------------------------
// Live mode (in-memory TTL)
// ---------------------------------------------------------------------------

test('live cache: returns null on cold miss', () => {
  const cache = new DataCache({ mode: 'live' });
  assert.equal(cache.get('get_financials', { edinet_code: 'E02144' }), null);
});

test('live cache: returns stored value before TTL', () => {
  const cache = new DataCache({ mode: 'live' });
  const data = { revenue: 100 };
  cache.set('get_financials', { edinet_code: 'E02144' }, data);
  assert.deepEqual(cache.get('get_financials', { edinet_code: 'E02144' }), data);
});

test('live cache: keys are order-independent (stable JSON)', () => {
  const cache = new DataCache({ mode: 'live' });
  cache.set('get_financials', { years: 6, edinet_code: 'E02144' }, { v: 1 });
  // Different insertion order, same logical key
  assert.deepEqual(
    cache.get('get_financials', { edinet_code: 'E02144', years: 6 }),
    { v: 1 }
  );
});

test('live cache: different tools have separate keys', () => {
  const cache = new DataCache({ mode: 'live' });
  cache.set('get_financials', { edinet_code: 'E02144' }, { type: 'fin' });
  cache.set('get_earnings',   { edinet_code: 'E02144' }, { type: 'earn' });
  assert.equal(cache.get('get_financials', { edinet_code: 'E02144' })?.type, 'fin');
  assert.equal(cache.get('get_earnings',   { edinet_code: 'E02144' })?.type, 'earn');
});

// ---------------------------------------------------------------------------
// Backtest mode (persistent file cache)
// ---------------------------------------------------------------------------

let tmpDir;

test('backtest cache: persist and reload across instances', () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bt-cache-test-'));
  const params = { edinet_code: 'E02144', period: 'annual', years: 6 };
  const data   = [{ fiscalYear: 2025, revenue: 48_000_000_000_000 }];

  const cache1 = new DataCache({ mode: 'backtest', cacheDir: tmpDir });
  cache1.set('get_financials', params, data, '2025-09-01');

  // New instance – simulates next process run
  const cache2 = new DataCache({ mode: 'backtest', cacheDir: tmpDir });
  assert.deepEqual(cache2.get('get_financials', params, '2025-09-01'), data);
});

test('backtest cache: different asOfDates are isolated', () => {
  const cache  = new DataCache({ mode: 'backtest', cacheDir: tmpDir });
  const params = { edinet_code: 'E99999' };
  cache.set('get_financials', params, { v: 'A' }, '2024-01-01');
  cache.set('get_financials', params, { v: 'B' }, '2025-01-01');

  assert.equal(cache.get('get_financials', params, '2024-01-01')?.v, 'A');
  assert.equal(cache.get('get_financials', params, '2025-01-01')?.v, 'B');
});

test('backtest cache: returns null when asOfDate not provided', () => {
  const cache = new DataCache({ mode: 'backtest', cacheDir: tmpDir });
  cache.set('get_financials', { edinet_code: 'E00001' }, { v: 1 });
  assert.equal(cache.get('get_financials', { edinet_code: 'E00001' }), null);
});

test('backtest cache: cleanup temp dir', () => {
  rmSync(tmpDir, { recursive: true, force: true });
});
