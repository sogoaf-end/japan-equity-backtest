export function createSmaCrossStrategy({ shortWindow = 5, longWindow = 20 } = {}) {
  if (!Number.isInteger(shortWindow) || !Number.isInteger(longWindow)) {
    throw new Error("shortWindow and longWindow must be integers.");
  }

  if (shortWindow <= 0 || longWindow <= 0 || shortWindow >= longWindow) {
    throw new Error("Use positive windows and keep shortWindow < longWindow.");
  }

  return {
    name: `sma_cross_${shortWindow}_${longWindow}`,
    decide({ index, bars }) {
      if (index + 1 < longWindow) {
        return null;
      }

      const closes = bars.slice(0, index + 1).map((bar) => bar.close);
      const shortSma = average(closes.slice(-shortWindow));
      const longSma = average(closes.slice(-longWindow));

      return shortSma > longSma ? 1 : 0;
    }
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}