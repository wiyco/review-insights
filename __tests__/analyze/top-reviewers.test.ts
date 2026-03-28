import { describe, expect, it } from "vitest";
import { computeTopReviewerSummary } from "../../src/analyze/top-reviewers";
import type { UserReviewStats } from "../../src/types";

function makeUser(
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

describe("computeTopReviewerSummary", () => {
  it("returns no top reviewers for an empty dataset", () => {
    const summary = computeTopReviewerSummary([]);

    expect(summary).toEqual({
      reviewerCount: 0,
      maxReviewsGiven: null,
      topReviewers: [],
    });
  });

  it("returns no top reviewers when the reviewer population is empty", () => {
    const summary = computeTopReviewerSummary([
      makeUser({
        login: "author-only",
        reviewsGiven: 0,
      }),
    ]);

    expect(summary).toEqual({
      reviewerCount: 0,
      maxReviewsGiven: null,
      topReviewers: [],
    });
  });

  it("returns the full argmax set when multiple reviewers tie", () => {
    const summary = computeTopReviewerSummary([
      makeUser({
        login: "carol",
        reviewsGiven: 4,
      }),
      makeUser({
        login: "alice",
        reviewsGiven: 7,
      }),
      makeUser({
        login: "bob",
        reviewsGiven: 7,
      }),
      makeUser({
        login: "dave",
        reviewsGiven: 0,
      }),
    ]);

    expect(summary).toEqual({
      reviewerCount: 3,
      maxReviewsGiven: 7,
      topReviewers: [
        "alice",
        "bob",
      ],
    });
  });

  it("replaces an earlier tie set when a later maximum is observed", () => {
    const summary = computeTopReviewerSummary([
      makeUser({
        login: "alpha",
        reviewsGiven: 5,
      }),
      makeUser({
        login: "beta",
        reviewsGiven: 5,
      }),
      makeUser({
        login: "gamma",
        reviewsGiven: 8,
      }),
      makeUser({
        login: "delta",
        reviewsGiven: 8,
      }),
    ]);

    expect(summary).toEqual({
      reviewerCount: 4,
      maxReviewsGiven: 8,
      topReviewers: [
        "delta",
        "gamma",
      ],
    });
  });

  it("sorts tied logins by locale-invariant code-unit order", () => {
    const summary = computeTopReviewerSummary([
      makeUser({
        login: "i",
        reviewsGiven: 3,
      }),
      makeUser({
        login: "I",
        reviewsGiven: 3,
      }),
      makeUser({
        login: "a",
        reviewsGiven: 3,
      }),
    ]);

    expect(summary.topReviewers).toEqual([
      "I",
      "a",
      "i",
    ]);
  });

  it("handles reviewer populations above the Math.max spread limit", () => {
    const largePopulation = Array.from(
      {
        length: 130_000,
      },
      (_, index) =>
        makeUser({
          login: `user-${index}`,
          reviewsGiven: 1,
        }),
    );

    const summary = computeTopReviewerSummary([
      ...largePopulation,
      makeUser({
        login: "winner",
        reviewsGiven: 2,
      }),
    ]);

    expect(summary).toEqual({
      reviewerCount: 130_001,
      maxReviewsGiven: 2,
      topReviewers: [
        "winner",
      ],
    });
  });
});
