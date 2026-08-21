import { NextResponse } from "next/server";

/**
 * The wire shape every panel API route returns, and the state every panel
 * component renders. Keeping one shape means loading, error, stale and
 * partial-failure handling is written once rather than per panel.
 */

export type PanelPayload<T> = {
  data: T;
  fetchedAt: number;
  /** Value came from cache because a refresh failed. */
  stale?: boolean;
  /** Sources that failed while others succeeded — the panel still renders. */
  degraded?: string[];
};

export type PanelError = { error: { message: string; retryable: boolean } };

export type PanelState<T> =
  | { status: "loading" }
  | ({ status: "ready" } & PanelPayload<T>)
  | { status: "error"; message: string; retryable: boolean };

export function ok<T>(payload: Omit<PanelPayload<T>, "fetchedAt">) {
  return NextResponse.json<PanelPayload<T>>(
    { ...payload, fetchedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function fail(message: string, { retryable = true, status = 502 } = {}) {
  return NextResponse.json<PanelError>(
    { error: { message, retryable } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Upstream errors are for us, not the reader. Log the detail, show a sentence
 * that says what's broken and whether waiting will help.
 */
export function describeError(error: unknown, subject: string): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `${subject} took too long to respond.`;
  }
  if (error instanceof TypeError) {
    return `Couldn't reach ${subject}. Check your connection.`;
  }
  return `${subject} returned an unexpected response.`;
}
