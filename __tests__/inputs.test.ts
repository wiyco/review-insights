import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "../src/inputs";

vi.mock("@actions/core");

function mockInputs(inputs: Record<string, string>) {
  vi.mocked(core.getInput).mockImplementation(
    (name: string) => inputs[name] ?? "",
  );
}

const VALID_TOKEN = "ghp_test-token-123";
const VALID_REPO = "my-org/my-repo";

function mockDefaults(overrides: Record<string, string> = {}) {
  mockInputs({
    "github-token": VALID_TOKEN,
    repository: VALID_REPO,
    ...overrides,
  });
}

describe("getConfig", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("valid defaults", () => {
    it("returns valid config with only token and repository provided", () => {
      mockDefaults();

      const config = getConfig();

      expect(config.token).toBe(VALID_TOKEN);
      expect(config.owner).toBe("my-org");
      expect(config.repo).toBe("my-repo");
      expect(config.outputModes).toEqual([
        "summary",
        "artifact",
      ]);
      expect(config.biasThreshold).toBe(2.0);
      expect(config.maxPRs).toBe(500);
      expect(config.includeBots).toBe(false);
    });

    it("marks the token as secret via core.setSecret", () => {
      mockDefaults();

      getConfig();

      expect(core.setSecret).toHaveBeenCalledWith(VALID_TOKEN);
    });

    it("sets default since to approximately 90 days ago", () => {
      mockDefaults();

      const config = getConfig();

      const sinceDate = new Date(config.since);
      const expectedDate = new Date("2026-01-15T12:00:00Z");
      expectedDate.setDate(expectedDate.getDate() - 90);

      expect(sinceDate.getTime()).toBe(expectedDate.getTime());
    });

    it("sets default until to the current time", () => {
      mockDefaults();

      const config = getConfig();

      expect(config.until).toBe("2026-01-15T12:00:00.000Z");
    });
  });

  describe("token validation", () => {
    it("throws when token is empty", () => {
      mockInputs({
        "github-token": "",
        repository: VALID_REPO,
      });

      expect(() => getConfig()).toThrow("github-token is required");
    });
  });

  describe("repository validation", () => {
    it("throws for invalid repository format", () => {
      mockDefaults({
        repository: "invalid",
      });

      expect(() => getConfig()).toThrow('Invalid repository format: "invalid"');
    });

    it("correctly splits owner and repo", () => {
      mockDefaults({
        repository: "my-org/my-repo",
      });

      const config = getConfig();

      expect(config.owner).toBe("my-org");
      expect(config.repo).toBe("my-repo");
    });
  });

  describe("date validation", () => {
    it("throws for invalid date string", () => {
      mockDefaults({
        since: "not-a-date",
      });

      expect(() => getConfig()).toThrow(
        'Invalid since date: "not-a-date" is not a valid ISO 8601 date',
      );
    });

    it("throws for date before 2008", () => {
      mockDefaults({
        since: "2007-12-31T00:00:00Z",
      });

      expect(() => getConfig()).toThrow("is before 2008");
    });

    it("throws for future date", () => {
      mockDefaults({
        since: "2027-01-01T00:00:00Z",
      });

      expect(() => getConfig()).toThrow("is in the future");
    });

    it("throws when since >= until", () => {
      mockDefaults({
        since: "2025-06-01T00:00:00Z",
        until: "2025-06-01T00:00:00Z",
      });

      expect(() => getConfig()).toThrow('"since" date');
    });

    it("accepts valid ISO 8601 dates", () => {
      mockDefaults({
        since: "2025-01-01T00:00:00Z",
        until: "2025-12-01T00:00:00Z",
      });

      const config = getConfig();

      expect(config.since).toBe("2025-01-01T00:00:00.000Z");
      expect(config.until).toBe("2025-12-01T00:00:00.000Z");
    });

    it("accepts date-only format (YYYY-MM-DD)", () => {
      mockDefaults({
        since: "2025-01-01",
        until: "2025-12-01",
      });

      const config = getConfig();

      expect(config.since).toBe("2025-01-01T00:00:00.000Z");
      expect(config.until).toBe("2025-12-01T00:00:00.000Z");
    });

    it("accepts date + time with milliseconds", () => {
      mockDefaults({
        since: "2025-01-01T00:00:00.000Z",
        until: "2025-12-01T12:30:45.123Z",
      });

      const config = getConfig();

      expect(config.since).toBe("2025-01-01T00:00:00.000Z");
      expect(config.until).toBe("2025-12-01T12:30:45.123Z");
    });

    it("accepts fractional seconds and normalizes them to milliseconds", () => {
      mockDefaults({
        since: "2025-01-01T00:00:00.1234Z",
        until: "2025-12-01T12:30:45.9876Z",
      });

      const config = getConfig();

      expect(config.since).toBe("2025-01-01T00:00:00.123Z");
      expect(config.until).toBe("2025-12-01T12:30:45.987Z");
    });

    it("accepts date + time with positive UTC offset", () => {
      mockDefaults({
        since: "2025-01-01T09:00:00+09:00",
        until: "2025-12-01T09:00:00+09:00",
      });

      const config = getConfig();

      // +09:00 is converted to UTC
      expect(config.since).toBe("2025-01-01T00:00:00.000Z");
      expect(config.until).toBe("2025-12-01T00:00:00.000Z");
    });

    it("accepts date + time with negative UTC offset", () => {
      mockDefaults({
        since: "2025-01-01T00:00:00-05:00",
        until: "2025-12-01T00:00:00-05:00",
      });

      const config = getConfig();

      expect(config.since).toBe("2025-01-01T05:00:00.000Z");
      expect(config.until).toBe("2025-12-01T05:00:00.000Z");
    });

    it.each([
      [
        "English date format",
        "June 1, 2025",
      ],
      [
        "slash-separated",
        "2025/06/01",
      ],
      [
        "unpadded month/day",
        "2025-6-1",
      ],
      [
        "day-month-year prose",
        "1 Jun 2025",
      ],
      [
        "Unix timestamp",
        "1719792000000",
      ],
    ])("rejects non-ISO 8601: %s (%s)", (_label, value) => {
      mockDefaults({
        since: value,
      });

      expect(() => getConfig()).toThrow("is not a valid ISO 8601 date");
    });
  });

  describe("output mode validation", () => {
    it("parses comma-separated modes", () => {
      mockDefaults({
        "output-mode": "summary,comment,artifact",
      });

      const config = getConfig();

      expect(config.outputModes).toEqual([
        "summary",
        "comment",
        "artifact",
      ]);
    });

    it("throws for empty output modes string", () => {
      mockDefaults({
        "output-mode": "  ",
      });

      expect(() => getConfig()).toThrow("No output modes specified");
    });

    it("throws for invalid mode", () => {
      mockDefaults({
        "output-mode": "invalid",
      });

      expect(() => getConfig()).toThrow('Invalid output mode: "invalid"');
    });

    it("deduplicates modes", () => {
      mockDefaults({
        "output-mode": "summary,summary",
      });

      const config = getConfig();

      expect(config.outputModes).toEqual([
        "summary",
      ]);
    });
  });

  describe("bias threshold validation", () => {
    it("throws for non-numeric value", () => {
      mockDefaults({
        "bias-threshold": "abc",
      });

      expect(() => getConfig()).toThrow(
        'Invalid bias-threshold: "abc" must be a positive number',
      );
    });

    it("throws for negative value", () => {
      mockDefaults({
        "bias-threshold": "-1",
      });

      expect(() => getConfig()).toThrow(
        'Invalid bias-threshold: "-1" must be a positive number',
      );
    });

    it("clamps to 0.5 minimum", () => {
      mockDefaults({
        "bias-threshold": "0.1",
      });

      const config = getConfig();

      expect(config.biasThreshold).toBe(0.5);
    });

    it("clamps to 10.0 maximum", () => {
      mockDefaults({
        "bias-threshold": "20",
      });

      const config = getConfig();

      expect(config.biasThreshold).toBe(10.0);
    });

    it("accepts values in valid range", () => {
      mockDefaults({
        "bias-threshold": "3.5",
      });

      const config = getConfig();

      expect(config.biasThreshold).toBe(3.5);
    });
  });

  describe("max PRs validation", () => {
    it("throws for non-integer value", () => {
      mockDefaults({
        "max-prs": "1.5",
      });

      expect(() => getConfig()).toThrow(
        'Invalid max-prs: "1.5" must be an integer',
      );
    });

    it("throws for value below 1", () => {
      mockDefaults({
        "max-prs": "0",
      });

      expect(() => getConfig()).toThrow(
        "Invalid max-prs: 0 must be between 1 and 5000",
      );
    });

    it("throws for value above 5000", () => {
      mockDefaults({
        "max-prs": "5001",
      });

      expect(() => getConfig()).toThrow(
        "Invalid max-prs: 5001 must be between 1 and 5000",
      );
    });

    it("accepts valid integer", () => {
      mockDefaults({
        "max-prs": "1000",
      });

      const config = getConfig();

      expect(config.maxPRs).toBe(1000);
    });
  });

  describe("include-bots", () => {
    it('returns true when input is "true"', () => {
      mockDefaults({
        "include-bots": "true",
      });

      const config = getConfig();

      expect(config.includeBots).toBe(true);
    });

    it('returns true when input is "True" (case-insensitive)', () => {
      mockDefaults({
        "include-bots": "True",
      });

      const config = getConfig();

      expect(config.includeBots).toBe(true);
    });

    it('returns false for "false"', () => {
      mockDefaults({
        "include-bots": "false",
      });

      const config = getConfig();

      expect(config.includeBots).toBe(false);
    });

    it("returns false for any other value", () => {
      mockDefaults({
        "include-bots": "yes",
      });

      const config = getConfig();

      expect(config.includeBots).toBe(false);
    });
  });

  describe("repository edge cases", () => {
    it("throws for multiple slashes", () => {
      mockDefaults({
        repository: "a/b/c",
      });

      expect(() => getConfig()).toThrow("Invalid repository format");
    });

    it("throws for missing owner (leading slash)", () => {
      mockDefaults({
        repository: "/repo",
      });

      expect(() => getConfig()).toThrow("Invalid repository format");
    });

    it("throws for missing repo (trailing slash)", () => {
      mockDefaults({
        repository: "owner/",
      });

      expect(() => getConfig()).toThrow("Invalid repository format");
    });
  });

  describe("date edge cases", () => {
    it("accepts boundary date 2008-01-01", () => {
      mockDefaults({
        since: "2008-01-01T00:00:00Z",
        until: "2025-06-01T00:00:00Z",
      });

      const config = getConfig();

      expect(config.since).toBe("2008-01-01T00:00:00.000Z");
    });

    it("rejects non-existent dates (2025-02-30)", () => {
      // Regression test: impossible calendar dates must be rejected instead of
      // being normalized by the runtime date parser.
      mockDefaults({
        since: "2025-02-30",
        until: "2025-06-01T00:00:00Z",
      });

      expect(() => getConfig()).toThrow("is not a valid ISO 8601 date");
    });

    it("accepts leap-day dates that exist on the calendar", () => {
      mockDefaults({
        since: "2024-02-29T00:00:00Z",
        until: "2025-06-01T00:00:00Z",
      });

      const config = getConfig();

      expect(config.since).toBe("2024-02-29T00:00:00.000Z");
    });

    it("rejects leap-day dates that do not exist on the calendar", () => {
      mockDefaults({
        since: "2025-02-29",
        until: "2025-06-01T00:00:00Z",
      });

      expect(() => getConfig()).toThrow("is not a valid ISO 8601 date");
    });

    it("rejects non-existent months (2025-13-01)", () => {
      mockDefaults({
        since: "2025-06-01T00:00:00Z",
        until: "2025-13-01",
      });

      expect(() => getConfig()).toThrow("is not a valid ISO 8601 date");
    });

    it.each([
      "2025-06-01T24:00:00Z",
      "2025-06-01T23:60:00Z",
      "2025-06-01T23:59:60Z",
      "2025-06-01T09:30:00+24:00",
      "2025-06-01T09:30:00+09:60",
    ])("rejects out-of-range ISO 8601 components: %s", (invalidUntil) => {
      mockDefaults({
        since: "2025-06-01T00:00:00Z",
        until: invalidUntil,
      });

      expect(() => getConfig()).toThrow("is not a valid ISO 8601 date");
    });
  });

  describe("bias threshold edge cases", () => {
    it("throws for zero", () => {
      mockDefaults({
        "bias-threshold": "0",
      });

      expect(() => getConfig()).toThrow(
        'Invalid bias-threshold: "0" must be a positive number',
      );
    });

    it("throws for NaN string", () => {
      mockDefaults({
        "bias-threshold": "NaN",
      });

      expect(() => getConfig()).toThrow(
        'Invalid bias-threshold: "NaN" must be a positive number',
      );
    });

    it("clamps Infinity to maximum", () => {
      mockDefaults({
        "bias-threshold": "Infinity",
      });

      const config = getConfig();

      expect(config.biasThreshold).toBe(10.0);
    });

    it("accepts exact minimum 0.5", () => {
      mockDefaults({
        "bias-threshold": "0.5",
      });

      const config = getConfig();

      expect(config.biasThreshold).toBe(0.5);
    });

    it("accepts exact maximum 10.0", () => {
      mockDefaults({
        "bias-threshold": "10.0",
      });

      const config = getConfig();

      expect(config.biasThreshold).toBe(10.0);
    });
  });

  describe("max PRs edge cases", () => {
    it("accepts minimum value 1", () => {
      mockDefaults({
        "max-prs": "1",
      });

      const config = getConfig();

      expect(config.maxPRs).toBe(1);
    });

    it("accepts maximum value 5000", () => {
      mockDefaults({
        "max-prs": "5000",
      });

      const config = getConfig();

      expect(config.maxPRs).toBe(5000);
    });

    it("throws for Infinity", () => {
      mockDefaults({
        "max-prs": "Infinity",
      });

      expect(() => getConfig()).toThrow(
        'Invalid max-prs: "Infinity" must be an integer',
      );
    });

    it("throws for NaN string", () => {
      mockDefaults({
        "max-prs": "NaN",
      });

      expect(() => getConfig()).toThrow(
        'Invalid max-prs: "NaN" must be an integer',
      );
    });
  });

  describe("output mode edge cases", () => {
    it("normalizes uppercase modes", () => {
      mockDefaults({
        "output-mode": "Summary,COMMENT",
      });

      const config = getConfig();

      expect(config.outputModes).toEqual([
        "summary",
        "comment",
      ]);
    });

    it("trims whitespace around modes", () => {
      mockDefaults({
        "output-mode": " summary , artifact ",
      });

      const config = getConfig();

      expect(config.outputModes).toEqual([
        "summary",
        "artifact",
      ]);
    });

    it("handles trailing comma gracefully", () => {
      mockDefaults({
        "output-mode": "summary,",
      });

      const config = getConfig();

      expect(config.outputModes).toEqual([
        "summary",
      ]);
    });
  });
});
