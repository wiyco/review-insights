# Filtering Specification

This document describes how pull requests and reviews are filtered before analysis.

## `include-bots` (default: `false`)

The `include-bots` input controls whether bot accounts are included in statistics. Bot detection is based on the GitHub user type (`Bot`) or login suffixes (`[bot]`, `-bot`).

### When `include-bots` is `false`

Two independent filters are applied:

1. **Author filter** — PRs where `authorIsBot` is `true` are skipped entirely. All reviews on that PR are also excluded, even if the reviewers are human.
2. **Reviewer filter** — Individual reviews where `reviewerIsBot` is `true` are excluded from metrics, even on human-authored PRs.

Both filters must pass for a review to be counted. A human review on a bot-authored PR is **not** counted.

### When `include-bots` is `true`

No additional `include-bots` filtering is applied in modules that honor the flag. The `ai-patterns` module keeps its documented split: bot observability metrics use the full dataset, while `humanReviewBurden` still excludes traditional bot-authored PRs from the comparison cohort.

### Per-module behavior

| Module | Author filter | Reviewer filter | Notes |
|---|---|---|---|
| per-user-stats | Yes | Yes | Skips entire PR if author is bot; skips individual bot reviews |
| bias-detector | Yes | Yes | Same as per-user-stats |
| merge-correlation | Yes | Yes | Bot reviews excluded from review counts on merged PRs |
| ai-patterns | Mixed | Mixed | Top-level bot observability metrics include all activity, but `humanReviewBurden` always excludes traditional bot-authored PRs and bot reviews from the comparison metrics |
| html-report (KPIs) | Yes | N/A | Uses pre-filtered PR list for totals (PR count, unique authors) |
| time-series | Yes | N/A | Receives the pre-filtered PR list from html-report. When `include-bots` is `false`, bot-authored PRs are excluded there; when `true`, all PRs are included. Bot reviews and self-reviews are **not** excluded, so the review count reflects all non-PENDING review activity on that input list. |

For `ai-patterns`, this split is intentional: bot observability (`botReviewers`, `botReviewPercentage`, `aiCoAuthoredPRs`, `totalPRs`) uses the full dataset, while `humanReviewBurden` uses a comparison cohort that excludes traditional bot-authored PRs regardless of `include-bots`.

### Rationale

Bot-authored PRs (e.g., Dependabot) are excluded entirely because:

- They do not reflect human team review workload.
- Including human reviews on bot PRs would inflate reviewer counts and distort bias detection.
- The `ai-patterns` module separately tracks bot activity for observability while excluding traditional bot-authored PRs from the AI-vs-human burden comparison.

## Additional filters (always applied)

### PENDING reviews

Reviews with `state === "PENDING"` are draft/unsubmitted reviews. They are excluded from the following modules:

- per-user-stats
- bias-detector
- merge-correlation
- time-series
- ai-patterns (human review burden metrics only — `getQualifyingHumanReviews` excludes PENDING)

> [!NOTE]
>
> The `ai-patterns` module's top-level metrics (`totalReviews`, `botReviewPercentage`) intentionally **include** PENDING reviews to capture the full scope of bot activity. See [statistics.md](statistics.md#botreviewpercentage) for details. As a result, `botReviewPercentage` has a different denominator than metrics in other modules.

### Self-reviews

Reviews where the reviewer is the PR author are excluded from:

- per-user-stats
- bias-detector
- merge-correlation
- ai-patterns (human review burden metrics)

These do not represent peer review activity. In merge-correlation specifically, self-reviews must not count toward `avgReviewsBeforeMerge` or affect `zeroReviewMerges`, as these metrics measure whether a PR received independent peer review before merging.

**Exception: `ghost` placeholder** — When GraphQL returns `null` for a deleted user account, the normalizer substitutes the shared placeholder `ghost`. The self-review exclusion is skipped when either the reviewer or the author login is `ghost`, to avoid incorrectly collapsing two unrelated deleted users onto the same identity. This guard applies to all modules listed above.
