import { describe, expect, it, vi } from "vitest";
import {
  detectBias,
  fitQuasiIndependenceModel,
} from "../../src/analyze/bias-detector";
import type {
  PullRequestRecord,
  ReviewMatrix,
  ReviewRecord,
} from "../../src/types";

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
    commitOid: "commit-1",
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
    reviewLimitReached: false,
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
  describe("fitQuasiIndependenceModel", () => {
    it("returns 0 for reviewers or authors outside the observed support", () => {
      const matrix: ReviewMatrix = new Map([
        [
          "bob",
          new Map([
            [
              "alice",
              3,
            ],
          ]),
        ],
        [
          "carol",
          new Map([
            [
              "dave",
              2,
            ],
          ]),
        ],
      ]);

      const { expectedCount } = fitQuasiIndependenceModel(matrix);

      expect(expectedCount("erin", "alice")).toBe(0);
      expect(expectedCount("bob", "frank")).toBe(0);
      expect(expectedCount("bob", "dave")).toBe(0);
      expect(expectedCount("carol", "alice")).toBe(0);
      expect(expectedCount("bob", "alice")).toBeGreaterThan(0);
    });

    it("throws when the model cannot converge within the IPF iteration limit", () => {
      const matrix: ReviewMatrix = new Map([
        [
          "bob",
          new Map([
            [
              "alice",
              3,
            ],
          ]),
        ],
      ]);
      const absSpy = vi.spyOn(Math, "abs").mockReturnValue(1);

      try {
        expect(() => fitQuasiIndependenceModel(matrix)).toThrow(
          "Bias model did not converge within 10000 IPF iterations.",
        );
      } finally {
        absSpy.mockRestore();
      }
    });

    it("rejects reviewers whose observed support is empty", () => {
      const matrix: ReviewMatrix = new Map([
        [
          "bob",
          new Map(),
        ],
        [
          "carol",
          new Map([
            [
              "alice",
              1,
            ],
          ]),
        ],
      ]);

      expect(() => fitQuasiIndependenceModel(matrix)).toThrow(
        'Bias model support is empty for reviewer "bob".',
      );
    });

    it("rejects authors whose support collapses to zero mass", () => {
      const matrix: ReviewMatrix = new Map([
        [
          "bob",
          new Map([
            [
              "alice",
              0,
            ],
          ]),
        ],
      ]);

      expect(() => fitQuasiIndependenceModel(matrix)).toThrow(
        'Bias model support is empty for author "alice".',
      );
    });
  });

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

    it("returns an unavailable bias result instead of throwing when model fitting fails", () => {
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
      ];
      const absSpy = vi.spyOn(Math, "abs").mockReturnValue(1);

      try {
        const result = detectBias(prs, 2.0, false);
        expect(result.flaggedPairs).toEqual([]);
        expect(result.giniCoefficient).toBe(0);
        expect(result.modelFitError).toBe(
          "Bias model did not converge within 10000 IPF iterations.",
        );
      } finally {
        absSpy.mockRestore();
      }
    });

    it("stringifies non-Error failures while preserving descriptive outputs", () => {
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
      ];
      const sqrtSpy = vi.spyOn(Math, "sqrt").mockImplementation(() => {
        throw "sqrt failed";
      });

      try {
        const result = detectBias(prs, 2.0, false);
        expect(result.flaggedPairs).toEqual([]);
        expect(result.giniCoefficient).toBe(0);
        expect(result.modelFitError).toBe("sqrt failed");
      } finally {
        sqrtSpy.mockRestore();
      }
    });
  });

  describe("flagged pairs detection", () => {
    it("flags pairs whose counts exceed the activity-adjusted expectation", () => {
      const prs: PullRequestRecord[] = [];
      for (let i = 1; i <= 9; i++) {
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
          number: 10,
          author: "dave",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "dave",
              prNumber: 10,
            }),
          ],
        }),
      );
      prs.push(
        makePR({
          number: 11,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "alice",
              prNumber: 11,
            }),
          ],
        }),
      );
      for (let i = 12; i <= 20; i++) {
        prs.push(
          makePR({
            number: i,
            author: "dave",
            reviews: [
              makeReview({
                reviewer: "carol",
                author: "dave",
                prNumber: i,
              }),
            ],
          }),
        );
      }

      const result = detectBias(prs, 1.5, false);

      const bobAlice = result.flaggedPairs.find(
        (pair) => pair.reviewer === "bob" && pair.author === "alice",
      );
      expect(bobAlice).toBeDefined();
      expect(bobAlice?.count).toBe(9);
      // This symmetric 2x2 fixture has an analytic quasi-independence fit:
      // one IPF sweep lands exactly on an expected count of 5 for each cell.
      // Keep the assertion tight to lock the regression to that exact value.
      expect(bobAlice?.expectedCount).toBeCloseTo(5, 10);
      expect(bobAlice?.pearsonResidual).toBeCloseTo(4 / Math.sqrt(5), 10);
    });

    it("does not flag a high-volume pair when reviewer and author margins already explain it", () => {
      const prs: PullRequestRecord[] = [];
      let prNumber = 1;
      const counts: Array<
        [
          reviewer: string,
          author: string,
          count: number,
        ]
      > = [
        [
          "bob",
          "alice",
          50,
        ],
        [
          "bob",
          "erin",
          30,
        ],
        [
          "bob",
          "frank",
          20,
        ],
        [
          "carol",
          "alice",
          25,
        ],
        [
          "carol",
          "erin",
          15,
        ],
        [
          "carol",
          "frank",
          10,
        ],
        [
          "dave",
          "alice",
          25,
        ],
        [
          "dave",
          "erin",
          15,
        ],
        [
          "dave",
          "frank",
          10,
        ],
      ];

      for (const [reviewer, author, count] of counts) {
        for (let i = 0; i < count; i++) {
          prs.push(
            makePR({
              number: prNumber,
              author,
              reviews: [
                makeReview({
                  reviewer,
                  author,
                  prNumber,
                }),
              ],
            }),
          );
          prNumber++;
        }
      }

      const result = detectBias(prs, 0.5, false);
      expect(result.flaggedPairs).toEqual([]);
    });

    it("respects the structural-zero self-review diagonal when fitting expected counts", () => {
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
      for (let i = 11; i <= 20; i++) {
        prs.push(
          makePR({
            number: i,
            author: "bob",
            reviews: [
              makeReview({
                reviewer: "alice",
                author: "bob",
                prNumber: i,
              }),
            ],
          }),
        );
      }

      const result = detectBias(prs, 0.5, false);
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
      expect(result.modelFitError).toBeNull();
    });

    it("includes structural zeros in Gini calculation", () => {
      // bob reviews alice 5 times, carol reviews dave once.
      // Reviewers: {bob, carol}, Authors: {alice, dave}. No overlap.
      // Total cells = 2*2 - 0 = 4. Non-zero: 2. Zero: 2.
      // Gini values sorted: [0, 0, 1, 5], n=4, sum=6.
      // G = 2*(1*0 + 2*0 + 3*1 + 4*5)/(4*6) - 5/4 = 46/24 - 30/24 = 16/24 = 2/3
      const prs: PullRequestRecord[] = [];
      for (let i = 1; i <= 5; i++) {
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
          number: 6,
          author: "dave",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "dave",
              prNumber: 6,
            }),
          ],
        }),
      );

      const result = detectBias(prs, 2.0, false);
      // With zeros: 2/3 ≈ 0.667. Without zeros (old): 1/3 ≈ 0.333.
      expect(result.giniCoefficient).toBeCloseTo(2 / 3, 10);
    });

    it("reflects inequality across disjoint reviewer-author pairs with structural zeros", () => {
      // bob reviews alice once, dave reviews carol 10 times.
      // Reviewers: {bob, dave}, Authors: {alice, carol}. No overlap.
      // Total cells = 2*2 - 0 = 4. Non-zero: 2 (bob→alice=1, dave→carol=10).
      // Zero cells: 2 (bob→carol=0, dave→alice=0).
      // Gini values sorted: [0, 0, 1, 10], n=4, sum=11.
      // G = 2*(1*0+2*0+3*1+4*10)/(4*11) - 5/4 = 86/44 - 55/44 = 31/44 ≈ 0.705
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
      ];
      for (let i = 2; i <= 11; i++) {
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

      const result = detectBias(prs, 2.0, false);
      expect(result.giniCoefficient).toBeCloseTo(31 / 44, 10);
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
    it("does not flag a pair just below the Pearson residual threshold", () => {
      const prs: PullRequestRecord[] = [];
      for (let i = 1; i <= 9; i++) {
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
          number: 10,
          author: "dave",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "dave",
              prNumber: 10,
            }),
          ],
        }),
      );
      prs.push(
        makePR({
          number: 11,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "alice",
              prNumber: 11,
            }),
          ],
        }),
      );
      for (let i = 12; i <= 20; i++) {
        prs.push(
          makePR({
            number: i,
            author: "dave",
            reviews: [
              makeReview({
                reviewer: "carol",
                author: "dave",
                prNumber: i,
              }),
            ],
          }),
        );
      }

      const flaggedResult = detectBias(prs, 0.1, false);
      const bobAlice = flaggedResult.flaggedPairs.find(
        (pair) => pair.reviewer === "bob" && pair.author === "alice",
      );
      expect(bobAlice).toBeDefined();

      const boundaryResult = detectBias(
        prs,
        (bobAlice?.pearsonResidual ?? 0) + 1e-6,
        false,
      );
      expect(boundaryResult.flaggedPairs).toEqual([]);
    });

    it("flags a pair just above the Pearson residual threshold", () => {
      const prs: PullRequestRecord[] = [];
      for (let i = 1; i <= 9; i++) {
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
          number: 10,
          author: "dave",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "dave",
              prNumber: 10,
            }),
          ],
        }),
      );
      prs.push(
        makePR({
          number: 11,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "carol",
              author: "alice",
              prNumber: 11,
            }),
          ],
        }),
      );
      for (let i = 12; i <= 20; i++) {
        prs.push(
          makePR({
            number: i,
            author: "dave",
            reviews: [
              makeReview({
                reviewer: "carol",
                author: "dave",
                prNumber: i,
              }),
            ],
          }),
        );
      }

      const result = detectBias(prs, 1.5, false);
      const bobAlice = result.flaggedPairs.find(
        (pair) => pair.reviewer === "bob" && pair.author === "alice",
      );
      expect(bobAlice).toBeDefined();
      expect(bobAlice?.pearsonResidual).toBeGreaterThan(1.5);
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

    it("flaggedPairs are sorted by pearsonResidual descending", () => {
      const prs: PullRequestRecord[] = [];
      let prNumber = 1;
      const counts: Array<
        [
          reviewer: string,
          author: string,
          count: number,
        ]
      > = [
        [
          "bob",
          "alice",
          16,
        ],
        [
          "bob",
          "carol",
          4,
        ],
        [
          "dave",
          "alice",
          4,
        ],
        [
          "dave",
          "carol",
          16,
        ],
        [
          "frank",
          "eve",
          12,
        ],
        [
          "frank",
          "grace",
          8,
        ],
        [
          "heidi",
          "eve",
          8,
        ],
        [
          "heidi",
          "grace",
          12,
        ],
      ];

      for (const [reviewer, author, count] of counts) {
        for (let i = 0; i < count; i++) {
          prs.push(
            makePR({
              number: prNumber,
              author,
              reviews: [
                makeReview({
                  reviewer,
                  author,
                  prNumber,
                }),
              ],
            }),
          );
          prNumber++;
        }
      }

      const result = detectBias(prs, 0.5, false);
      expect(result.flaggedPairs).toHaveLength(4);
      for (let i = 1; i < result.flaggedPairs.length; i++) {
        expect(
          result.flaggedPairs[i - 1].pearsonResidual,
        ).toBeGreaterThanOrEqual(result.flaggedPairs[i].pearsonResidual);
      }
    });
  });

  describe("ghost user handling", () => {
    it("does not exclude reviews between ghost users as self-reviews", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "ghost",
          reviews: [
            makeReview({
              reviewer: "ghost",
              author: "ghost",
              prNumber: 1,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, true);
      const ghostRow = result.matrix.get("ghost");
      expect(ghostRow).toBeDefined();
      expect(ghostRow?.get("ghost")).toBe(1);
    });

    it("keeps the ghost diagonal in the Gini denominator", () => {
      // Non-zero cells: ghost->ghost=1, bob->alice=1.
      // Reviewers: {ghost, bob}, Authors: {ghost, alice}.
      // The ghost diagonal remains eligible, so total cells = 2 * 2 = 4.
      // Sorted full matrix values: [0, 0, 1, 1].
      // G = 2*(1*0 + 2*0 + 3*1 + 4*1)/(4*2) - 5/4 = 14/8 - 5/4 = 1/2.
      const prs: PullRequestRecord[] = [
        makePR({
          number: 1,
          author: "ghost",
          reviews: [
            makeReview({
              reviewer: "ghost",
              author: "ghost",
              prNumber: 1,
            }),
          ],
        }),
        makePR({
          number: 2,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              prNumber: 2,
            }),
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, true);
      expect(result.giniCoefficient).toBeCloseTo(0.5, 10);
    });

    it("still excludes genuine self-reviews for normal users", () => {
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
          ],
        }),
      ];

      const result = detectBias(prs, 2.0, true);
      expect(result.matrix.size).toBe(0);
    });
  });
});
