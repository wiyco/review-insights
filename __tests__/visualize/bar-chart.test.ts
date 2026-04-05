import { describe, expect, it } from "vitest";
import type { UserReviewStats } from "../../src/types";
import { renderBarChart } from "../../src/visualize/bar-chart";

function makeUserStats(
  overrides: Partial<UserReviewStats> & {
    login: string;
  },
): UserReviewStats {
  return {
    reviewsGiven: 0,
    reviewsReceived: 0,
    approvals: 0,
    changeRequests: 0,
    comments: 0,
    dismissed: 0,
    avgTimeToFirstReviewMs: null,
    medianTimeToFirstReviewMs: null,
    ...overrides,
  };
}

describe("renderBarChart", () => {
  describe("SVG structure", () => {
    it("returns a valid SVG", () => {
      const stats = [
        makeUserStats({
          login: "alice",
          reviewsGiven: 5,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
  });

  describe("empty input", () => {
    it('contains "No data available" for empty stats array', () => {
      const svg = renderBarChart([], "reviewsGiven");
      expect(svg).toContain("No data available");
    });
  });

  describe("labels", () => {
    it("contains user login labels in the SVG", () => {
      const stats = [
        makeUserStats({
          login: "alice",
          reviewsGiven: 5,
        }),
        makeUserStats({
          login: "bob",
          reviewsGiven: 3,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven");
      expect(svg).toContain("alice");
      expect(svg).toContain("bob");
    });
  });

  describe("metric titles", () => {
    it('contains "Reviews Given" for reviewsGiven metric', () => {
      const stats = [
        makeUserStats({
          login: "alice",
          reviewsGiven: 5,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven");
      expect(svg).toContain("Reviews Given");
    });

    it('contains "Reviews Received" for reviewsReceived metric', () => {
      const stats = [
        makeUserStats({
          login: "alice",
          reviewsReceived: 3,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsReceived");
      expect(svg).toContain("Reviews Received");
    });

    it('contains "Approvals" for approvals metric', () => {
      const stats = [
        makeUserStats({
          login: "alice",
          approvals: 7,
        }),
      ];

      const svg = renderBarChart(stats, "approvals");
      expect(svg).toContain("Approvals");
    });
  });

  describe("count values", () => {
    it("contains count values in the SVG", () => {
      const stats = [
        makeUserStats({
          login: "alice",
          reviewsGiven: 12,
        }),
        makeUserStats({
          login: "bob",
          reviewsGiven: 8,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven");
      expect(svg).toContain(">12<");
      expect(svg).toContain(">8<");
    });
  });

  describe("maxUsers option", () => {
    it("respects maxUsers option", () => {
      const stats = [
        makeUserStats({
          login: "user-a",
          reviewsGiven: 10,
        }),
        makeUserStats({
          login: "user-b",
          reviewsGiven: 8,
        }),
        makeUserStats({
          login: "user-c",
          reviewsGiven: 6,
        }),
        makeUserStats({
          login: "user-d",
          reviewsGiven: 4,
        }),
        makeUserStats({
          login: "user-e",
          reviewsGiven: 2,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven", {
        maxUsers: 3,
      });
      expect(svg).toContain("user-a");
      expect(svg).toContain("user-b");
      expect(svg).toContain("user-c");
      expect(svg).not.toContain("user-d");
      expect(svg).not.toContain("user-e");
    });
  });

  describe("long login truncation", () => {
    it("truncates long logins with ellipsis character", () => {
      const stats = [
        makeUserStats({
          login: "a-very-long-username-here",
          reviewsGiven: 5,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven");
      expect(svg).toContain("\u2026");
      // The truncated label should appear; the full login only appears in the title attribute
      expect(svg).toContain("a-very-long-u\u2026");
    });
  });

  describe("bar elements", () => {
    it("contains rect elements for bars", () => {
      const stats = [
        makeUserStats({
          login: "alice",
          reviewsGiven: 5,
        }),
        makeUserStats({
          login: "bob",
          reviewsGiven: 3,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven");
      expect(svg).toContain("<rect");
    });

    it("renders a zero-width bar when a displayed user has a zero metric", () => {
      const stats = [
        makeUserStats({
          login: "alice",
          reviewsGiven: 5,
        }),
        makeUserStats({
          login: "bob",
          reviewsGiven: 0,
        }),
      ];

      const svg = renderBarChart(stats, "reviewsGiven");
      expect(svg).toContain("<title>bob: 0</title>");
      expect(svg).toContain(">0<");
    });
  });
});
