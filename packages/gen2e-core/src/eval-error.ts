export type Gen2EEvalErrorClass =
  | "locator-drift"
  | "navigation"
  | "timeout"
  | "assertion"
  | "unknown";

const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message ?? "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : String(message ?? "");
  }
  return error === undefined || error === null ? "" : String(error);
};

/**
 * Heuristic classification of an evaluation error. Used to decide whether a
 * failing cached expression can be regenerated (locator drift) or whether it
 * points at a real application regression that must surface.
 */
export const classifyEvalError = (error: unknown): Gen2EEvalErrorClass => {
  const message = messageOf(error).toLowerCase();

  const locatorDrift =
    message.includes("strict mode violation") ||
    message.includes("resolved to") ||
    message.includes("waiting for locator") ||
    (message.includes("waitforselector") &&
      (message.includes("locator(") || message.includes("selector")));
  if (locatorDrift) {
    return "locator-drift";
  }

  const navigation =
    message.includes("target closed") ||
    message.includes("target page, context or browser has been closed") ||
    message.includes("navigation") ||
    message.includes("frame was detached") ||
    message.includes("execution context destroyed") ||
    message.includes("execution context was destroyed");
  if (navigation) {
    return "navigation";
  }

  const timeout =
    (message.includes("timeout") && message.includes("exceeded")) ||
    message.includes("test timeout");
  if (timeout) {
    return "timeout";
  }

  if (message.includes("expected") || message.includes("assertion")) {
    return "assertion";
  }

  return "unknown";
};
