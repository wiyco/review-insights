import { describe, expect, it } from "vitest";
import { analyzeAIPatterns } from "../../src/analyze/ai-patterns";
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

  it("detects co-authored PRs via commitMessages containing Co-authored-by: (case insensitive)", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        commitMessages: [
          "feat: add feature\n\nCo-authored-by: bot <bot@example.com>",
        ],
      }),
      makePR({
        number: 2,
        author: "bob",
        commitMessages: [
          "fix: patch\n\nco-authored-by: ai <ai@example.com>",
        ],
      }),
      makePR({
        number: 3,
        author: "carol",
        commitMessages: [
          "docs: update readme",
        ],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    expect(result.coAuthoredPRs).toBe(2);
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
    expect(result.coAuthoredPRs).toBe(0);
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

  it("PRs with no commit messages don't count as co-authored", () => {
    const prs: PullRequestRecord[] = [
      makePR({
        number: 1,
        author: "alice",
        commitMessages: [],
      }),
    ];

    const result = analyzeAIPatterns(prs);
    expect(result.coAuthoredPRs).toBe(0);
  });
});
