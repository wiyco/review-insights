import { describe, expect, it } from "vitest";
import { detectBias } from "../../src/analyze/bias-detector";
import type { PullRequestRecord, ReviewRecord } from "../../src/types";

function makeReview(
  overrides: Partial<ReviewRecord> & {
    reviewer: string;
    author: string;
  },
): ReviewRecord {
  return {
    reviewerIsBot: false,
    state: "APPROVED",
    createdAt: "2025-06-02T09:00:00Z",
    prNumber: 1,
    ...overrides,
  };
}

function makePR(
  overrides: Partial<PullRequestRecord> & {
    number: number;
    author: string;
  },
): PullRequestRecord {
  return {
    title: `PR #${overrides.number}`,
    state: "MERGED",
    authorIsBot: false,
    createdAt: "2025-06-01T10:00:00Z",
    mergedAt: "2025-06-03T14:00:00Z",
    closedAt: "2025-06-03T14:00:00Z",
    mergedBy: null,
    reviews: [],
    reviewRequests: [],
    commitMessages: [],
    additions: 10,
    deletions: 5,
    aiCategory: "human-only",
    ...overrides,
  };
}

describe("detectBias", () => {
  describe("matrix construction", () => {
    it("builds review matrix from PRs correctly", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              prNumber: 1,
            }),
            makeReview({
              reviewer: "carol",
              author: "alice",
              prNumber: 1,
            }),
          ],
        }),
        makePR({
          number: 2,
          author: "bob",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "bob",
              prNumber: 2,
            }),
          ],
        }),
        makePR({
          number: 3,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              prNumber: 3,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, false);

      // bob reviewed alice twice (PR 1 + PR 3)
      expect(result.matrix.get("bob")?.get("alice")).toBe(2);

      // carol reviewed alice once
      expect(result.matrix.get("carol")?.get("alice")).toBe(1);

      // alice reviewed bob once
      expect(result.matrix.get("alice")?.get("bob")).toBe(1);
    });

    it("excludes self-reviews from the matrix", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "alice",
              prNumber: 1,
            }),
            makeReview({
              reviewer: "bob",
              author: "alice",
              prNumber: 1,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, false);

      // alice reviewing her own PR should not appear
      expect(result.matrix.get("alice")?.get("alice")).toBeUndefined();

      // bob reviewing alice should appear
      expect(result.matrix.get("bob")?.get("alice")).toBe(1);
    });
  });

  describe("flagged pairs detection", () => {
    it("flags pairs that exceed a low threshold", () => {
      // Create a scenario where bob reviews alice disproportionately
      const prs: PullRequestRecord[] = [];
      // bob reviews alice 10 times
      for (let i = 1; i <= 10; i++) {
        prs.push(
          makePR({
            number: i,
            author: "alice",
            reviews: [
              makeReview({
                reviewer: "bob",
                author: "alice",
                prNumber: i,
              }),
            ],
          }),
        );
      }
      // carol reviews dave once
      prs.push(
        makePR({
          number: 11,
          author: "dave",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "dave",
              prNumber: 11,
            }),
          ],
        }),
      );
      // alice reviews carol once
      prs.push(
        makePR({
          number: 12,
          author: "carol",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "carol",
              prNumber: 12,
            }),
          ],
        }),
      );

      const result = detectBias(prs, 0.5, false);

      expect(result.flaggedPairs.length).toBeGreaterThan(0);

      const bobAlice = result.flaggedPairs.find(
        (p) => p.reviewer === "bob" && p.author === "alice",
      );
      expect(bobAlice).toBeDefined();
      expect(bobAlice?.count).toBe(10);
      expect(bobAlice?.zScore).toBeGreaterThan(0);
    });

    it("produces no false positives with a high threshold", () => {
      // Evenly distributed reviews
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              prNumber: 1,
            }),
          ],
        }),
        makePR({
          number: 2,
          author: "bob",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "bob",
              prNumber: 2,
            }),
          ],
        }),
        makePR({
          number: 3,
          author: "carol",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "carol",
              prNumber: 3,
            }),
          ],
        }),
        makePR({
          number: 4,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "alice",
              prNumber: 4,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 10.0, false);
      expect(result.flaggedPairs).toEqual([]);
    });
  });

  describe("Gini coefficient", () => {
    it("returns 0 for perfectly equal distribution", () => {
      // Every reviewer-author pair has exactly 1 review
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              prNumber: 1,
            }),
          ],
        }),
        makePR({
          number: 2,
          author: "bob",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "bob",
              prNumber: 2,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, false);
      expect(result.giniCoefficient).toBe(0);
    });

    it("approaches 1 for highly unequal distribution", () => {
      const prs: PullRequestRecord[] = [];

      // One pair gets 100 reviews
      for (let i = 1; i <= 100; i++) {
        prs.push(
          makePR({
            number: i,
            author: "alice",
            reviews: [
              makeReview({
                reviewer: "bob",
                author: "alice",
                prNumber: i,
              }),
            ],
          }),
        );
      }

      // Many other pairs get 1 review each
      const others = [
        "carol",
        "dave",
        "eve",
        "frank",
        "grace",
        "heidi",
      ];
      for (let i = 0; i < others.length; i++) {
        prs.push(
          makePR({
            number: 101 + i,
            author: others[i],
            reviews: [
              makeReview({
                reviewer: others[(i + 1) % others.length],
                author: others[i],
                prNumber: 101 + i,
              }),
            ],
          }),
        );
      }

      const result = detectBias(prs, 2.0, false);
      expect(result.giniCoefficient).toBeGreaterThan(0.7);
    });

    it("returns 0 for empty input", () => {
      const result = detectBias([], 2.0, false);
      expect(result.giniCoefficient).toBe(0);
      expect(result.matrix.size).toBe(0);
      expect(result.flaggedPairs).toEqual([]);
    });
  });

  describe("bot filtering", () => {
    it("excludes bot reviewers when includeBots is false", () => {
      const prs: PullRequestRecord[] = [];
      // bot reviews alice 20 times — would dominate the matrix if included
      for (let i = 1; i <= 20; i++) {
        prs.push(
          makePR({
            number: i,
            author: "alice",
            reviews: [
              makeReview({
                reviewer: "dependabot[bot]",
                author: "alice",
                reviewerIsBot: true,
                prNumber: i,
              }),
            ],
          }),
        );
      }
      // human reviews
      prs.push(
        makePR({
          number: 21,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              prNumber: 21,
            }),
          ],
        }),
      );

      const result = detectBias(prs, 2.0, false);

      expect(result.matrix.get("dependabot[bot]")).toBeUndefined();
      expect(result.matrix.get("bob")?.get("alice")).toBe(1);
    });

    it("excludes bot-authored PRs when includeBots is false", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "dependabot[bot]",
          authorIsBot: true,
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "dependabot[bot]",
              prNumber: 1,
            }),
          ],
        }),
        makePR({
          number: 2,
          author: "bob",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "bob",
              prNumber: 2,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, false);

      // alice→dependabot[bot] should not appear
      expect(
        result.matrix.get("alice")?.get("dependabot[bot]"),
      ).toBeUndefined();
      expect(result.matrix.get("alice")?.get("bob")).toBe(1);
    });

    it("includes bots when includeBots is true", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bot-reviewer[bot]",
              author: "alice",
              reviewerIsBot: true,
              prNumber: 1,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, true);

      expect(result.matrix.get("bot-reviewer[bot]")?.get("alice")).toBe(1);
    });
  });

  describe("PENDING review exclusion", () => {
    it("excludes PENDING reviews from the matrix", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              state: "PENDING",
              prNumber: 1,
            }),
            makeReview({
              reviewer: "carol",
              author: "alice",
              state: "APPROVED",
              prNumber: 1,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, false);
      expect(result.matrix.get("bob")).toBeUndefined();
      expect(result.matrix.get("carol")?.get("alice")).toBe(1);
    });
  });

  describe("threshold boundary", () => {
    it("does not flag a pair exactly at the threshold boundary", () => {
      // 3 pairs with counts [3, 1, 1]. mean=5/3, stddev=sqrt(8/9)
      // z-score of 3: (3 - 5/3) / sqrt(8/9) = (4/3) / (2sqrt(2)/3) = 4/(2sqrt(2)) = sqrt(2) ≈ 1.4142
      // With threshold=sqrt(2), count must be > mean + threshold*stddev to flag
      // mean + sqrt(2)*stddev = 5/3 + sqrt(2)*2sqrt(2)/3 = 5/3 + 4/3 = 3
      // count=3 is NOT > 3, so it should NOT be flagged
      const prs: PullRequestRecord[] = [];
      for (let i = 1; i <= 3; i++) {
        prs.push(
          makePR({
            number: i,
            author: "alice",
            reviews: [
              makeReview({
                reviewer: "bob",
                author: "alice",
                prNumber: i,
              }),
            ],
          }),
        );
      }
      prs.push(
        makePR({
          number: 4,
          author: "bob",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "bob",
              prNumber: 4,
            }),
          ],
        }),
      );
      prs.push(
        makePR({
          number: 5,
          author: "carol",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "carol",
              prNumber: 5,
            }),
          ],
        }),
      );

      const threshold = Math.SQRT2;
      const result = detectBias(prs, threshold, false);
      expect(result.flaggedPairs).toEqual([]);
    });

    it("flags a pair just above the threshold boundary", () => {
      // Use a very low threshold so the same data gets flagged
      const prs: PullRequestRecord[] = [];
      for (let i = 1; i <= 3; i++) {
        prs.push(
          makePR({
            number: i,
            author: "alice",
            reviews: [
              makeReview({
                reviewer: "bob",
                author: "alice",
                prNumber: i,
              }),
            ],
          }),
        );
      }
      prs.push(
        makePR({
          number: 4,
          author: "bob",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "bob",
              prNumber: 4,
            }),
          ],
        }),
      );
      prs.push(
        makePR({
          number: 5,
          author: "carol",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "carol",
              prNumber: 5,
            }),
          ],
        }),
      );

      // With threshold just below the z-score of bob→alice, it should be flagged
      const result = detectBias(prs, 1.0, false);
      const bobAlice = result.flaggedPairs.find(
        (p) => p.reviewer === "bob" && p.author === "alice",
      );
      expect(bobAlice).toBeDefined();
      expect(bobAlice?.count).toBe(3);
      expect(bobAlice?.zScore).toBeGreaterThan(1.0);
    });
  });

  describe("edge cases", () => {
    it("handles PRs with no reviews", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "alice",
          reviews: [],
        }),
        makePR({
          number: 2,
          author: "bob",
          reviews: [],
        }),
      ];

      const result = detectBias(prs, 2.0, false);
      expect(result.matrix.size).toBe(0);
      expect(result.flaggedPairs).toEqual([]);
      expect(result.giniCoefficient).toBe(0);
    });

    it("flaggedPairs are sorted by zScore descending", () => {
      const prs: PullRequestRecord[] = [];
      for (let i = 1; i <= 10; i++) {
        prs.push(
          makePR({
            number: i,
            author: "alice",
            reviews: [
              makeReview({
                reviewer: "bob",
                author: "alice",
                prNumber: i,
              }),
            ],
          }),
        );
      }
      for (let i = 11; i <= 15; i++) {
        prs.push(
          makePR({
            number: i,
            author: "carol",
            reviews: [
              makeReview({
                reviewer: "dave",
                author: "carol",
                prNumber: i,
              }),
            ],
          }),
        );
      }
      prs.push(
        makePR({
          number: 16,
          author: "eve",
          reviews: [
            makeReview({
              reviewer: "frank",
              author: "eve",
              prNumber: 16,
            }),
          ],
        }),
      );

      const result = detectBias(prs, 0.5, false);
      for (let i = 1; i < result.flaggedPairs.length; i++) {
        expect(result.flaggedPairs[i - 1].zScore).toBeGreaterThanOrEqual(
          result.flaggedPairs[i].zScore,
        );
      }
    });
  });
});
