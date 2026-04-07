import { describe, expect, it } from "vitest";
import {
  analyzeAIPatterns,
  assignSizeTier,
  percentile,
} from "../../src/analyze/ai-patterns";
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

describe("analyzeAIPatterns", () => {
  it("counts bot reviewers and their review counts", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "copilot-bot",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "copilot-bot",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "coderabbit",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
        ],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    expect(result.botReviewers).toHaveLength(2);

    const copilot = result.botReviewers.find((b) => b.login === "copilot-bot");
    expect(copilot?.reviewCount).toBe(2);

    const coderabbit = result.botReviewers.find(
      (b) => b.login === "coderabbit",
    );
    expect(coderabbit?.reviewCount).toBe(1);
  });

  it("detects AI co-authored PRs via known AI co-author email patterns", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        commitMessages: [
          "feat: add feature\n\nCo-authored-by: Claude <noreply@anthropic.com>",
        ],
      }),
      makePR({
        number: 2,
        author: "bob",
        commitMessages: [
          "fix: patch\n\nco-authored-by: Copilot <123+Copilot@users.noreply.github.com>",
        ],
      }),
      makePR({
        number: 3,
        author: "carol",
        commitMessages: [
          "docs: update readme\n\nCo-authored-by: Teammate <teammate@example.com>",
        ],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    expect(result.aiCoAuthoredPRs).toBe(2);
    expect(result.totalPRs).toBe(3);
  });

  it("calculates botReviewPercentage correctly", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "copilot-bot",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
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
          makeReview({
            reviewer: "coderabbit",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
        ],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    // 2 bot reviews out of 4 total = 50%
    expect(result.botReviewPercentage).toBe(50);
  });

  it("returns zeros for empty input", () => {
    const result = analyzeAIPatterns([]);
    expect(result.botReviewers).toEqual([]);
    expect(result.aiCoAuthoredPRs).toBe(0);
    expect(result.totalPRs).toBe(0);
    expect(result.botReviewPercentage).toBe(0);
  });

  it("returns 0% when no bot reviewers exist", () => {
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

    const result = analyzeAIPatterns(prs);
    expect(result.botReviewPercentage).toBe(0);
    expect(result.botReviewers).toEqual([]);
  });

  it("botReviewers are sorted by reviewCount descending", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bot-a",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bot-b",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bot-b",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bot-b",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bot-c",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bot-c",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
        ],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    expect(result.botReviewers[0].login).toBe("bot-b");
    expect(result.botReviewers[0].reviewCount).toBe(3);
    expect(result.botReviewers[1].login).toBe("bot-c");
    expect(result.botReviewers[1].reviewCount).toBe(2);
    expect(result.botReviewers[2].login).toBe("bot-a");
    expect(result.botReviewers[2].reviewCount).toBe(1);
  });

  it("counts PENDING reviews in totals (intentionally unfiltered)", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bot-a",
            author: "alice",
            reviewerIsBot: true,
            state: "PENDING",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bob",
            author: "alice",
            state: "APPROVED",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    // PENDING bot review should still be counted
    expect(result.botReviewers).toHaveLength(1);
    expect(result.botReviewers[0].reviewCount).toBe(1);
    expect(result.botReviewPercentage).toBe(50);
  });

  it("PRs with no AI co-author trailers don't count as AI co-authored", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        commitMessages: [],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    expect(result.aiCoAuthoredPRs).toBe(0);
  });

  it("does not count unobservable commit metadata as AI co-authored", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        commitMessages: null,
      }),
    ];

    const result = analyzeAIPatterns(prs);
    expect(result.aiCoAuthoredPRs).toBe(0);
    expect(result.totalPRs).toBe(1);
  });

  it("excludes traditional bot-authored PRs from burden comparison groups", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        authorIsBot: false,
        aiCategory: "human-only",
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
        author: "dependabot[bot]",
        authorIsBot: true,
        aiCategory: "human-only",
        reviews: Array.from(
          {
            length: 5,
          },
          (_, i) =>
            makeReview({
              reviewer: `reviewer-${i}`,
              author: "dependabot[bot]",
              prNumber: 2,
            }),
        ),
      }),
    ];

    const result = analyzeAIPatterns(prs);

    expect(result.totalPRs).toBe(2);
    expect(result.humanReviewBurden.humanOnly.prCount).toBe(1);
    expect(result.humanReviewBurden.humanOnly.humanReviewsPerPR.median).toBe(1);
  });
});

describe("percentile", () => {
  it("returns null for empty array", () => {
    expect(percentile([], 50)).toBeNull();
  });

  it("returns the single value for n=1", () => {
    expect(
      percentile(
        [
          42,
        ],
        50,
      ),
    ).toBe(42);
    expect(
      percentile(
        [
          42,
        ],
        90,
      ),
    ).toBe(42);
  });

  it("computes median of even-length array via interpolation", () => {
    expect(
      percentile(
        [
          1,
          2,
          3,
          4,
        ],
        50,
      ),
    ).toBe(2.5);
  });

  it("computes median of odd-length array", () => {
    expect(
      percentile(
        [
          1,
          2,
          3,
          4,
          5,
        ],
        50,
      ),
    ).toBe(3);
  });

  it("computes p90 correctly", () => {
    // sorted: [1,2,3,4,5,6,7,8,9,10]
    // rank = 0.9 * 9 = 8.1 → 9 + 0.1*(10-9) = 9.1
    expect(
      percentile(
        [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
        ],
        90,
      ),
    ).toBeCloseTo(9.1);
  });

  it("returns last element for p100", () => {
    expect(
      percentile(
        [
          1,
          2,
          3,
        ],
        100,
      ),
    ).toBe(3);
  });

  it("throws RangeError for negative percentile", () => {
    expect(() =>
      percentile(
        [
          1,
          2,
          3,
        ],
        -1,
      ),
    ).toThrow(RangeError);
  });

  it("throws RangeError for percentile above 100", () => {
    expect(() =>
      percentile(
        [
          1,
          2,
          3,
        ],
        101,
      ),
    ).toThrow(RangeError);
  });
});

describe("assignSizeTier", () => {
  it("returns Empty for 0 changes", () => {
    expect(assignSizeTier(0, 0)).toBe("Empty");
  });

  it("returns S for 1-50 lines", () => {
    expect(assignSizeTier(25, 25)).toBe("S");
    expect(assignSizeTier(50, 0)).toBe("S");
  });

  it("returns M for 51-300 lines", () => {
    expect(assignSizeTier(51, 0)).toBe("M");
    expect(assignSizeTier(150, 150)).toBe("M");
  });

  it("returns L for 301+ lines", () => {
    expect(assignSizeTier(200, 101)).toBe("L");
  });
});

describe("humanReviewBurden", () => {
  it("returns null metrics for empty input", () => {
    const result = analyzeAIPatterns([]);
    const burden = result.humanReviewBurden;
    expect(burden.humanOnly.prCount).toBe(0);
    expect(burden.humanOnly.humanReviewsPerPR.median).toBeNull();
    expect(burden.humanOnly.unreviewedRate).toBeNull();
  });

  it("excludes PRs with unobservable AI classification from burden comparison groups", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        aiCategory: null,
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
        author: "carol",
        aiCategory: "human-only",
        reviews: [
          makeReview({
            reviewer: "dave",
            author: "carol",
            prNumber: 2,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;

    expect(burden.humanOnly.prCount).toBe(1);
    expect(burden.humanOnly.humanReviewsPerPR.median).toBe(1);
    expect(burden.aiAssisted.prCount).toBe(0);
    expect(burden.aiAuthored.prCount).toBe(0);
  });

  it("groups PRs by aiCategory and computes per-group metrics", () => {
    const prs: PullRequestRecord[] = [
      // AI-authored PR with 1 human review
      makePR({
        number: 1,
        author: "openclaw-agent",
        aiCategory: "ai-authored",
        createdAt: "2025-06-01T10:00:00Z",
        additions: 20,
        deletions: 5,
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "openclaw-agent",
            state: "APPROVED",
            createdAt: "2025-06-01T12:00:00Z",
            prNumber: 1,
          }),
        ],
      }),
      // AI-assisted PR with 2 human reviews (1 CR + 1 APPROVED)
      makePR({
        number: 2,
        author: "alice",
        aiCategory: "ai-assisted",
        createdAt: "2025-06-02T10:00:00Z",
        additions: 100,
        deletions: 50,
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            state: "CHANGES_REQUESTED",
            createdAt: "2025-06-02T14:00:00Z",
            commitOid: "commit-a",
            prNumber: 2,
          }),
          makeReview({
            reviewer: "bob",
            author: "alice",
            state: "APPROVED",
            createdAt: "2025-06-03T10:00:00Z",
            commitOid: "commit-b",
            prNumber: 2,
          }),
        ],
      }),
      // Human-only PR with 1 human review
      makePR({
        number: 3,
        author: "carol",
        aiCategory: "human-only",
        createdAt: "2025-06-03T10:00:00Z",
        additions: 5,
        deletions: 2,
        reviews: [
          makeReview({
            reviewer: "alice",
            author: "carol",
            state: "APPROVED",
            createdAt: "2025-06-03T11:00:00Z",
            prNumber: 3,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;

    // AI-authored: 1 PR, 1 review
    expect(burden.aiAuthored.prCount).toBe(1);
    expect(burden.aiAuthored.humanReviewsPerPR.median).toBe(1);
    expect(burden.aiAuthored.unreviewedRate).toBe(0);

    // AI-assisted: 1 PR, 2 reviews, 1 CR out of 2 = 0.5 rate
    expect(burden.aiAssisted.prCount).toBe(1);
    expect(burden.aiAssisted.humanReviewsPerPR.median).toBe(2);
    expect(burden.aiAssisted.changeRequestRate.mean).toBe(0.5);
    // Two distinct reviewed revisions → 2 rounds
    expect(burden.aiAssisted.reviewRounds.median).toBe(2);

    // Human-only: 1 PR, 1 review
    expect(burden.humanOnly.prCount).toBe(1);
    expect(burden.humanOnly.humanReviewsPerPR.median).toBe(1);
  });

  it("computes unreviewedRate correctly", () => {
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
      makePR({
        number: 3,
        author: "carol",
        reviews: [
          makeReview({
            reviewer: "dave",
            author: "carol",
            prNumber: 3,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;
    // 2 out of 3 unreviewed
    expect(burden.humanOnly.unreviewedRate).toBeCloseTo(2 / 3);
  });

  it("counts distinct reviewed revisions, not reviewer submission totals", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-01T11:00:00Z",
            commitOid: "commit-a",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "carol",
            author: "alice",
            createdAt: "2025-06-01T12:00:00Z",
            commitOid: "commit-a",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-01T13:00:00Z",
            commitOid: "commit-b",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "carol",
            author: "alice",
            createdAt: "2025-06-01T14:00:00Z",
            commitOid: "commit-b",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-01T15:00:00Z",
            commitOid: "commit-c",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;

    expect(burden.humanOnly.humanReviewsPerPR.median).toBe(5);
    expect(burden.humanOnly.reviewRounds.median).toBe(3);
  });

  it("returns null reviewRounds when qualifying reviews lack commit SHAs", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-01T11:00:00Z",
            commitOid: null,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "carol",
            author: "alice",
            createdAt: "2025-06-01T12:00:00Z",
            commitOid: "commit-b",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;

    expect(burden.humanOnly.unreviewedRate).toBe(0);
    expect(burden.humanOnly.reviewRounds.median).toBeNull();
  });

  it("returns null reviewRounds when the review fetch limit is hit", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviewLimitReached: true,
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-01T11:00:00Z",
            commitOid: "commit-a",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "carol",
            author: "alice",
            createdAt: "2025-06-01T12:00:00Z",
            commitOid: "commit-b",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;

    expect(burden.humanOnly.unreviewedRate).toBe(0);
    expect(burden.humanOnly.reviewRounds.median).toBeNull();
  });

  it("excludes bot reviews, PENDING, and self-reviews from burden", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bot-a",
            author: "alice",
            reviewerIsBot: true,
            prNumber: 1,
          }),
          makeReview({
            reviewer: "bob",
            author: "alice",
            state: "PENDING",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "alice",
            author: "alice",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;
    // All reviews filtered out → 0 human reviews, unreviewed
    expect(burden.humanOnly.humanReviewsPerPR.median).toBe(0);
    expect(burden.humanOnly.unreviewedRate).toBe(1);
  });

  it("computes firstReviewLatencyMs excluding reviews before PR creation", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        createdAt: "2025-06-01T10:00:00Z",
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            // Before PR creation — should be excluded from latency
            createdAt: "2025-06-01T09:00:00Z",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "carol",
            author: "alice",
            // 3 hours after PR creation
            createdAt: "2025-06-01T13:00:00Z",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;
    // Only carol's review counts for latency: 3 hours
    expect(burden.humanOnly.firstReviewLatencyMs.median).toBe(
      3 * 60 * 60 * 1000,
    );
  });

  it("counts PR as unreviewed when all human reviews predate PR creation", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        createdAt: "2025-06-01T10:00:00Z",
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-01T09:00:00Z",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;
    // PR has a qualifying human review, but it's timestamped before
    // PR creation — the PR should be counted as unreviewed per spec.
    expect(burden.humanOnly.unreviewedRate).toBe(1);
    expect(burden.humanOnly.firstReviewLatencyMs.median).toBeNull();
    expect(burden.humanOnly.changeRequestRate.mean).toBeNull();
    expect(burden.humanOnly.reviewRounds.median).toBeNull();
  });

  it("returns null for stratified cells with fewer than 3 PRs", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        additions: 10,
        deletions: 5,
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;
    // Only 1 human-only S PR — below threshold of 3
    expect(burden.stratifiedBySize.S.humanOnly).toBeNull();
  });

  it("computes stratified metrics when sample is sufficient", () => {
    const prs: PullRequestRecord[] = Array.from(
      {
        length: 4,
      },
      (_, i) =>
        makePR({
          number: i + 1,
          author: `user-${i}`,
          additions: 10,
          deletions: 5,
          reviews: [
            makeReview({
              reviewer: "reviewer-x",
              author: `user-${i}`,
              prNumber: i + 1,
            }),
          ],
        }),
    );

    const burden = analyzeAIPatterns(prs).humanReviewBurden;
    // 4 human-only S-tier PRs — above threshold
    const cell = burden.stratifiedBySize.S.humanOnly;
    expect(cell).not.toBeNull();
    expect(cell?.prCount).toBe(4);
    expect(cell?.humanReviewsPerPR.median).toBe(1);
  });

  it("excludes PRs with unobservable size from size-stratified cells", () => {
    const prs: PullRequestRecord[] = Array.from(
      {
        length: 4,
      },
      (_, i) =>
        makePR({
          number: i + 1,
          author: `user-${i}`,
          aiCategory: "human-only",
          additions: null,
          deletions: null,
          reviews: [
            makeReview({
              reviewer: "reviewer-x",
              author: `user-${i}`,
              prNumber: i + 1,
            }),
          ],
        }),
    );

    const burden = analyzeAIPatterns(prs).humanReviewBurden;

    expect(burden.humanOnly.prCount).toBe(4);
    expect(burden.humanOnly.humanReviewsPerPR.median).toBe(1);
    expect(burden.stratifiedBySize.S.humanOnly).toBeNull();
    expect(burden.stratifiedBySize.M.humanOnly).toBeNull();
    expect(burden.stratifiedBySize.L.humanOnly).toBeNull();
    expect(burden.stratifiedBySize.Empty.humanOnly).toBeNull();
  });

  it("uses macro average for changeRequestRate (each PR weighted equally)", () => {
    const prs: PullRequestRecord[] = [
      // PR with 1 CR out of 1 review → rate = 1.0
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            state: "CHANGES_REQUESTED",
            prNumber: 1,
          }),
        ],
      }),
      // PR with 0 CR out of 10 reviews → rate = 0.0
      makePR({
        number: 2,
        author: "carol",
        reviews: Array.from(
          {
            length: 10,
          },
          (_, i) =>
            makeReview({
              reviewer: `reviewer-${i}`,
              author: "carol",
              state: "APPROVED",
              prNumber: 2,
            }),
        ),
      }),
    ];

    const burden = analyzeAIPatterns(prs).humanReviewBurden;
    // Macro average: (1.0 + 0.0) / 2 = 0.5
    // Micro average would be: 1/11 ≈ 0.09 — very different
    expect(burden.humanOnly.changeRequestRate.mean).toBe(0.5);
  });
});
