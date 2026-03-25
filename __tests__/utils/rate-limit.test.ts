import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateDelay,
  checkRateLimit,
  type RateLimitInfo,
  retry,
  sleep,
} from "../../src/utils/rate-limit";

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const { logger } = await import("../../src/utils/logger");

function makeRateLimit(overrides?: Partial<RateLimitInfo>): RateLimitInfo {
  return {
    remaining: 4999,
    resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    cost: 1,
    ...overrides,
  };
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not warn when remaining is high", () => {
    checkRateLimit(
      makeRateLimit({
        remaining: 4999,
      }),
    );
    expect(logger.warning).not.toHaveBeenCalled();
  });

  it("warns when remaining is low (<= 100)", () => {
    checkRateLimit(
      makeRateLimit({
        remaining: 100,
      }),
    );
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("getting low"),
    );
  });

  it("warns when remaining is critically low (<= 10)", () => {
    checkRateLimit(
      makeRateLimit({
        remaining: 5,
      }),
    );
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("critically low"),
    );
  });

  it("warns when remaining is exhausted (0)", () => {
    checkRateLimit(
      makeRateLimit({
        remaining: 0,
        cost: 3,
      }),
    );
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("exhausted"),
    );
  });
});

describe("calculateDelay", () => {
  it("returns MIN_DELAY_MS (100) when remaining is high", () => {
    expect(
      calculateDelay(
        makeRateLimit({
          remaining: 500,
        }),
      ),
    ).toBe(100);
  });

  it("returns 500ms when remaining is low (<= 100)", () => {
    expect(
      calculateDelay(
        makeRateLimit({
          remaining: 50,
        }),
      ),
    ).toBe(500);
  });

  it("returns 2000ms when remaining is critical (<= 10)", () => {
    expect(
      calculateDelay(
        makeRateLimit({
          remaining: 5,
        }),
      ),
    ).toBe(2000);
  });

  it("waits until reset when remaining is 0", () => {
    const resetAt = new Date(Date.now() + 30_000).toISOString();
    const delay = calculateDelay(
      makeRateLimit({
        remaining: 0,
        resetAt,
      }),
    );
    expect(delay).toBeGreaterThan(25_000);
    expect(delay).toBeLessThanOrEqual(32_000);
  });

  it("throws when reset time exceeds maximum wait", () => {
    const resetAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(() =>
      calculateDelay(
        makeRateLimit({
          remaining: 0,
          resetAt,
        }),
      ),
    ).toThrow("Exceeds maximum wait time");
  });

  it("returns 0 when reset is in the past and remaining is 0", () => {
    const resetAt = new Date(Date.now() - 10_000).toISOString();
    const delay = calculateDelay(
      makeRateLimit({
        remaining: 0,
        resetAt,
      }),
    );
    expect(delay).toBe(0);
  });
});

describe("retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first success", async () => {
    const result = await retry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on 502 and succeeds", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error("Bad Gateway"), {
          status: 502,
        });
      }
      return Promise.resolve("recovered");
    });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("retries on 503 and succeeds", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error("Service Unavailable"), {
          status: 503,
        });
      }
      return Promise.resolve("recovered");
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promise).toBe("recovered");
  });

  it("retries on rate-limit 403 (not permission 403)", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error("API rate limit exceeded"), {
          status: 403,
        });
      }
      return Promise.resolve("recovered");
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promise).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("retries on 403 with 'abuse detection' message", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      if (calls === 1) {
        throw Object.assign(
          new Error("You have triggered an abuse detection mechanism"),
          {
            status: 403,
          },
        );
      }
      return Promise.resolve("recovered");
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promise).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("retries on 403 with 'secondary rate' message", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      if (calls === 1) {
        throw Object.assign(
          new Error("You have exceeded a secondary rate limit"),
          {
            status: 403,
          },
        );
      }
      return Promise.resolve("recovered");
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promise).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("retries on 403 with mixed-case 'Rate Limit' message", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error("API Rate Limit Exceeded"), {
          status: 403,
        });
      }
      return Promise.resolve("recovered");
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promise).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("does NOT retry 403 with missing message property", async () => {
    const error = Object.assign(
      Object.create(null) as Record<string, unknown>,
      {
        status: 403,
      },
    );
    await expect(retry(() => Promise.reject(error))).rejects.toBe(error);
  });

  it("does NOT retry 403 with empty string message", async () => {
    const error = Object.assign(new Error(""), {
      status: 403,
    });
    await expect(retry(() => Promise.reject(error))).rejects.toThrow();
  });

  it("does NOT retry on permission 403", async () => {
    const permError = Object.assign(new Error("Resource not accessible"), {
      status: 403,
    });
    await expect(retry(() => Promise.reject(permError))).rejects.toThrow(
      "Resource not accessible",
    );
  });

  it("does NOT retry on non-retryable status codes (e.g. 404)", async () => {
    const error = Object.assign(new Error("Not Found"), {
      status: 404,
    });
    await expect(retry(() => Promise.reject(error))).rejects.toThrow(
      "Not Found",
    );
  });

  it("does NOT retry errors without a status code", async () => {
    await expect(
      retry(() => Promise.reject(new Error("network"))),
    ).rejects.toThrow("network");
  });

  it("does NOT retry 403 with non-string message", async () => {
    const error = Object.assign(
      Object.create(null) as Record<string, unknown>,
      {
        status: 403,
        message: 42,
      },
    );
    await expect(retry(() => Promise.reject(error))).rejects.toBe(error);
  });

  it("throws last error after all attempts exhausted", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      throw Object.assign(new Error(`fail ${calls}`), {
        status: 502,
      });
    }).catch((e: unknown) => e as Error);
    // Advance through all backoff delays: 1000 + 2000 + 4000
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await promise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("fail 4");
    expect(calls).toBe(4);
  });

  it("uses exponential backoff between retries", async () => {
    let calls = 0;
    const promise = retry(() => {
      calls++;
      if (calls <= 2) {
        throw Object.assign(new Error("Bad Gateway"), {
          status: 502,
        });
      }
      return Promise.resolve("ok");
    });

    // After 999ms: still only 1 call (backoff = 1000ms)
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toBe(1);

    // After 1ms more (total 1000ms): second call fires, then backoff = 2000ms
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);

    // After 2000ms more: third call succeeds
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promise).toBe("ok");
    expect(calls).toBe(3);
  });
});

describe("sleep", () => {
  it("resolves after the specified duration", async () => {
    vi.useFakeTimers();
    const promise = sleep(5000);
    vi.advanceTimersByTime(5000);
    await promise;
    vi.useRealTimers();
  });
});
