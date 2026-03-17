import test from 'node:test';
import assert from 'node:assert/strict';

import { EventTimeline, nextBusinessDay } from '../src/data/eventTimeline.js';

// ---------------------------------------------------------------------------
// nextBusinessDay
// ---------------------------------------------------------------------------

test('nextBusinessDay skips Saturday → Monday', () => {
  // 2024-08-10 (Sat) → 2024-08-13 (Tue, because 8/11 Mon is 山の日, 8/12 Sun)
  assert.equal(nextBusinessDay('2024-08-10'), '2024-08-13');
});

test('nextBusinessDay skips Sunday to Monday when no holiday', () => {
  // 2024-06-09 (Sun) → 2024-06-10 (Mon)
  assert.equal(nextBusinessDay('2024-06-09'), '2024-06-10');
});

test('nextBusinessDay skips JP holiday (2025-01-13 成人の日)', () => {
  // 2025-01-12 (Sun) would normally give 1/13, but 1/13 is 成人の日
  assert.equal(nextBusinessDay('2025-01-12'), '2025-01-14');
});

// ---------------------------------------------------------------------------
// EventTimeline.addEarnings - 15:00 threshold
// ---------------------------------------------------------------------------

test('earnings at 14:00 available same day', () => {
  const tl = new EventTimeline();
  tl.addEarnings('2026-02-06', '14:00', { eps: 10 });

  assert.deepEqual(tl.getAsOf('2026-02-06', 'earnings'), { eps: 10 });
  assert.equal(tl.getAsOf('2026-02-05', 'earnings'), null);
});

test('earnings at 15:00 available next business day', () => {
  const tl = new EventTimeline();
  // 2026-02-06 is a Friday; next business day is 2026-02-09 (Mon)
  tl.addEarnings('2026-02-06', '15:00', { eps: 20 });

  assert.equal(tl.getAsOf('2026-02-06', 'earnings'), null);
  assert.deepEqual(tl.getAsOf('2026-02-09', 'earnings'), { eps: 20 });
});

test('earnings at 16:30 also available next business day', () => {
  const tl = new EventTimeline();
  tl.addEarnings('2024-11-08', '16:30', { eps: 5 });

  assert.equal(tl.getAsOf('2024-11-08', 'earnings'), null);
  assert.deepEqual(tl.getAsOf('2024-11-11', 'earnings'), { eps: 5 });
});

// ---------------------------------------------------------------------------
// EventTimeline.addAnnualReport
// ---------------------------------------------------------------------------

test('annual report available from submitDateTime date', () => {
  const tl = new EventTimeline();
  tl.addAnnualReport('2025-06-18 15:30', { revenue: 48_000_000_000_000 });

  assert.equal(tl.getAsOf('2025-06-17', 'annual_report'), null);
  assert.ok(tl.getAsOf('2025-06-18', 'annual_report') !== null);
});

test('annual report with null submitDateTime is ignored', () => {
  const tl = new EventTimeline();
  tl.addAnnualReport(null, { revenue: 999 }); // pre-FY2016 edge case
  assert.equal(tl.getAsOf('2030-01-01', 'annual_report'), null);
});

// ---------------------------------------------------------------------------
// getAsOf sorts by availableFrom (design review fix #1)
// ---------------------------------------------------------------------------

test('getAsOf returns most recent by availableFrom, not date', () => {
  const tl = new EventTimeline();

  // Two earnings on the same calendar date but different availableFrom.
  // 2024-06-07 is a Friday with no surrounding holidays.
  // - original at 14:00 → availableFrom = '2024-06-07' (same day)
  // - correction at 15:30 → availableFrom = nextBusinessDay('2024-06-07') = '2024-06-10' (Mon)
  tl.addEarnings('2024-06-07', '14:00', { eps: 100, version: 'original' });
  tl.addEarnings('2024-06-07', '15:30', { eps: 102, version: 'correction' });

  // On 2024-06-07 only the 14:00 disclosure is available
  assert.equal(tl.getAsOf('2024-06-07', 'earnings')?.version, 'original');

  // On 2024-06-10 (Mon) both are available; availableFrom '2024-06-10' > '2024-06-07'
  // → correction wins (sorted by availableFrom, not date)
  assert.equal(tl.getAsOf('2024-06-10', 'earnings')?.version, 'correction');
});

// ---------------------------------------------------------------------------
// getSnapshot
// ---------------------------------------------------------------------------

test('getSnapshot returns both annual and earnings', () => {
  const tl = new EventTimeline();
  tl.addAnnualReport('2025-06-18', { revenue: 100 });
  tl.addEarnings('2025-08-08', '14:00', { eps: 50 });

  const snap = tl.getSnapshot('2025-09-01');
  assert.deepEqual(snap.annual,   { revenue: 100 });
  assert.deepEqual(snap.earnings, { eps: 50 });
});

test('getSnapshot returns nulls before any data is available', () => {
  const tl = new EventTimeline();
  tl.addAnnualReport('2025-06-18', { revenue: 100 });

  const snap = tl.getSnapshot('2025-01-01');
  assert.equal(snap.annual, null);
  assert.equal(snap.earnings, null);
});

// ---------------------------------------------------------------------------
// Multiple annual reports: getAsOf returns most recent
// ---------------------------------------------------------------------------

test('getAsOf returns most recent annual report for a given date', () => {
  const tl = new EventTimeline();
  tl.addAnnualReport('2023-06-30', { fiscalYear: 2023 });
  tl.addAnnualReport('2024-06-25', { fiscalYear: 2024 });
  tl.addAnnualReport('2025-06-18', { fiscalYear: 2025 });

  assert.equal(tl.getAsOf('2024-01-01', 'annual_report')?.fiscalYear, 2023);
  assert.equal(tl.getAsOf('2024-07-01', 'annual_report')?.fiscalYear, 2024);
  assert.equal(tl.getAsOf('2025-12-31', 'annual_report')?.fiscalYear, 2025);
});
