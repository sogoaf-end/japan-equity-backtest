/**
 * EventTimeline: manages "as-of" fundamental data snapshots
 * to prevent look-ahead bias in backtests.
 *
 * Core rule: data is only "available" from its disclosure date,
 * not from when the period it covers ended.
 */

/**
 * Japanese national holidays and TSE custom closure dates, 2014-2030.
 * Rule: national holidays that fall on Sunday are observed the following Monday (振替休日).
 * TSE also closes on 1/2, 1/3, and 12/31 every year.
 *
 * Note: for production accuracy install @holiday-jp/holiday_jp and call setHolidays()
 * with its output, as this static set may miss occasional 振替休日 edge cases.
 */
const JP_HOLIDAYS = new Set([
  // 2014
  '2014-01-01','2014-01-02','2014-01-03','2014-01-13',
  '2014-02-11',
  '2014-03-21',
  '2014-04-29',
  '2014-05-03','2014-05-04','2014-05-05','2014-05-06',
  '2014-07-21',
  '2014-09-15','2014-09-23',
  '2014-10-13',
  '2014-11-03','2014-11-24',
  '2014-12-23','2014-12-31',
  // 2015
  '2015-01-01','2015-01-02','2015-01-03','2015-01-12',
  '2015-02-11',
  '2015-03-21',
  '2015-04-29',
  '2015-05-03','2015-05-04','2015-05-05','2015-05-06',
  '2015-07-20',
  '2015-09-21','2015-09-22','2015-09-23',
  '2015-10-12',
  '2015-11-03','2015-11-23',
  '2015-12-23','2015-12-31',
  // 2016
  '2016-01-01','2016-01-02','2016-01-03','2016-01-11',
  '2016-02-11',
  '2016-03-20','2016-03-21',
  '2016-04-29',
  '2016-05-03','2016-05-04','2016-05-05',
  '2016-07-18',
  '2016-08-11',
  '2016-09-19','2016-09-22',
  '2016-10-10',
  '2016-11-03','2016-11-23',
  '2016-12-23','2016-12-31',
  // 2017
  '2017-01-01','2017-01-02','2017-01-03','2017-01-09',
  '2017-02-11',
  '2017-03-20',
  '2017-04-29',
  '2017-05-03','2017-05-04','2017-05-05',
  '2017-07-17',
  '2017-08-11',
  '2017-09-18','2017-09-23',
  '2017-10-09',
  '2017-11-03','2017-11-23',
  '2017-12-23','2017-12-31',
  // 2018
  '2018-01-01','2018-01-02','2018-01-03','2018-01-08',
  '2018-02-11','2018-02-12',
  '2018-03-21',
  '2018-04-29',
  '2018-05-03','2018-05-04','2018-05-05',
  '2018-07-16',
  '2018-08-11',
  '2018-09-17','2018-09-23','2018-09-24',
  '2018-10-08',
  '2018-11-03','2018-11-23',
  '2018-12-23','2018-12-24','2018-12-31',
  // 2019 (special: imperial transition)
  '2019-01-01','2019-01-02','2019-01-03','2019-01-14',
  '2019-02-11',
  '2019-03-21',
  '2019-04-29',
  '2019-04-30',
  '2019-05-01','2019-05-02','2019-05-03','2019-05-04','2019-05-05','2019-05-06',
  '2019-07-15',
  '2019-08-11','2019-08-12',
  '2019-09-16','2019-09-23',
  '2019-10-14','2019-10-22',
  '2019-11-03','2019-11-04','2019-11-23',
  '2019-12-31',
  // 2020 (Olympics-adjusted)
  '2020-01-01','2020-01-02','2020-01-03','2020-01-13',
  '2020-02-11',
  '2020-02-23','2020-02-24',
  '2020-03-20',
  '2020-04-29',
  '2020-05-03','2020-05-04','2020-05-05','2020-05-06',
  '2020-07-23','2020-07-24',
  '2020-08-10',
  '2020-09-21','2020-09-22',
  '2020-11-03','2020-11-23',
  '2020-12-31',
  // 2021 (Olympics-adjusted)
  '2021-01-01','2021-01-02','2021-01-03','2021-01-11',
  '2021-02-11',
  '2021-02-23',
  '2021-03-20',
  '2021-04-29',
  '2021-05-03','2021-05-04','2021-05-05',
  '2021-07-22','2021-07-23',
  '2021-08-08','2021-08-09',
  '2021-09-20','2021-09-23',
  '2021-11-03','2021-11-23',
  '2021-12-31',
  // 2022
  '2022-01-01','2022-01-02','2022-01-03','2022-01-10',
  '2022-02-11',
  '2022-02-23',
  '2022-03-21',
  '2022-04-29',
  '2022-05-03','2022-05-04','2022-05-05',
  '2022-07-18',
  '2022-08-11',
  '2022-09-19','2022-09-23',
  '2022-10-10',
  '2022-11-03','2022-11-23',
  '2022-12-31',
  // 2023
  '2023-01-01','2023-01-02','2023-01-03','2023-01-09',
  '2023-02-11',
  '2023-02-23',
  '2023-03-21',
  '2023-04-29',
  '2023-05-03','2023-05-04','2023-05-05',
  '2023-07-17',
  '2023-08-11',
  '2023-09-18','2023-09-23',
  '2023-10-09',
  '2023-11-03','2023-11-23',
  '2023-12-31',
  // 2024
  '2024-01-01','2024-01-02','2024-01-03','2024-01-08',
  '2024-02-11','2024-02-12',
  '2024-02-23',
  '2024-03-20',
  '2024-04-29',
  '2024-05-03','2024-05-04','2024-05-05','2024-05-06',
  '2024-07-15',
  '2024-08-11','2024-08-12',
  '2024-09-16','2024-09-22','2024-09-23',
  '2024-10-14',
  '2024-11-03','2024-11-04','2024-11-23',
  '2024-12-31',
  // 2025
  '2025-01-01','2025-01-02','2025-01-03','2025-01-13',
  '2025-02-11',
  '2025-02-23','2025-02-24',
  '2025-03-20',
  '2025-04-29',
  '2025-05-03','2025-05-04','2025-05-05','2025-05-06',
  '2025-07-21',
  '2025-08-11',
  '2025-09-15','2025-09-23',
  '2025-10-13',
  '2025-11-03','2025-11-23','2025-11-24',
  '2025-12-31',
  // 2026
  '2026-01-01','2026-01-02','2026-01-03','2026-01-12',
  '2026-02-11',
  '2026-02-23',
  '2026-03-20',
  '2026-04-29',
  '2026-05-03','2026-05-04','2026-05-05','2026-05-06',
  '2026-07-20',
  '2026-08-11',
  '2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12',
  '2026-11-03','2026-11-23',
  '2026-12-31',
  // 2027
  '2027-01-01','2027-01-02','2027-01-03','2027-01-11',
  '2027-02-11',
  '2027-02-23',
  '2027-03-21',
  '2027-04-29',
  '2027-05-03','2027-05-04','2027-05-05',
  '2027-07-19',
  '2027-08-11',
  '2027-09-20','2027-09-23',
  '2027-10-11',
  '2027-11-03','2027-11-23',
  '2027-12-31',
  // 2028
  '2028-01-01','2028-01-02','2028-01-03','2028-01-10',
  '2028-02-11',
  '2028-02-23',
  '2028-03-20',
  '2028-04-29',
  '2028-05-03','2028-05-04','2028-05-05',
  '2028-07-17',
  '2028-08-11',
  '2028-09-18','2028-09-22',
  '2028-10-09',
  '2028-11-03','2028-11-23',
  '2028-12-31',
  // 2029
  '2029-01-01','2029-01-02','2029-01-03','2029-01-08',
  '2029-02-11','2029-02-12',
  '2029-02-23',
  '2029-03-20',
  '2029-04-29','2029-04-30',
  '2029-05-03','2029-05-04','2029-05-05',
  '2029-07-16',
  '2029-08-11','2029-08-12',
  '2029-09-17','2029-09-23',
  '2029-10-08',
  '2029-11-03','2029-11-23',
  '2029-12-31',
  // 2030
  '2030-01-01','2030-01-02','2030-01-03','2030-01-14',
  '2030-02-11',
  '2030-02-23',
  '2030-03-20',
  '2030-04-29',
  '2030-05-03','2030-05-04','2030-05-05',
  '2030-07-15',
  '2030-08-11','2030-08-12',
  '2030-09-16','2030-09-22',
  '2030-10-14',
  '2030-11-03','2030-11-04','2030-11-23',
  '2030-12-31',
]);

/**
 * Augment the holiday set (e.g., from @holiday-jp/holiday_jp).
 * @param {Iterable<string>} dates - YYYY-MM-DD strings
 */
export function setHolidays(dates) {
  for (const d of dates) JP_HOLIDAYS.add(d);
}

/**
 * @param {Date} d
 * @returns {boolean}
 */
function isNonBusinessDay(d) {
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return true;
  return JP_HOLIDAYS.has(d.toISOString().slice(0, 10));
}

/**
 * Returns the next business day after dateStr, skipping weekends and JP holidays.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
export function nextBusinessDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (isNonBusinessDay(d));
  return d.toISOString().slice(0, 10);
}

export class EventTimeline {
  constructor() {
    /**
     * @type {Array<{
     *   date: string,
     *   availableFrom: string,
     *   type: 'annual_report' | 'earnings',
     *   data: object
     * }>}
     */
    this.events = [];
  }

  /**
   * Register an annual securities report (有価証券報告書).
   * Data is available from the EDINET submission date (submitDateTime).
   *
   * @param {string} submitDateTime - "2025-06-18 15:30" or "2025-06-18"
   * @param {object} financials
   */
  addAnnualReport(submitDateTime, financials) {
    if (!submitDateTime) return; // FY2016以前は null の場合がある (Section 9 / concern #4 follow-up)
    const date = submitDateTime.slice(0, 10);
    this.events.push({
      date,
      availableFrom: date,
      type: 'annual_report',
      data: financials,
    });
  }

  /**
   * Register a TDNet earnings disclosure (決算短信).
   * Disclosures at or after 15:00 are only available from the next business day
   * (the market has already closed for the day).
   *
   * @param {string} disclosureDate - "2026-02-06"
   * @param {string|null} disclosureTime - "14:00" or "15:30" etc.
   * @param {object} earnings
   */
  addEarnings(disclosureDate, disclosureTime, earnings) {
    const hour = disclosureTime ? parseInt(disclosureTime.split(':')[0], 10) : 0;
    const availableFrom = hour >= 15
      ? nextBusinessDay(disclosureDate)
      : disclosureDate;

    this.events.push({
      date: disclosureDate,
      availableFrom,
      type: 'earnings',
      data: earnings,
    });
  }

  /**
   * Returns the most recent event of the given type available on `date`.
   *
   * Design review fix #1: sort by availableFrom (not date) so that same-date
   * events with different availableFrom values are correctly ordered, e.g.
   * when a correction notice is disclosed after-hours on the same day.
   *
   * @param {string} date - YYYY-MM-DD
   * @param {'annual_report' | 'earnings' | null} [type]
   * @returns {object|null}
   */
  getAsOf(date, type = null) {
    return this.events
      .filter(e => type === null || e.type === type)
      .filter(e => e.availableFrom <= date)
      .sort((a, b) => b.availableFrom.localeCompare(a.availableFrom))
      [0]?.data ?? null;
  }

  /**
   * Returns all fundamental data available on `date`.
   * @param {string} date - YYYY-MM-DD
   * @returns {{ annual: object|null, earnings: object|null }}
   */
  getSnapshot(date) {
    return {
      annual: this.getAsOf(date, 'annual_report'),
      earnings: this.getAsOf(date, 'earnings'),
    };
  }
}
