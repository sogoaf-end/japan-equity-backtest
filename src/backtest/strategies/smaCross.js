/**
 * @typedef {Object} SmaCrossOptions
 * @property {number} [shortWindow]
 * @property {number} [longWindow]
 */

/**
 * The strategy contract is intentionally simple:
 * - `bars` only contains data visible at the decision point
 * - `index` points to the latest visible bar
 * - return `1` for fully long or `0` for flat
 *
 * @param {SmaCrossOptions} [options]
 * @returns {import("../engine.js").Strategy}
 */
export function createSmaCrossStrategy({ shortWindow = 5, longWindow = 20 } = {}) {
  if (!Number.isInteger(shortWindow) || !Number.isInteger(longWindow)) {
    throw new Error("shortWindow and longWindow must be integers.");
  }

  if (shortWindow <= 0 || longWindow <= 0 || shortWindow >= longWindow) {
    throw new Error("Use positive windows and keep shortWindow < longWindow.");
  }

  return {
    name: `sma_cross_${shortWindow}_${longWindow}`,
    decide({ bars }) {
      if (bars.length < longWindow) {
        return null;
      }

      const closes = bars.map((bar) => bar.close);
      const shortSma = average(closes.slice(-shortWindow));
      const longSma = average(closes.slice(-longWindow));

      return shortSma > longSma ? 1 : 0;
    }
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}