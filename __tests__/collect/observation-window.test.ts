import { describe, expect, it } from "vitest";
import { applyObservationWindow } from "../../src/collect/observation-window";
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
    state: "OPEN",
    authorIsBot: false,
    createdAt: "2025-06-01T10:00:00Z",
    mergedAt: null,
    closedAt: null,
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

describe("applyObservationWindow", () => {
  it("drops reviews created after until", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-02T00:00:00Z",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "carol",
            author: "alice",
            createdAt: "2025-06-04T00:00:00Z",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const result = applyObservationWindow(prs, "2025-06-03T00:00:00Z");

    expect(result[0].reviews).toHaveLength(1);
    expect(result[0].reviews[0].reviewer).toBe("bob");
  });

  it("preserves reviewLimitReached while trimming reviews to the observation window", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        reviewLimitReached: true,
        reviews: [
          makeReview({
            reviewer: "bob",
            author: "alice",
            createdAt: "2025-06-02T00:00:00Z",
            prNumber: 1,
          }),
          makeReview({
            reviewer: "carol",
            author: "alice",
            createdAt: "2025-06-04T00:00:00Z",
            prNumber: 1,
          }),
        ],
      }),
    ];

    const result = applyObservationWindow(prs, "2025-06-03T00:00:00Z");

    expect(result[0].reviewLimitReached).toBe(true);
    expect(result[0].reviews).toHaveLength(1);
  });

  it("treats a PR merged after until as still open at the cutoff", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        state: "MERGED",
        mergedAt: "2025-06-05T00:00:00Z",
        closedAt: "2025-06-05T00:00:00Z",
        mergedBy: "bob",
      }),
    ];

    const result = applyObservationWindow(prs, "2025-06-04T00:00:00Z");

    expect(result[0].state).toBe("OPEN");
    expect(result[0].mergedAt).toBeNull();
    expect(result[0].closedAt).toBeNull();
    expect(result[0].mergedBy).toBeNull();
  });

  it("preserves merged state when the merge happened on or before until", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        state: "MERGED",
        mergedAt: "2025-06-03T00:00:00Z",
        closedAt: "2025-06-03T00:00:00Z",
        mergedBy: "bob",
      }),
    ];

    const result = applyObservationWindow(prs, "2025-06-04T00:00:00Z");

    expect(result[0].state).toBe("MERGED");
    expect(result[0].mergedAt).toBe("2025-06-03T00:00:00Z");
    expect(result[0].closedAt).toBe("2025-06-03T00:00:00Z");
    expect(result[0].mergedBy).toBe("bob");
  });

  it("treats a PR closed after until as still open at the cutoff", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        state: "CLOSED",
        closedAt: "2025-06-05T00:00:00Z",
      }),
    ];

    const result = applyObservationWindow(prs, "2025-06-04T00:00:00Z");

    expect(result[0].state).toBe("OPEN");
    expect(result[0].closedAt).toBeNull();
  });

  it("preserves non-merged closed state when close happened on or before until", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        state: "CLOSED",
        closedAt: "2025-06-03T00:00:00Z",
      }),
    ];

    const result = applyObservationWindow(prs, "2025-06-04T00:00:00Z");

    expect(result[0].state).toBe("CLOSED");
    expect(result[0].closedAt).toBe("2025-06-03T00:00:00Z");
  });
});
