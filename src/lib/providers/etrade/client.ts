import { fetchWithTimeout } from "@/lib/cache";
import { authorizationHeader, parseTokenResponse, type Token } from "./oauth";
import type { Portfolio, Position } from "./types";

/**
 * Live E*TRADE client. Every call is OAuth 1.0a signed server-side.
 *
 * Set ETRADE_CONSUMER_KEY, ETRADE_CONSUMER_SECRET and ETRADE_ENV
 * (`sandbox` or `live`) in .env.local. With no key configured the app serves
 * the mock provider instead — see ./index.ts.
 */

const HOSTS = {
  sandbox: "https://apisb.etrade.com",
  live: "https://api.etrade.com",
} as const;

export type Mode = keyof typeof HOSTS;

export function credentials(): { consumer: Token; mode: Mode } | null {
  const key = process.env.ETRADE_CONSUMER_KEY;
  const secret = process.env.ETRADE_CONSUMER_SECRET;
  if (!key || !secret) return null;
  const mode: Mode = process.env.ETRADE_ENV === "live" ? "live" : "sandbox";
  return { consumer: { key, secret }, mode };
}

const host = (mode: Mode) => HOSTS[mode];

async function signedGet(
  url: string,
  { consumer, token, queryParams = {} }: { consumer: Token; token?: Token; queryParams?: Record<string, string> },
) {
  const query = new URLSearchParams(queryParams).toString();
  const res = await fetchWithTimeout(query ? `${url}?${query}` : url, {
    timeoutMs: 12_000,
    headers: {
      Authorization: authorizationHeader({ method: "GET", url, consumer, token, queryParams }),
      Accept: "application/json",
    },
  });
  return res;
}

/** Step 1 — a temporary request token, plus the URL to send the user to. */
export async function beginAuthorization(callbackUrl: string) {
  const creds = credentials();
  if (!creds) throw new Error("E*TRADE credentials are not configured");

  const url = `${host(creds.mode)}/oauth/request_token`;

  // oauth_callback is an OAuth parameter, not a query parameter: it is signed
  // into the Authorization header rather than appended to the URL.
  const res = await fetchWithTimeout(url, {
    timeoutMs: 12_000,
    headers: {
      Authorization: authorizationHeader({
        method: "GET",
        url,
        consumer: creds.consumer,
        extraOauthParams: { oauth_callback: callbackUrl },
      }),
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`E*TRADE request_token responded ${res.status}`);

  const parsed = parseTokenResponse(await res.text());
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("E*TRADE returned no request token");
  }

  return {
    requestToken: { key: parsed.oauth_token, secret: parsed.oauth_token_secret } satisfies Token,
    // The authorize page lives on us.etrade.com for both sandbox and live.
    authorizeUrl:
      "https://us.etrade.com/e/t/etws/authorize" +
      `?key=${encodeURIComponent(creds.consumer.key)}` +
      `&token=${encodeURIComponent(parsed.oauth_token)}`,
  };
}

/** Step 2 — swap the verifier for a real access token. */
export async function completeAuthorization(requestToken: Token, verifier: string): Promise<Token> {
  const creds = credentials();
  if (!creds) throw new Error("E*TRADE credentials are not configured");

  const url = `${host(creds.mode)}/oauth/access_token`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 12_000,
    headers: {
      Authorization: authorizationHeader({
        method: "GET",
        url,
        consumer: creds.consumer,
        token: requestToken,
        extraOauthParams: { oauth_verifier: verifier },
      }),
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`E*TRADE access_token responded ${res.status}`);
  const parsed = parseTokenResponse(await res.text());
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("E*TRADE returned no access token");
  }
  return { key: parsed.oauth_token, secret: parsed.oauth_token_secret };
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Step 3 — the data the panel actually wants. */
export async function fetchPortfolio(token: Token): Promise<Portfolio> {
  const creds = credentials();
  if (!creds) throw new Error("E*TRADE credentials are not configured");
  const base = host(creds.mode);

  const listRes = await signedGet(`${base}/v1/accounts/list`, {
    consumer: creds.consumer,
    token,
  });
  if (listRes.status === 401) throw new UnauthorizedError();
  if (!listRes.ok) throw new Error(`E*TRADE accounts/list responded ${listRes.status}`);

  const listBody = await listRes.json();
  const accounts = listBody?.AccountListResponse?.Accounts?.Account;
  const account = Array.isArray(accounts) ? accounts[0] : accounts;
  if (!account?.accountIdKey) throw new Error("E*TRADE returned no accounts");

  const portfolioRes = await signedGet(`${base}/v1/accounts/${account.accountIdKey}/portfolio`, {
    consumer: creds.consumer,
    token,
    queryParams: { count: "50", view: "COMPLETE" },
  });
  if (portfolioRes.status === 401) throw new UnauthorizedError();

  // An account holding nothing answers 204 No Content. That is an empty
  // portfolio, not a failure — anything else non-OK is.
  if (!portfolioRes.ok && portfolioRes.status !== 204) {
    throw new Error(`E*TRADE portfolio responded ${portfolioRes.status}`);
  }

  const entries: Record<string, unknown>[] = [];
  if (portfolioRes.status !== 204) {
    const body = await portfolioRes.json();
    const groups = body?.PortfolioResponse?.AccountPortfolio;
    for (const group of Array.isArray(groups) ? groups : groups ? [groups] : []) {
      const positions = group?.Position;
      entries.push(...(Array.isArray(positions) ? positions : positions ? [positions] : []));
    }
  }

  const positions: Position[] = entries.map((entry) => {
    const quick = (entry.Quick ?? {}) as Record<string, unknown>;
    const product = (entry.Product ?? {}) as Record<string, unknown>;
    const quantity = num(entry.quantity);
    const lastPrice = num(quick.lastTrade);
    const marketValue = num(entry.marketValue) || quantity * lastPrice;
    const dayChange = num(quick.change);

    return {
      symbol: String(product.symbol ?? entry.symbolDescription ?? "—"),
      description: String(entry.symbolDescription ?? product.symbol ?? ""),
      quantity,
      lastPrice,
      dayChange,
      dayChangePct: num(quick.changePct),
      marketValue,
      totalGain: num(entry.totalGain),
      totalGainPct: num(entry.totalGainPct),
    };
  });

  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const dayChange = positions.reduce((sum, p) => sum + p.dayChange * p.quantity, 0);
  const previousValue = totalValue - dayChange;

  return {
    accountLabel: String(account.accountDesc ?? account.accountName ?? "Brokerage") +
      (account.accountId ? ` ••${String(account.accountId).slice(-4)}` : ""),
    totalValue,
    dayChange,
    dayChangePct: previousValue > 0 ? (dayChange / previousValue) * 100 : 0,
    positions: positions.sort((a, b) => b.marketValue - a.marketValue),
    mode: creds.mode,
  };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("E*TRADE session expired");
    this.name = "UnauthorizedError";
  }
}
