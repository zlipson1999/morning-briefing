import { describe, expect, it } from "vitest";
import { authorizationHeader, parseTokenResponse, percentEncode } from "../oauth";

describe("percentEncode", () => {
  it("escapes the characters RFC 3986 requires and encodeURIComponent misses", () => {
    expect(percentEncode("!*'()")).toBe("%21%2A%27%28%29");
  });

  it("leaves unreserved characters alone", () => {
    expect(percentEncode("aZ0-._~")).toBe("aZ0-._~");
  });

  it("escapes spaces as %20, never +", () => {
    expect(percentEncode("vacation photo")).toBe("vacation%20photo");
  });
});

describe("authorizationHeader", () => {
  /* The canonical HMAC-SHA1 example from the OAuth 1.0 spec (Appendix A.5.1).
     Pinning against it proves the base-string construction, the signing-key
     format and the HMAC are all right — none of which we could otherwise
     check without live E*TRADE credentials. */
  it("reproduces the published OAuth 1.0 signature vector", () => {
    const header = authorizationHeader({
      method: "GET",
      url: "http://photos.example.net/photos",
      consumer: { key: "dpf43f3p2l4k3l03", secret: "kd94hf93k423kf44" },
      token: { key: "nnch734d00sl2jdk", secret: "pfkkdhi9sl3r4s00" },
      queryParams: { file: "vacation.jpg", size: "original" },
      extraOauthParams: {
        oauth_nonce: "kllo9940pd9333jh",
        oauth_timestamp: "1191242096",
      },
    });

    expect(header).toContain(
      `oauth_signature="${percentEncode("tR3+Ty81lMeYAr/Fid0kMTYa/WM=")}"`,
    );
  });

  it("omits oauth_token entirely when no token is supplied", () => {
    const header = authorizationHeader({
      method: "GET",
      url: "https://api.etrade.com/oauth/request_token",
      consumer: { key: "ck", secret: "cs" },
      extraOauthParams: { oauth_callback: "oob" },
    });
    expect(header).not.toContain("oauth_token=");
    expect(header).toContain('oauth_callback="oob"');
  });

  it("keeps query params out of the header even though they are signed", () => {
    const header = authorizationHeader({
      method: "GET",
      url: "https://api.etrade.com/v1/accounts/x/portfolio",
      consumer: { key: "ck", secret: "cs" },
      token: { key: "tk", secret: "ts" },
      queryParams: { count: "50" },
    });
    expect(header).not.toContain("count");
    expect(header).toContain("oauth_signature=");
  });
});

describe("parseTokenResponse", () => {
  it("reads the form-encoded body the token endpoints return", () => {
    const parsed = parseTokenResponse(
      "oauth_token=abc%2F123&oauth_token_secret=def%2B456&oauth_callback_confirmed=true",
    );
    expect(parsed.oauth_token).toBe("abc/123");
    expect(parsed.oauth_token_secret).toBe("def+456");
  });
});
