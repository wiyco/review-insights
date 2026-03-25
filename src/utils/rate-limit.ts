import { logger } from "./logger";

/** Rate limit information extracted from a GraphQL response. */
export interface RateLimitInfo {
  remaining: number;
  resetAt: string;
  cost: number;
}

const LOW_RATE_LIMIT_THRESHOLD = 100;
const CRITICAL_RATE_LIMIT_THRESHOLD = 10;
const MIN_DELAY_MS = 100;
const LOW_REMAINING_DELAY_MS = 500;
const CRITICAL_REMAINING_DELAY_MS = 2000;
/** Total number of attempts (1 initial + retries). */
const MAX_ATTEMPTS = 4;
const INITIAL_BACKOFF_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([
  403,
  502,
  503,
]);

/**
 * Checks current rate limit info and logs warnings when quota is low.
 * Does NOT throw — the caller decides whether to wait or abort.
 */
export function checkRateLimit(info: RateLimitInfo): void {
  const resetDate = new Date(info.resetAt);
  const minutesUntilReset = Math.max(
    0,
    (resetDate.getTime() - Date.now()) / 1000 / 60,
  );

  if (info.remaining <= 0) {
    logger.warning(
      `GitHub API rate limit exhausted. Resets at ${info.resetAt} (in ${minutesUntilReset.toFixed(1)} minutes). Last request cost ${info.cost} points.`,
    );
  } else if (info.remaining <= CRITICAL_RATE_LIMIT_THRESHOLD) {
    logger.warning(
      `Rate limit critically low: ${info.remaining} remaining. Resets at ${info.resetAt} (in ${minutesUntilReset.toFixed(1)} minutes).`,
    );
  } else if (info.remaining <= LOW_RATE_LIMIT_THRESHOLD) {
    logger.warning(
      `Rate limit getting low: ${info.remaining} remaining. Resets at ${info.resetAt}.`,
    );
  }
}

/** Maximum time (ms) we are willing to wait for a rate limit reset. */
const MAX_RESET_WAIT_MS = 5 * 60 * 1000;

/**
 * Calculates a delay in milliseconds based on remaining rate limit quota.
 * When remaining is 0, waits until the reset time (up to MAX_RESET_WAIT_MS)
 * to avoid a futile request that would 403 and trigger retries.
 */
export function calculateDelay(info: RateLimitInfo): number {
  if (info.remaining <= 0) {
    const waitMs = Math.max(
      0,
      new Date(info.resetAt).getTime() - Date.now() + 1000,
    );
    if (waitMs > MAX_RESET_WAIT_MS) {
      throw new Error(
        `GitHub API rate limit exhausted. Resets at ${info.resetAt} (${Math.ceil(waitMs / 60_000)} minutes). ` +
          `Exceeds maximum wait time of ${MAX_RESET_WAIT_MS / 60_000} minutes.`,
      );
    }
    logger.info(
      `Rate limit exhausted. Waiting ${Math.ceil(waitMs / 1000)}s until reset...`,
    );
    return waitMs;
  }
  if (info.remaining <= CRITICAL_RATE_LIMIT_THRESHOLD) {
    return CRITICAL_REMAINING_DELAY_MS;
  }
  if (info.remaining <= LOW_RATE_LIMIT_THRESHOLD) {
    return LOW_REMAINING_DELAY_MS;
  }
  return MIN_DELAY_MS;
}

/**
 * Retries a function with exponential backoff for transient errors (403, 502, 503).
 * Throws the last error if all retries are exhausted.
 */
export async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (attempt === MAX_ATTEMPTS - 1) {
        break;
      }

      const statusCode = getStatusCode(error);
      if (statusCode === null || !RETRYABLE_STATUS_CODES.has(statusCode)) {
        throw error;
      }

      // 403 from permission denial should not be retried — only rate limit 403s
      if (statusCode === 403 && !isRateLimitError(error)) {
        throw error;
      }

      const backoffMs = INITIAL_BACKOFF_MS * 2 ** attempt;
      logger.warning(
        `Request failed with status ${statusCode} (attempt ${attempt + 1}/${MAX_ATTEMPTS}). ` +
          `Retrying in ${backoffMs}ms...`,
      );
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

/** Checks whether a 403 error is a rate limit response (vs. a permission denial). */
export function isRateLimitError(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (
      error as {
        message: unknown;
      }
    ).message === "string"
  ) {
    const msg = (
      error as {
        message: string;
      }
    ).message.toLowerCase();
    return (
      msg.includes("rate limit") ||
      msg.includes("abuse detection") ||
      msg.includes("secondary rate")
    );
  }
  return false;
}

/** Extracts an HTTP status code from an error object, if present. */
function getStatusCode(error: unknown): number | null {
  if (
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    typeof (
      error as {
        status: unknown;
      }
    ).status === "number"
  ) {
    return (
      error as {
        status: number;
      }
    ).status;
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
