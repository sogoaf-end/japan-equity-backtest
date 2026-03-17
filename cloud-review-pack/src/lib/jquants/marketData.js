const DAILY_QUOTES_PATHS = {
  v1: ["/v1/prices/daily_quotes"],
  v2: [
    "/v2/equities/bars/daily",
    "/v2/prices/daily_quotes",
    "/v2/equities/daily_quotes",
    "/v1/prices/daily_quotes"
  ]
};

const LISTED_INFO_PATHS = {
  v1: ["/v1/listed/info"],
  v2: ["/v2/equities/master", "/v1/listed/info"]
};

export async function getListedInfo(client, { code } = {}) {
  const paths = client.config.listedInfoPath
    ? [client.config.listedInfoPath]
    : LISTED_INFO_PATHS[client.config.apiVersion] ?? LISTED_INFO_PATHS.v2;

  const response = await client.requestFirst(paths, {
    query: {
      code
    }
  });

  return {
    path: response.path,
    items: normalizeListedInfoResponse(response.data)
  };
}

export async function getDailyQuotes(client, { code, from, to, date } = {}) {
  const paths = client.config.dailyQuotesPath
    ? [client.config.dailyQuotesPath]
    : DAILY_QUOTES_PATHS[client.config.apiVersion] ?? DAILY_QUOTES_PATHS.v2;

  const items = [];
  let paginationKey;
  let resolvedPath = paths[0];

  do {
    const response = await client.requestFirst(paths, {
      query: {
        code,
        from: toJQuantsDate(from),
        to: toJQuantsDate(to),
        date: toJQuantsDate(date),
        pagination_key: paginationKey
      }
    });

    resolvedPath = response.path;
    items.push(...normalizeDailyQuotesResponse(response.data));
    paginationKey = pick(response.data, ["pagination_key", "paginationKey", "nextToken"]);
  } while (paginationKey);

  return {
    path: resolvedPath,
    items: sortQuotes(uniqueQuotes(items))
  };
}

export function normalizeDailyQuotesResponse(payload) {
  const rows = pickArray(payload, [
    "daily_quotes",
    "dailyQuotes",
    "prices",
    "items",
    "data",
    "list"
  ]);

  return rows.map(normalizeQuote).filter(Boolean);
}

export function normalizeListedInfoResponse(payload) {
  const rows = pickArray(payload, [
    "listed_info",
    "listedInfo",
    "info",
    "items",
    "data",
    "list",
    "equities"
  ]);

  return rows
    .map((row) => {
      const code = readString(row, ["Code", "LocalCode", "code", "localCode"]);
      const name = readString(row, [
        "CoName",
        "CoNameEn",
        "CompanyName",
        "companyName",
        "Name",
        "name"
      ]);
      const market = readString(row, ["MktNm", "MarketCodeName", "marketCodeName", "Market", "market"]);

      if (!code) {
        return null;
      }

      return {
        code,
        name: name ?? null,
        market: market ?? null
      };
    })
    .filter(Boolean);
}

export function toJQuantsDate(value) {
  if (!value) {
    return undefined;
  }

  if (/^\d{8}$/u.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value.replaceAll("-", "");
  }

  throw new Error(`Unsupported date format: ${value}. Use YYYY-MM-DD.`);
}

function normalizeQuote(row) {
  const date = normalizeDate(readString(row, ["Date", "date"]));
  const code = readString(row, ["Code", "code", "LocalCode", "localCode"]);
  const open = readNumber(row, [
    "AdjO",
    "AdjustmentOpen",
    "adjustmentOpen",
    "Open",
    "open",
    "O"
  ]);
  const high = readNumber(row, [
    "AdjH",
    "AdjustmentHigh",
    "adjustmentHigh",
    "High",
    "high",
    "H"
  ]);
  const low = readNumber(row, [
    "AdjL",
    "AdjustmentLow",
    "adjustmentLow",
    "Low",
    "low",
    "L"
  ]);
  const close = readNumber(row, [
    "AdjC",
    "AdjustmentClose",
    "adjustmentClose",
    "Close",
    "close",
    "C"
  ]);
  const volume = readNumber(row, [
    "AdjVo",
    "AdjustmentVolume",
    "adjustmentVolume",
    "Volume",
    "volume",
    "Vo"
  ]);

  if (!(date && code && Number.isFinite(close))) {
    return null;
  }

  return {
    code,
    date,
    open: Number.isFinite(open) ? open : close,
    high: Number.isFinite(high) ? high : close,
    low: Number.isFinite(low) ? low : close,
    close,
    volume: Number.isFinite(volume) ? volume : 0
  };
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value;
  }

  if (/^\d{8}$/u.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return null;
}

function pickArray(source, keys) {
  for (const key of keys) {
    const value = source?.[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function pick(source, keys) {
  for (const key of keys) {
    const value = source?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function readString(source, keys) {
  const value = pick(source, keys);

  if (value === undefined || value === null) {
    return null;
  }

  return String(value).trim() || null;
}

function readNumber(source, keys) {
  const value = pick(source, keys);
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueQuotes(items) {
  const map = new Map();

  for (const item of items) {
    map.set(`${item.code}:${item.date}`, item);
  }

  return [...map.values()];
}

function sortQuotes(items) {
  return [...items].sort((left, right) => left.date.localeCompare(right.date));
}