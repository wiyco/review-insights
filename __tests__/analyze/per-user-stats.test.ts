import { describe, expect, it } from "vitest";
import { computeUserStats } from "../../src/analyze/per-user-stats";
import type { PullRequestRecord, ReviewRecord } from "../../src/types";

function makeReview(
  overrides: Partial<ReviewRecord> & {
    reviewer: string;
  },
): ReviewRecord {
  return {
    author: "author",
    reviewerIsBot: overrides.reviewer.endsWith("[bot]"),
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

function findUser(stats: ReturnType<typeof computeUserStats>, login: string) {
  return stats.find((s) => s.login === login);
}

describe("computeUserStats", () => {
  const fixturePRs: PullRequestRecord[] = [
    makePR({
      number: 101,
      author: "alice",
      createdAt: "2025-06-01T10:00:00Z",
      reviews: [
        makeReview({
          reviewer: "bob",
          author: "alice",
          state: "APPROVED",
          createdAt: "2025-06-02T09:00:00Z",
          prNumber: 101,
        }),
        makeReview({
          reviewer: "carol",
          author: "alice",
          state: "CHANGES_REQUESTED",
          createdAt: "2025-06-01T15:00:00Z",
          prNumber: 101,
        }),
        makeReview({
          reviewer: "carol",
          author: "alice",
          state: "APPROVED",
          createdAt: "2025-06-02T16:00:00Z",
          prNumber: 101,
        }),
      ],
    }),
    makePR({
      number: 102,
      author: "bob",
      createdAt: "2025-06-04T08:00:00Z",
      reviews: [
        makeReview({
          reviewer: "alice",
          author: "bob",
          state: "APPROVED",
          createdAt: "2025-06-04T12:00:00Z",
          prNumber: 102,
        }),
        makeReview({
          reviewer: "dependabot[bot]",
          author: "bob",
          state: "COMMENTED",
          createdAt: "2025-06-04T08:30:00Z",
          prNumber: 102,
        }),
      ],
    }),
    makePR({
      number: 103,
      author: "carol",
      state: "OPEN",
      createdAt: "2025-06-06T09:00:00Z",
      mergedAt: null,
      closedAt: null,
      reviews: [
        makeReview({
          reviewer: "alice",
          author: "carol",
          state: "CHANGES_REQUESTED",
          createdAt: "2025-06-06T14:00:00Z",
          prNumber: 103,
        }),
        makeReview({
          reviewer: "bob",
          author: "carol",
          state: "COMMENTED",
          createdAt: "2025-06-06T15:00:00Z",
          prNumber: 103,
        }),
      ],
    }),
    makePR({
      number: 104,
      author: "alice",
      state: "CLOSED",
      createdAt: "2025-06-07T11:00:00Z",
      mergedAt: null,
      closedAt: "2025-06-08T09:00:00Z",
      reviews: [
        makeReview({
          reviewer: "bob",
          author: "alice",
          state: "APPROVED",
          createdAt: "2025-06-07T16:00:00Z",
          prNumber: 104,
        }),
      ],
    }),
    makePR({
      number: 105,
      author: "dave",
      createdAt: "2025-06-08T07:00:00Z",
      reviews: [],
    }),
  ];

  describe("reviewsGiven counts", () => {
    it("counts unique PRs reviewed per user", () => {
      const stats = computeUserStats(fixturePRs, true);

      // bob reviewed PR 101, 103, 104 => 3 unique PRs
      expect(findUser(stats, "bob")?.reviewsGiven).toBe(3);

      // carol reviewed PR 101 (twice, but same PR) => 1 unique PR
      expect(findUser(stats, "carol")?.reviewsGiven).toBe(1);

      // alice reviewed PR 102, 103 => 2 unique PRs
      expect(findUser(stats, "alice")?.reviewsGiven).toBe(2);

      // dave reviewed no PRs
      expect(findUser(stats, "dave")?.reviewsGiven).toBe(0);
    });
  });

  describe("reviewsReceived counts", () => {
    it("counts total reviews received by PR author", () => {
      const stats = computeUserStats(fixturePRs, true);

      // alice authored PR 101 (3 reviews) + PR 104 (1 review) = 4
      expect(findUser(stats, "alice")?.reviewsReceived).toBe(4);

      // bob authored PR 102 (2 reviews) = 2
      expect(findUser(stats, "bob")?.reviewsReceived).toBe(2);

      // carol authored PR 103 (2 reviews) = 2
      expect(findUser(stats, "carol")?.reviewsReceived).toBe(2);

      // dave authored PR 105 (0 reviews) = 0
      expect(findUser(stats, "dave")?.reviewsReceived).toBe(0);
    });
  });

  describe("approval and changeRequest counts", () => {
    it("counts approvals given by each reviewer", () => {
      const stats = computeUserStats(fixturePRs, true);

      // bob: APPROVED on PR 101, APPROVED on PR 104 => 2
      expect(findUser(stats, "bob")?.approvals).toBe(2);

      // carol: CHANGES_REQUESTED + APPROVED on PR 101 => 1 approval
      expect(findUser(stats, "carol")?.approvals).toBe(1);

      // alice: APPROVED on PR 102 => 1
      expect(findUser(stats, "alice")?.approvals).toBe(1);
    });

    it("counts change requests given by each reviewer", () => {
      const stats = computeUserStats(fixturePRs, true);

      // carol: CHANGES_REQUESTED on PR 101 => 1
      expect(findUser(stats, "carol")?.changeRequests).toBe(1);

      // alice: CHANGES_REQUESTED on PR 103 => 1
      expect(findUser(stats, "alice")?.changeRequests).toBe(1);

      // bob: 0 change requests
      expect(findUser(stats, "bob")?.changeRequests).toBe(0);
    });
  });

  describe("bot filtering", () => {
    it("includes bot reviewers when includeBots=true", () => {
      const stats = computeUserStats(fixturePRs, true);
      const bot = findUser(stats, "dependabot[bot]");
      expect(bot).toBeDefined();
      expect(bot?.reviewsGiven).toBe(1);
      expect(bot?.comments).toBe(1);
    });

    it("excludes bot reviewers when includeBots=false", () => {
      const stats = computeUserStats(fixturePRs, false);
      const bot = findUser(stats, "dependabot[bot]");
      expect(bot).toBeUndefined();
    });

    it("does not count bot reviews toward author's reviewsReceived when includeBots=false", () => {
      const statsWithBots = computeUserStats(fixturePRs, true);
      const statsWithoutBots = computeUserStats(fixturePRs, false);

      // bob authored PR 102: with bots = 2 reviews, without bots = 1
      expect(findUser(statsWithBots, "bob")?.reviewsReceived).toBe(2);
      expect(findUser(statsWithoutBots, "bob")?.reviewsReceived).toBe(1);
    });

    it("keeps AI tool reviewers when includeBots=false", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 106,
          author: "alice",
          reviews: [
            makeReview({
              reviewer: "devin-ai-integration[bot]",
              author: "alice",
              reviewerIsBot: false,
              state: "APPROVED",
              prNumber: 106,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, false);
      const aiReviewer = findUser(stats, "devin-ai-integration[bot]");
      expect(aiReviewer).toBeDefined();
      expect(aiReviewer?.reviewsGiven).toBe(1);
      expect(findUser(stats, "alice")?.reviewsReceived).toBe(1);
    });
  });

  describe("PENDING reviews", () => {
    it("excludes PENDING reviews from all metrics", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 201,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              state: "PENDING",
              createdAt: "2025-06-01T11:00:00Z",
              prNumber: 201,
            }),
            makeReview({
              reviewer: "carol",
              author: "alice",
              state: "APPROVED",
              createdAt: "2025-06-01T12:00:00Z",
              prNumber: 201,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);

      // bob's PENDING review should not count — bob has no submitted
      // reviews so he does not appear in stats at all
      expect(findUser(stats, "bob")).toBeUndefined();

      // carol's APPROVED review should count
      expect(findUser(stats, "carol")?.reviewsGiven).toBe(1);
      expect(findUser(stats, "carol")?.approvals).toBe(1);

      // alice should only receive carol's review, not bob's PENDING
      expect(findUser(stats, "alice")?.reviewsReceived).toBe(1);
    });

    it("excludes PENDING reviews from avgTimeToFirstReviewMs", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 202,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              state: "PENDING",
              createdAt: "2025-06-01T10:30:00Z",
              prNumber: 202,
            }),
            makeReview({
              reviewer: "carol",
              author: "alice",
              state: "APPROVED",
              createdAt: "2025-06-01T12:00:00Z",
              prNumber: 202,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");

      // Should use carol's review time (2h), not bob's PENDING (30min)
      expect(alice?.avgTimeToFirstReviewMs).toBe(2 * 60 * 60 * 1000);
    });
  });

  describe("DISMISSED reviews", () => {
    it("counts DISMISSED reviews for the reviewer", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 301,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              state: "DISMISSED",
              createdAt: "2025-06-02T09:00:00Z",
              prNumber: 301,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const bob = findUser(stats, "bob");
      expect(bob?.dismissed).toBe(1);
      expect(bob?.reviewsGiven).toBe(1);
    });
  });

  describe("self-reviews", () => {
    it("excludes self-reviews from all metrics", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 401,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "alice",
              state: "APPROVED",
              createdAt: "2025-06-01T12:00:00Z",
              prNumber: 401,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");
      expect(alice?.reviewsGiven).toBe(0);
      expect(alice?.reviewsReceived).toBe(0);
    });
  });

  describe("bot-authored PRs", () => {
    it("excludes bot-authored PRs entirely when includeBots=false", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 501,
          author: "dependabot[bot]",
          authorIsBot: true,
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "alice",
              author: "dependabot[bot]",
              state: "APPROVED",
              createdAt: "2025-06-01T12:00:00Z",
              prNumber: 501,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, false);
      // alice should not appear since the only PR was bot-authored
      expect(findUser(stats, "alice")).toBeUndefined();
    });
  });

  describe("time-to-first-review", () => {
    it("ignores reviews before PR creation for time-to-first-review", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 601,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              state: "APPROVED",
              // Review timestamp before PR creation (backdated)
              createdAt: "2025-06-01T09:00:00Z",
              prNumber: 601,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");
      // Review was before PR creation, so no valid first-review time
      expect(alice?.avgTimeToFirstReviewMs).toBeNull();
      expect(alice?.medianTimeToFirstReviewMs).toBeNull();
    });
  });

  describe("medianTimeToFirstReviewMs", () => {
    it("returns the middle value for odd number of PRs", () => {
      // 3 PRs with first-review latencies: 1h, 3h, 10h
      // median = 3h, avg = (1+3+10)/3 ≈ 4.67h
      const prs: PullRequestRecord[] = [
        makePR({
          number: 801,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              createdAt: "2025-06-01T11:00:00Z",
              prNumber: 801,
            }),
          ],
        }),
        makePR({
          number: 802,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              createdAt: "2025-06-01T13:00:00Z",
              prNumber: 802,
            }),
          ],
        }),
        makePR({
          number: 803,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              createdAt: "2025-06-01T20:00:00Z",
              prNumber: 803,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");
      expect(alice?.medianTimeToFirstReviewMs).toBe(3 * 60 * 60 * 1000);
    });

    it("returns the average of two middle values for even number of PRs", () => {
      // 2 PRs with first-review latencies: 1h, 5h
      // median = (1+5)/2 = 3h
      const prs: PullRequestRecord[] = [
        makePR({
          number: 811,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              createdAt: "2025-06-01T11:00:00Z",
              prNumber: 811,
            }),
          ],
        }),
        makePR({
          number: 812,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              createdAt: "2025-06-01T15:00:00Z",
              prNumber: 812,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");
      expect(alice?.medianTimeToFirstReviewMs).toBe(3 * 60 * 60 * 1000);
    });

    it("returns null when author has no reviewed PRs", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 821,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");
      expect(alice?.medianTimeToFirstReviewMs).toBeNull();
    });
  });

  describe("author-only entries", () => {
    it("creates entry for author who only authored PRs but never reviewed", () => {
      const prs: PullRequestRecord[] = [
        makePR({
          number: 701,
          author: "alice",
          createdAt: "2025-06-01T10:00:00Z",
          reviews: [
            makeReview({
              reviewer: "bob",
              author: "alice",
              state: "APPROVED",
              createdAt: "2025-06-01T12:00:00Z",
              prNumber: 701,
            }),
          ],
        }),
      ];

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");
      expect(alice).toBeDefined();
      expect(alice?.reviewsGiven).toBe(0);
      expect(alice?.reviewsReceived).toBe(1);
      expect(alice?.approvals).toBe(0);
    });
  });

  describe("empty input", () => {
    it("returns empty array for no pull requests", () => {
      const stats = computeUserStats([], true);
      expect(stats).toEqual([]);
    });

    it("returns empty array for no pull requests with includeBots=false", () => {
      const stats = computeUserStats([], false);
      expect(stats).toEqual([]);
    });
  });

  describe("sorting", () => {
    it("sorts results by reviewsGiven descending", () => {
      const stats = computeUserStats(fixturePRs, true);
      for (let i = 1; i < stats.length; i++) {
        expect(stats[i - 1].reviewsGiven).toBeGreaterThanOrEqual(
          stats[i].reviewsGiven,
        );
      }
    });
  });

  describe("ghost user handling", () => {
    it("does not exclude reviews between two ghost users as self-reviews", () => {
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

      const stats = computeUserStats(prs, true);
      const ghost = findUser(stats, "ghost");
      expect(ghost).toBeDefined();
      expect(ghost?.reviewsGiven).toBe(1);
      expect(ghost?.reviewsReceived).toBe(1);
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

      const stats = computeUserStats(prs, true);
      const alice = findUser(stats, "alice");
      expect(alice).toBeDefined();
      expect(alice?.reviewsGiven).toBe(0);
      expect(alice?.reviewsReceived).toBe(0);
    });
  });
});
