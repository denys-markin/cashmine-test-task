import { ApiError } from "./client";

/** A short, user-facing explanation of a failed request. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong.";
  if (error.code === "NETWORK") return "Can't reach the server. Check your connection.";
  if (error.code === "CLIENT_TIMEOUT" || error.status === 504) return "The server is taking too long to answer.";
  if (error.status === 429) return "Too many requests. Wait a few seconds and try again.";
  if (error.status >= 500) return "The server had a temporary problem.";
  return error.message;
}
