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

No filtering is applied. All PRs and reviews are included regardless of bot status.

### Per-module behavior

| Module | Author filter | Reviewer filter | Notes |
|---|---|---|---|
| per-user-stats | Yes | Yes | Skips entire PR if author is bot; skips individual bot reviews |
| bias-detector | Yes | Yes | Same as per-user-stats |
| merge-correlation | Yes | Yes | Bot reviews excluded from review counts on merged PRs |
| ai-patterns | **No** | **No** | Always includes all activity — its purpose is to quantify bot presence |
| html-report (KPIs) | Yes | N/A | Uses pre-filtered PR list for totals (PR count, unique authors) |
| time-series | Yes | N/A | Receives pre-filtered PR list from html-report |

### Rationale

Bot-authored PRs (e.g., Dependabot) are excluded entirely because:

- They do not reflect human team review workload.
- Including human reviews on bot PRs would inflate reviewer counts and distort bias detection.
- The `ai-patterns` module separately tracks bot activity for observability.

## Additional filters (always applied)

### PENDING reviews

Reviews with `state === "PENDING"` are draft/unsubmitted reviews. They are excluded from all modules:

- per-user-stats
- bias-detector
- merge-correlation
- time-series

### Self-reviews

Reviews where the reviewer is the PR author are excluded from:

- per-user-stats
- bias-detector
- merge-correlation

These do not represent peer review activity. In merge-correlation specifically, self-reviews must not count toward `avgReviewsBeforeMerge` or affect `zeroReviewMerges`, as these metrics measure whether a PR received independent peer review before merging.
