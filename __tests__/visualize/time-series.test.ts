import { describe, expect, it } from "vitest";
import type { PullRequestRecord, ReviewRecord } from "../../src/types";
import { renderTimeSeries } from "../../src/visualize/time-series";

function makeReview(
  overrides: Partial<ReviewRecord> & {
    reviewer: string;
  },
): ReviewRecord {
  return {
    reviewerIsBot: false,
    author: "some-author",
    state: "APPROVED",
    createdAt: "2025-03-10T12:00:00Z",
    prNumber: 1,
    ...overrides,
  };
}

function makePR(
  overrides: Partial<PullRequestRecord> & {
    number: number;
  },
): PullRequestRecord {
  return {
    title: `PR #${overrides.number}`,
    state: "MERGED",
    author: "alice",
    authorIsBot: false,
    createdAt: "2025-03-10T12:00:00Z",
    mergedAt: "2025-03-11T12:00:00Z",
    closedAt: null,
    mergedBy: "bob",
    reviewLimitReached: false,
    reviews: [],
    reviewRequests: [],
    commitMessages: [
      "fix stuff",
    ],
    additions: 10,
    deletions: 5,
    aiCategory: "human-only",
    ...overrides,
  };
}

describe("renderTimeSeries", () => {
  describe("SVG structure", () => {
    it("returns a valid SVG for non-empty data", () => {
      const prs = [
        makePR({
          number: 1,
          reviews: [
            makeReview({
              reviewer: "bob",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "weekly");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
  });

  describe("empty input", () => {
    it('contains "No data available" for empty input', () => {
      const svg = renderTimeSeries([], "weekly");
      expect(svg).toContain("No data available");
    });
  });

  describe("legend", () => {
    it('contains legend labels "Reviews" and "PRs Opened"', () => {
      const prs = [
        makePR({
          number: 1,
          reviews: [
            makeReview({
              reviewer: "bob",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "monthly");
      expect(svg).toContain("Reviews");
      expect(svg).toContain("PRs Opened");
    });
  });

  describe("data points", () => {
    it("contains circle elements for data points", () => {
      const prs = [
        makePR({
          number: 1,
          reviews: [
            makeReview({
              reviewer: "bob",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "weekly");
      expect(svg).toContain("<circle");
    });

    it("contains polyline elements for lines when multiple data points exist", () => {
      const prs = [
        makePR({
          number: 1,
          createdAt: "2025-01-06T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              createdAt: "2025-01-07T12:00:00Z",
            }),
          ],
        }),
        makePR({
          number: 2,
          createdAt: "2025-02-10T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "carol",
              createdAt: "2025-02-11T12:00:00Z",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "monthly");
      expect(svg).toContain("<polyline");
    });
  });

  describe("intervals", () => {
    it('works with "weekly" interval', () => {
      const prs = [
        makePR({
          number: 1,
          createdAt: "2025-03-03T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              createdAt: "2025-03-04T12:00:00Z",
            }),
          ],
        }),
        makePR({
          number: 2,
          createdAt: "2025-03-17T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "carol",
              createdAt: "2025-03-18T12:00:00Z",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "weekly");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("-W");
    });

    it('works with "monthly" interval', () => {
      const prs = [
        makePR({
          number: 1,
          createdAt: "2025-01-15T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              createdAt: "2025-01-16T12:00:00Z",
            }),
          ],
        }),
        makePR({
          number: 2,
          createdAt: "2025-03-10T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "carol",
              createdAt: "2025-03-11T12:00:00Z",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "monthly");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("2025-01");
      expect(svg).toContain("2025-03");
    });
  });

  describe("PENDING review exclusion", () => {
    it("does not count PENDING reviews in review buckets", () => {
      const prs = [
        makePR({
          number: 1,
          createdAt: "2025-03-10T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              state: "PENDING",
              createdAt: "2025-03-10T13:00:00Z",
            }),
            makeReview({
              reviewer: "carol",
              state: "APPROVED",
              createdAt: "2025-03-10T14:00:00Z",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "weekly");
      // Both PRs Opened and Reviews equal 1; if PENDING were counted reviews would be 2.
      // Extract all circle cy values — with maxY=1 both series dots sit at the top (cy=60).
      const cyValues = [
        ...svg.matchAll(/<circle[^>]+cy="(\d+(?:\.\d+)?)"/g),
      ].map((m) => Number(m[1]));
      // All dots should be at the top of the chart (paddingTop = 60) since both series max at 1
      expect(cyValues.length).toBeGreaterThan(0);
      for (const cy of cyValues) {
        expect(cy).toBe(60);
      }
    });

    it("counts zero reviews when all reviews are PENDING", () => {
      const prs = [
        makePR({
          number: 1,
          createdAt: "2025-03-10T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              state: "PENDING",
              createdAt: "2025-03-10T13:00:00Z",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "weekly");
      // PRs Opened = 1 (top, cy=60), Reviews = 0 (bottom, cy=320)
      const cyValues = [
        ...svg.matchAll(/<circle[^>]+cy="(\d+(?:\.\d+)?)"/g),
      ].map((m) => Number(m[1]));
      expect(cyValues).toContain(60); // PRs Opened dot at top
      expect(cyValues).toContain(320); // Reviews dot at baseline
    });
  });

  it("does not extend date range for PENDING reviews", () => {
    // PR created in March, APPROVED review in March, PENDING review in June.
    // Without the fix, the PENDING review would extend endDate to June,
    // adding trailing empty periods.
    const prs = [
      makePR({
        number: 1,
        createdAt: "2025-03-10T12:00:00Z",
        reviews: [
          makeReview({
            reviewer: "bob",
            state: "APPROVED",
            createdAt: "2025-03-11T12:00:00Z",
          }),
          makeReview({
            reviewer: "carol",
            state: "PENDING",
            createdAt: "2025-06-15T12:00:00Z",
          }),
        ],
      }),
    ];

    const svg = renderTimeSeries(prs, "monthly");
    // The chart should NOT contain June since the PENDING review should be excluded
    expect(svg).not.toContain("2025-06");
    // But should contain March
    expect(svg).toContain("2025-03");
  });

  describe("year boundary", () => {
    it("handles weekly bucketing across year boundary", () => {
      const prs = [
        makePR({
          number: 1,
          createdAt: "2024-12-30T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              createdAt: "2025-01-02T12:00:00Z",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "weekly");
      expect(svg.startsWith("<svg")).toBe(true);
      // Should contain week labels from both years
      expect(svg).toContain("-W");
    });

    it("handles monthly bucketing across year boundary", () => {
      const prs = [
        makePR({
          number: 1,
          createdAt: "2024-12-15T12:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              createdAt: "2025-01-15T12:00:00Z",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "monthly");
      expect(svg).toContain("2024-12");
      expect(svg).toContain("2025-01");
    });
  });

  describe("single PR", () => {
    it("handles single PR with no polyline, just a dot", () => {
      const prs = [
        makePR({
          number: 1,
          reviews: [
            makeReview({
              reviewer: "bob",
            }),
          ],
        }),
      ];

      const svg = renderTimeSeries(prs, "monthly");
      expect(svg).toContain("<circle");
      expect(svg).not.toContain("<polyline");
    });
  });
});
