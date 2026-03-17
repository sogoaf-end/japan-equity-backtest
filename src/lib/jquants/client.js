const RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 405]);

export class JQuantsApiError extends Error {
  constructor(message, { status, path, body } = {}) {
    super(message);
    this.name = "JQuantsApiError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

export class JQuantsClient {
  constructor(config, { fetchFn = fetch } = {}) {
    if (!config) {
      throw new Error("J-Quants config is required.");
    }

    this.config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl)
    };
    this.fetchFn = fetchFn;
    this.cachedIdToken = null;
    this.cachedRefreshToken = config.refreshToken || null;
  }

  getAuthMode() {
    if (this.config.apiKey) {
      return "api_key";
    }

    if (this.config.refreshToken) {
      return "refresh_token";
    }

    if (this.config.email && this.config.password) {
      return "email_password";
    }

    throw new Error(
      "J-Quants credentials are missing. Set JQUANTS_API_KEY or JQUANTS_REFRESH_TOKEN or JQUANTS_EMAIL/JQUANTS_PASSWORD."
    );
  }

  async request(path, { query = {}, method = "GET", body } = {}) {
    const headers = await this.buildAuthHeaders();
    return this.requestInternal(path, { query, method, body, headers });
  }

  async requestFirst(paths, options = {}) {
    const errors = [];

    for (const path of unique(paths)) {
      try {
        return await this.request(path, options);
      } catch (error) {
        errors.push(error);

        if (!(error instanceof JQuantsApiError)) {
          throw error;
        }

        if (!RETRYABLE_STATUSES.has(error.status)) {
          throw error;
        }
      }
    }

    const details = errors
      .map((error) => `${error.path ?? "unknown"}:${error.status ?? "n/a"}`)
      .join(", ");

    throw new Error(
      `No reachable J-Quants endpoint was found. Tried ${details || "no candidates"}. Set JQUANTS_DAILY_QUOTES_PATH or JQUANTS_LISTED_INFO_PATH to pin the correct path.`
    );
  }

  async buildAuthHeaders() {
    const headers = {
      accept: "application/json"
    };

    if (this.getAuthMode() === "api_key") {
      headers[this.config.apiKeyHeader] = `${this.config.apiKeyPrefix}${this.config.apiKey}`;
      return headers;
    }

    const idToken = await this.getIdToken();
    headers.authorization = `Bearer ${idToken}`;
    return headers;
  }

  async getIdToken() {
    if (this.cachedIdToken) {
      return this.cachedIdToken;
    }

    const refreshToken = await this.getRefreshToken();
    const response = await this.requestInternal("/v1/token/auth_refresh", {
      method: "POST",
      query: {
        refreshtoken: refreshToken
      },
      headers: {
        accept: "application/json"
      }
    });

    const idToken = pick(response.data, ["idToken", "id_token"]);

    if (!idToken) {
      throw new Error("J-Quants auth_refresh response did not contain an id token.");
    }

    this.cachedIdToken = idToken;
    return idToken;
  }

  async getRefreshToken() {
    if (this.cachedRefreshToken) {
      return this.cachedRefreshToken;
    }

    if (!(this.config.email && this.config.password)) {
      throw new Error("V1 auth requires JQUANTS_REFRESH_TOKEN or JQUANTS_EMAIL/JQUANTS_PASSWORD.");
    }

    const response = await this.requestInternal("/v1/token/auth_user", {
      method: "POST",
      body: {
        mailaddress: this.config.email,
        password: this.config.password
      },
      headers: {
        accept: "application/json"
      }
    });

    const refreshToken = pick(response.data, ["refreshToken", "refresh_token"]);

    if (!refreshToken) {
      throw new Error("J-Quants auth_user response did not contain a refresh token.");
    }

    this.cachedRefreshToken = refreshToken;
    return refreshToken;
  }

  async requestInternal(path, { query = {}, method = "GET", body, headers = {} } = {}) {
    const url = new URL(`${this.config.baseUrl}${path}`);

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    const requestHeaders = {
      ...headers
    };

    const init = {
      method,
      headers: requestHeaders
    };

    if (body !== undefined) {
      requestHeaders["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchFn(url, init);
    const data = await readBody(response);

    if (!response.ok) {
      throw new JQuantsApiError(
        `J-Quants request failed with ${response.status} on ${path}.`,
        {
          status: response.status,
          path,
          body: data
        }
      );
    }

    return {
      data,
      status: response.status,
      path
    };
  }
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/u, "");
}

async function readBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pick(source, keys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (key in source && source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }

  return undefined;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}