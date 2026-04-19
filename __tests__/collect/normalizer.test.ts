import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_REVIEWS_PER_PR,
  type RawPullRequestNode,
  type RawReview,
} from "../../src/collect/graphql-queries";
import {
  hasAICoAuthor,
  isAIToolAccount,
  isBot,
  normalizePullRequests,
  normalizeReview,
} from "../../src/collect/normalizer";

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const { logger } = await import("../../src/utils/logger");

function makeRawReview(overrides?: Partial<RawReview>): RawReview {
  return {
    author: {
      login: "reviewer-a",
      __typename: "User",
    },
    state: "APPROVED",
    createdAt: "2025-06-02T12:00:00Z",
    commit: {
      oid: "commit-1",
    },
    ...overrides,
  };
}

function makeRawNode(
  overrides?: Partial<RawPullRequestNode>,
): RawPullRequestNode {
  return {
    number: 1,
    title: "Test PR",
    state: "MERGED",
    createdAt: "2025-06-01T00:00:00Z",
    mergedAt: "2025-06-02T00:00:00Z",
    closedAt: "2025-06-02T00:00:00Z",
    additions: 42,
    deletions: 10,
    author: {
      login: "author-a",
      __typename: "User",
    },
    mergedBy: {
      login: "merger",
    },
    reviews: {
      pageInfo: {
        hasNextPage: false,
      },
      nodes: [
        makeRawReview(),
      ],
    },
    reviewRequests: {
      nodes: [],
    },
    commits: {
      nodes: [
        {
          commit: {
            message: "fix: something",
          },
        },
      ],
    },
    ...overrides,
  };
}

describe("isBot", () => {
  it("returns false for null", () => {
    expect(isBot(null)).toBe(false);
  });

  it("returns false for regular user string", () => {
    expect(isBot("alice")).toBe(false);
  });

  it("returns true for [bot] suffix string", () => {
    expect(isBot("dependabot[bot]")).toBe(true);
  });

  it("returns true for -bot suffix string", () => {
    expect(isBot("snyk-bot")).toBe(true);
  });

  it("is case-insensitive for suffix check", () => {
    expect(isBot("MyApp-BOT")).toBe(true);
    expect(isBot("app[BOT]")).toBe(true);
  });

  it("returns true for object with __typename Bot", () => {
    expect(
      isBot({
        login: "some-app",
        __typename: "Bot",
      }),
    ).toBe(true);
  });

  it("returns false for object with __typename User", () => {
    expect(
      isBot({
        login: "alice",
        __typename: "User",
      }),
    ).toBe(false);
  });

  it("returns false for object without __typename and no bot suffix", () => {
    expect(
      isBot({
        login: "alice",
      }),
    ).toBe(false);
  });
});

describe("isAIToolAccount", () => {
  it("returns true for openclaw- prefix", () => {
    expect(isAIToolAccount("openclaw-myuser")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAIToolAccount("OpenClaw-MyUser")).toBe(true);
  });

  it("returns false for regular user", () => {
    expect(isAIToolAccount("alice")).toBe(false);
  });

  it("returns false for bot accounts", () => {
    expect(isAIToolAccount("dependabot[bot]")).toBe(false);
  });

  it("returns true for devin-ai-integration[bot]", () => {
    expect(isAIToolAccount("devin-ai-integration[bot]")).toBe(true);
  });

  it("returns true for copilot-swe-agent[bot]", () => {
    expect(isAIToolAccount("copilot-swe-agent[bot]")).toBe(true);
  });
});

describe("hasAICoAuthor", () => {
  it("detects Claude Code co-author", () => {
    expect(
      hasAICoAuthor([
        "feat: add feature\n\nCo-authored-by: Claude <noreply@anthropic.com>",
      ]),
    ).toBe(true);
  });

  it("detects Claude with model name variant", () => {
    expect(
      hasAICoAuthor([
        "fix: bug\n\nCo-authored-by: Claude Opus 4.6 <noreply@anthropic.com>",
      ]),
    ).toBe(true);
  });

  it("detects Cursor Agent co-author", () => {
    expect(
      hasAICoAuthor([
        "feat: stuff\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>",
      ]),
    ).toBe(true);
  });

  it("detects GitHub Copilot co-author", () => {
    expect(
      hasAICoAuthor([
        "fix: thing\n\nCo-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>",
      ]),
    ).toBe(true);
  });

  it("detects Devin AI co-author", () => {
    expect(
      hasAICoAuthor([
        "feat: impl\n\nCo-authored-by: Devin AI <158243242+devin-ai-integration[bot]@users.noreply.github.com>",
      ]),
    ).toBe(true);
  });

  it("returns false for non-AI co-author", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\n\nCo-authored-by: Bob <bob@example.com>",
      ]),
    ).toBe(false);
  });

  it("does not consume later trailer lines as the co-author email", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\n\nCo-authored-by: Alice\n\nReviewed-by: Claude <noreply@anthropic.com>",
      ]),
    ).toBe(false);
  });

  it("does not consume CRLF-separated later trailer lines as the co-author email", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\r\n\r\nCo-authored-by: Alice\r\n\r\nReviewed-by: Claude <noreply@anthropic.com>",
      ]),
    ).toBe(false);
  });

  it("does not match malformed co-author lines with trailing text", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\n\nCo-authored-by: Claude <noreply@anthropic.com> Reviewed-by: Bob <bob@example.com>",
      ]),
    ).toBe(false);
  });

  it("requires a non-empty co-author name before the email", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\n\nCo-authored-by: <noreply@anthropic.com>",
      ]),
    ).toBe(false);
  });

  it("requires a non-whitespace co-author name before the email", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\n\nCo-authored-by:   <noreply@anthropic.com>",
      ]),
    ).toBe(false);
  });

  it("requires a whitespace separator between the co-author name and email", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\n\nCo-authored-by: Claude<noreply@anthropic.com>",
      ]),
    ).toBe(false);
  });

  it("does not trim whitespace inside the co-author email", () => {
    expect(
      hasAICoAuthor([
        "feat: pair programming\n\nCo-authored-by: Claude <noreply@anthropic.com >",
      ]),
    ).toBe(false);
  });

  it("returns false for empty commit messages", () => {
    expect(hasAICoAuthor([])).toBe(false);
  });

  it("returns false for message without co-author trailer", () => {
    expect(
      hasAICoAuthor([
        "just a normal commit message",
      ]),
    ).toBe(false);
  });

  it("is case-insensitive on the trailer prefix", () => {
    expect(
      hasAICoAuthor([
        "fix: stuff\n\nco-authored-by: Claude <noreply@anthropic.com>",
      ]),
    ).toBe(true);
  });
});

describe("normalizeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes a valid review", () => {
    const result = normalizeReview(makeRawReview(), 42, "author-a");
    expect(result).toEqual({
      reviewer: "reviewer-a",
      reviewerIsBot: false,
      author: "author-a",
      state: "APPROVED",
      createdAt: "2025-06-02T12:00:00Z",
      commitOid: "commit-1",
      prNumber: 42,
    });
  });

  it("uses 'ghost' when review author is null", () => {
    const result = normalizeReview(
      makeRawReview({
        author: null,
      }),
      1,
      "author-a",
    );
    expect(result.reviewer).toBe("ghost");
    expect(result.reviewerIsBot).toBe(false);
    expect(result.commitOid).toBe("commit-1");
  });

  it("uses null when the review commit SHA is missing", () => {
    const result = normalizeReview(
      makeRawReview({
        commit: null,
      }),
      1,
      "author-a",
    );
    expect(result.commitOid).toBeNull();
  });

  it("detects bot reviewer", () => {
    const result = normalizeReview(
      makeRawReview({
        author: {
          login: "dependabot[bot]",
          __typename: "Bot",
        },
      }),
      1,
      "author-a",
    );
    expect(result.reviewerIsBot).toBe(true);
  });

  it("does not treat AI tool reviewers as bots", () => {
    const result = normalizeReview(
      makeRawReview({
        author: {
          login: "devin-ai-integration[bot]",
          __typename: "Bot",
        },
      }),
      1,
      "author-a",
    );
    expect(result.reviewer).toBe("devin-ai-integration[bot]");
    expect(result.reviewerIsBot).toBe(false);
  });

  it("falls back to COMMENTED for unknown review state and warns", () => {
    const result = normalizeReview(
      makeRawReview({
        state: "UNKNOWN_STATE",
      }),
      99,
      "author-a",
    );
    expect(result.state).toBe("COMMENTED");
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining('Unknown review state "UNKNOWN_STATE"'),
    );
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("PR #99"),
    );
  });

  it("handles all valid review states without warning", () => {
    for (const state of [
      "APPROVED",
      "CHANGES_REQUESTED",
      "COMMENTED",
      "DISMISSED",
      "PENDING",
    ]) {
      vi.clearAllMocks();
      const result = normalizeReview(
        makeRawReview({
          state,
        }),
        1,
        "author-a",
      );
      expect(result.state).toBe(state);
      expect(logger.warning).not.toHaveBeenCalled();
    }
  });
});

describe("normalizePullRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes a basic PR node", () => {
    const result = normalizePullRequests([
      makeRawNode(),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      number: 1,
      title: "Test PR",
      state: "MERGED",
      author: "author-a",
      authorIsBot: false,
      mergedBy: "merger",
    });
    expect(result[0]?.reviews).toHaveLength(1);
    expect(result[0]?.commitMessages).toEqual([
      "fix: something",
    ]);
    expect(result[0]?.reviews[0]?.commitOid).toBe("commit-1");
  });

  it("uses 'ghost' when PR author is null", () => {
    const result = normalizePullRequests([
      makeRawNode({
        author: null,
      }),
    ]);
    expect(result[0]?.author).toBe("ghost");
    expect(result[0]?.authorIsBot).toBe(false);
  });

  it("detects bot PR author", () => {
    const result = normalizePullRequests([
      makeRawNode({
        author: {
          login: "renovate[bot]",
          __typename: "Bot",
        },
      }),
    ]);
    expect(result[0]?.authorIsBot).toBe(true);
  });

  it("returns null mergedBy when not merged", () => {
    const result = normalizePullRequests([
      makeRawNode({
        mergedBy: null,
        mergedAt: null,
        state: "OPEN",
      }),
    ]);
    expect(result[0]?.mergedBy).toBeNull();
  });

  it("warns when the review connection has an additional page", () => {
    const reviews = Array.from(
      {
        length: MAX_REVIEWS_PER_PR,
      },
      () => makeRawReview(),
    );
    const result = normalizePullRequests([
      makeRawNode({
        number: 42,
        reviews: {
          pageInfo: {
            hasNextPage: true,
          },
          nodes: reviews,
        },
      }),
    ]);
    expect(result[0]?.reviewLimitReached).toBe(true);
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("PR #42"),
    );
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("truncated"),
    );
  });

  it("does not warn when exactly MAX_REVIEWS_PER_PR reviews fit on one page", () => {
    const reviews = Array.from(
      {
        length: MAX_REVIEWS_PER_PR,
      },
      () => makeRawReview(),
    );
    const result = normalizePullRequests([
      makeRawNode({
        reviews: {
          pageInfo: {
            hasNextPage: false,
          },
          nodes: reviews,
        },
      }),
    ]);
    expect(result[0]?.reviewLimitReached).toBe(false);
    expect(logger.warning).not.toHaveBeenCalled();
  });

  it("does not warn when reviews are below threshold", () => {
    const result = normalizePullRequests([
      makeRawNode(),
    ]);
    expect(result[0]?.reviewLimitReached).toBe(false);
    expect(logger.warning).not.toHaveBeenCalled();
  });

  it("extracts User review requests by login", () => {
    const result = normalizePullRequests([
      makeRawNode({
        reviewRequests: {
          nodes: [
            {
              requestedReviewer: {
                login: "alice",
              },
            },
          ],
        },
      }),
    ]);
    expect(result[0]?.reviewRequests).toEqual([
      "alice",
    ]);
  });

  it("extracts Team review requests by name", () => {
    const result = normalizePullRequests([
      makeRawNode({
        reviewRequests: {
          nodes: [
            {
              requestedReviewer: {
                name: "core-team",
              },
            },
          ],
        },
      }),
    ]);
    expect(result[0]?.reviewRequests).toEqual([
      "core-team",
    ]);
  });

  it("filters out null requestedReviewer", () => {
    const result = normalizePullRequests([
      makeRawNode({
        reviewRequests: {
          nodes: [
            {
              requestedReviewer: null,
            },
          ],
        },
      }),
    ]);
    expect(result[0]?.reviewRequests).toEqual([]);
  });

  it("normalizes multiple PRs", () => {
    const result = normalizePullRequests([
      makeRawNode({
        number: 1,
      }),
      makeRawNode({
        number: 2,
      }),
      makeRawNode({
        number: 3,
      }),
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((pr) => pr.number)).toEqual([
      1,
      2,
      3,
    ]);
  });

  it("handles empty nodes array", () => {
    const result = normalizePullRequests([]);
    expect(result).toEqual([]);
  });

  it("maps additions and deletions from raw node", () => {
    const result = normalizePullRequests([
      makeRawNode({
        additions: 100,
        deletions: 25,
      }),
    ]);
    expect(result[0]?.additions).toBe(100);
    expect(result[0]?.deletions).toBe(25);
  });

  it("classifies AI tool account author as ai-authored", () => {
    const result = normalizePullRequests([
      makeRawNode({
        author: {
          login: "openclaw-user1",
          __typename: "User",
        },
      }),
    ]);
    expect(result[0]?.aiCategory).toBe("ai-authored");
  });

  it("classifies PR with AI co-author as ai-assisted", () => {
    const result = normalizePullRequests([
      makeRawNode({
        commits: {
          nodes: [
            {
              commit: {
                message:
                  "feat: add feature\n\nCo-authored-by: Claude <noreply@anthropic.com>",
              },
            },
          ],
        },
      }),
    ]);
    expect(result[0]?.aiCategory).toBe("ai-assisted");
  });

  it("does not classify an AI reviewer trailer as ai-assisted", () => {
    const result = normalizePullRequests([
      makeRawNode({
        commits: {
          nodes: [
            {
              commit: {
                message:
                  "feat: pair programming\n\nCo-authored-by: Alice\n\nReviewed-by: Claude <noreply@anthropic.com>",
              },
            },
          ],
        },
      }),
    ]);
    expect(result[0]?.aiCategory).toBe("human-only");
  });

  it("classifies regular PR as human-only", () => {
    const result = normalizePullRequests([
      makeRawNode(),
    ]);
    expect(result[0]?.aiCategory).toBe("human-only");
  });

  it("classifies Devin AI as ai-authored with authorIsBot false", () => {
    const result = normalizePullRequests([
      makeRawNode({
        author: {
          login: "devin-ai-integration[bot]",
          __typename: "Bot",
        },
      }),
    ]);
    expect(result[0]?.aiCategory).toBe("ai-authored");
    expect(result[0]?.authorIsBot).toBe(false);
  });

  it("classifies Copilot coding agent as ai-authored with authorIsBot false", () => {
    const result = normalizePullRequests([
      makeRawNode({
        author: {
          login: "copilot-swe-agent[bot]",
          __typename: "Bot",
        },
      }),
    ]);
    expect(result[0]?.aiCategory).toBe("ai-authored");
    expect(result[0]?.authorIsBot).toBe(false);
  });

  it("ai-authored takes precedence over ai-assisted", () => {
    const result = normalizePullRequests([
      makeRawNode({
        author: {
          login: "openclaw-agent",
          __typename: "User",
        },
        commits: {
          nodes: [
            {
              commit: {
                message:
                  "feat: impl\n\nCo-authored-by: Claude <noreply@anthropic.com>",
              },
            },
          ],
        },
      }),
    ]);
    expect(result[0]?.aiCategory).toBe("ai-authored");
  });
});
