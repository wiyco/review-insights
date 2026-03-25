import { describe, expect, it } from "vitest";
import { computeMergeCorrelations } from "../../src/analyze/merge-correlation";
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
    ...overrides,
  };
}

describe("computeMergeCorrelations", () => {
  it("counts prsAuthored and prsMerged correctly per author", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
      }),
      makePR({
        number: 2,
        author: "alice",
      }),
      makePR({
        number: 3,
        author: "alice",
        state: "OPEN",
        mergedAt: null,
      }),
      makePR({
        number: 4,
        author: "bob",
      }),
    ];

    const result = computeMergeCorrelations(prs, false);

    const alice = result.find((r) => r.login === "alice");
    expect(alice?.prsAuthored).toBe(3);
    expect(alice?.prsMerged).toBe(2);

    const bob = result.find((r) => r.login === "bob");
    expect(bob?.prsAuthored).toBe(1);
    expect(bob?.prsMerged).toBe(1);
  });

  it("calculates avgReviewsBeforeMerge correctly", () => {
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

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");

    // Total reviews on merged PRs = 2 + 1 = 3, merged count = 2
    expect(alice?.avgReviewsBeforeMerge).toBe(1.5);
  });

  it("counts zeroReviewMerges correctly", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [],
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
      makePR({
        number: 3,
        author: "alice",
        reviews: [],
      }),
    ];

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");
    expect(alice?.zeroReviewMerges).toBe(2);
  });

  it("filters out bot-authored PRs when includeBots is false", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
      }),
      makePR({
        number: 2,
        author: "dependabot",
        authorIsBot: true,
      }),
    ];

    const result = computeMergeCorrelations(prs, false);
    expect(result).toHaveLength(1);
    expect(result[0].login).toBe("alice");
  });

  it("includes bot-authored PRs when includeBots is true", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
      }),
      makePR({
        number: 2,
        author: "dependabot",
        authorIsBot: true,
      }),
    ];

    const result = computeMergeCorrelations(prs, true);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.login)).toContain("dependabot");
  });

  it("excludes PENDING reviews from merged PR review counts", () => {
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

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");
    expect(alice?.avgReviewsBeforeMerge).toBe(1);
    expect(alice?.zeroReviewMerges).toBe(0);
  });

  it("counts as zero-review merge when all reviews are PENDING", () => {
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
        ],
      }),
    ];

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");
    expect(alice?.zeroReviewMerges).toBe(1);
    expect(alice?.avgReviewsBeforeMerge).toBe(0);
  });

  it("excludes bot reviews on merged PRs when includeBots is false", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bot[bot]",
            author: "alice",
            reviewerIsBot: true,
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

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");
    expect(alice?.avgReviewsBeforeMerge).toBe(1);
  });

  it("excludes self-reviews from review counts on merged PRs", () => {
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

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");
    expect(alice?.avgReviewsBeforeMerge).toBe(1);
    expect(alice?.zeroReviewMerges).toBe(0);
  });

  it("counts as zero-review merge when only review is a self-review", () => {
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

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");
    expect(alice?.avgReviewsBeforeMerge).toBe(0);
    expect(alice?.zeroReviewMerges).toBe(1);
  });

  it("returns empty array for empty input", () => {
    const result = computeMergeCorrelations([], false);
    expect(result).toEqual([]);
  });

  it("results are sorted by prsAuthored descending", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
      }),
      makePR({
        number: 2,
        author: "bob",
      }),
      makePR({
        number: 3,
        author: "bob",
      }),
      makePR({
        number: 4,
        author: "bob",
      }),
      makePR({
        number: 5,
        author: "carol",
      }),
      makePR({
        number: 6,
        author: "carol",
      }),
    ];

    const result = computeMergeCorrelations(prs, false);
    expect(result[0].login).toBe("bob");
    expect(result[0].prsAuthored).toBe(3);
    expect(result[1].login).toBe("carol");
    expect(result[1].prsAuthored).toBe(2);
    expect(result[2].login).toBe("alice");
    expect(result[2].prsAuthored).toBe(1);
  });

  it("non-merged PRs don't count toward prsMerged, avgReviewsBeforeMerge, or zeroReviewMerges", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        state: "OPEN",
        mergedAt: null,
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
        author: "alice",
        state: "CLOSED",
        mergedAt: null,
        reviews: [],
      }),
    ];

    const result = computeMergeCorrelations(prs, false);
    const alice = result.find((r) => r.login === "alice");

    expect(alice?.prsAuthored).toBe(2);
    expect(alice?.prsMerged).toBe(0);
    expect(alice?.avgReviewsBeforeMerge).toBe(0);
    expect(alice?.zeroReviewMerges).toBe(0);
  });
});
