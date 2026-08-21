import crypto from "node:crypto";

/**
 * Minimal OAuth 1.0a request signing (HMAC-SHA1).
 *
 * E*TRADE is OAuth 1.0a, not OAuth 2 — every request is individually signed
 * with the consumer secret. That secret must never reach the browser, which
 * is why every E*TRADE call in this app happens in a route handler.
 */

/** RFC 3986 encoding. encodeURIComponent leaves !*'() alone; OAuth doesn't. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function signatureBase(method: string, url: string, params: Record<string, string>): string {
  const normalized = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  return [method.toUpperCase(), percentEncode(url), percentEncode(normalized)].join("&");
}

export type Token = { key: string; secret: string };

/**
 * Builds the Authorization header for a signed request.
 *
 * `token` is omitted for the initial request-token call. `queryParams` must
 * list every query-string parameter on the URL: OAuth 1.0a folds them into
 * the signature base string, so omitting them produces a signature the server
 * computes differently and rejects with a 401.
 */
export function authorizationHeader({
  method,
  url,
  consumer,
  token,
  queryParams = {},
  extraOauthParams = {},
}: {
  method: string;
  url: string;
  consumer: Token;
  token?: Token;
  queryParams?: Record<string, string>;
  extraOauthParams?: Record<string, string>;
}): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: consumer.key,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    ...extraOauthParams,
  };
  if (token) oauth.oauth_token = token.key;

  const signingKey = `${percentEncode(consumer.secret)}&${percentEncode(token?.secret ?? "")}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase(method, url, { ...queryParams, ...oauth }))
    .digest("base64");

  // Only the oauth_* params belong in the header; query params stay on the URL.
  oauth.oauth_signature = signature;

  return (
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((key) => `${percentEncode(key)}="${percentEncode(oauth[key])}"`)
      .join(", ")
  );
}

/** Token endpoints answer in form-encoded bodies, not JSON. */
export function parseTokenResponse(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body).entries());
}
