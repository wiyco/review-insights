# AI Impact on Human Review Burden

This document specifies the analysis of how AI involvement affects human review workload. The module quantifies differences in review burden between AI-involved PRs and human-only PRs.

## PR classification

Every pull request is classified into exactly one of three mutually exclusive groups. Classification is determined at normalization time and stored on the `PullRequestRecord`.

| Group | Label | Condition (evaluated in order) |
|---|---|---|
| AI-authored | `ai-authored` | PR author is an AI tool account |
| AI-assisted | `ai-assisted` | PR author is human, but at least one commit contains an AI co-author trailer |
| Human-only | `human-only` | Neither of the above |

A PR that is both AI-authored and has AI co-author trailers is classified as `ai-authored` (the first matching rule wins).

### AI tool account detection

An account is an AI tool account if its login matches any of the following **prefix** patterns (case-insensitive):

| Prefix | Tool |
|---|---|
| `openclaw-` | OpenClaw (Claude, Codex, etc.) |

AI tool accounts are **distinct from bots**. The existing `isBot()` function (which detects `__typename === "Bot"`, `[bot]` suffix, `-bot` suffix) is not modified. A PR authored by an AI tool account has `authorIsBot === false` but `aiCategory === "ai-authored"`.

> [!TIP]
>
> **Rationale**
>
> Traditional bots (Dependabot, Renovate) perform mechanical dependency updates. AI tool accounts produce substantive code changes that require genuine peer review. Conflating them would distort both bot metrics and human review burden analysis.

### AI co-author detection

A commit message contains an AI co-author trailer if it matches the following pattern (case-insensitive):

```
Co-authored-by: <name> <email>
```

where the `<email>` matches any of:

| Pattern | Tool |
|---|---|
| `noreply@anthropic.com` | Claude Code |
| `cursoragent@cursor.com` | Cursor Agent |
| `*+Copilot@users.noreply.github.com` | GitHub Copilot |
| `*+devin-ai-integration[bot]@users.noreply.github.com` | Devin AI |

The name field is not checked — only the email address determines a match. This avoids brittleness from model name changes (e.g., "Claude" vs "Claude Opus 4.6").

Detection is applied to **all commit messages** in `PullRequestRecord.commitMessages`. Note that the GraphQL query currently fetches only the last commit per PR (`commits(last: 1)`), so this remains a **lower-bound estimate**. This limitation is documented but not changed by this specification.

### Interaction with `include-bots`

The `include-bots` flag controls traditional bot filtering only. AI classification is **independent** of `include-bots`:

| `include-bots` | Traditional bots (Dependabot, etc.) | AI tool accounts (OpenClaw) | AI-assisted PRs |
|---|---|---|---|
| `false` | Excluded from per-user-stats, bias, merge-correlation | **Included** (not bots) | Included |
| `true` | Included | Included | Included |

The `ai-patterns` module continues to ignore `include-bots` entirely and operates on the full dataset.

## PR size data

### GraphQL extension

The GraphQL query is extended to fetch PR size fields:

```graphql
additions
deletions
```

These are stored on `PullRequestRecord` as `additions: number` and `deletions: number`.

### PR size tiers

Each PR is assigned a size tier based on total changed lines (`additions + deletions`):

| Tier | Label | Range |
|---|---|---|
| Small | `S` | 1–50 lines |
| Medium | `M` | 51–300 lines |
| Large | `L` | 301+ lines |
| Empty | `Empty` | 0 lines (no changes) |

Size tiers are used for stratified analysis to control for the confounding effect of PR size on review burden.

## Human review burden metrics

Source: `ai-patterns.ts` (extended)

All metrics below are computed over **human reviews only** — reviews where `reviewerIsBot === false` and `state !== "PENDING"` and reviewer is not the PR author (self-review exclusion).

### Qualifying human reviews

For a given PR, the set of qualifying human reviews is:

$$R_{\text{human}}(pr) = \{r \in pr.\text{reviews} \mid \neg r.\text{reviewerIsBot} \land r.\text{state} \neq \text{PENDING} \land r.\text{reviewer} \neq pr.\text{author}\}$$

This definition is used consistently across all metrics below.

### Per-group metrics

For each group $g \in \{\text{ai-authored},\; \text{ai-assisted},\; \text{human-only}\}$, let $PR_g$ be the set of PRs in group $g$.

#### humanReviewsPerPR — Human review count distribution

Report the full distribution of human review counts per PR, not just the mean.

Let $x_i = |R_{\text{human}}(pr_i)|$ for each $pr_i \in PR_g$, sorted in ascending order.

| Statistic | Definition |
|---|---|
| `median` | $\tilde{x}$ — the 50th percentile of $\{x_i\}$ |
| `p90` | The 90th percentile of $\{x_i\}$ |
| `mean` | $\bar{x} = \frac{1}{n}\sum x_i$ |

All three return `null` when $|PR_g| = 0$.

> [!TIP]
>
> **Rationale**
>
> Review counts follow a right-skewed distribution. The median captures typical burden, p90 captures worst-case burden, and the mean is provided for backward compatibility but should not be used alone for comparison.

#### Percentile computation

For a sorted array $x_1 \leq x_2 \leq \cdots \leq x_n$ and a percentile $p \in [0, 100]$:

1. Compute the rank: $r = \frac{p}{100} \times (n - 1)$
2. Let $\lfloor r \rfloor = k$ and the fractional part $f = r - k$
3. Result: $x_{k+1} + f \times (x_{k+2} - x_{k+1})$

This is linear interpolation between the two nearest ranks (equivalent to NumPy's `percentile(..., interpolation='linear')` default).

When $n = 1$, median and p90 both equal $x_1$.

#### firstReviewLatencyMs — Time-to-first-human-review distribution

For each PR $pr_i \in P_g$ (PRs with at least one qualifying human review where `review.createdAt >= pr.createdAt`):

$$t_i = \min_{r \in R_{\text{human}}(pr_i),\; r.\text{createdAt} \geq pr_i.\text{createdAt}} r.\text{createdAt} - pr_i.\text{createdAt}$$

| Statistic | Definition |
|---|---|
| `median` | 50th percentile of $\{t_i\}$ |
| `p90` | 90th percentile of $\{t_i\}$ |
| `mean` | $\frac{1}{\|P_g\|}\sum t_i$ |

All three return `null` when $|P_g| = 0$.

##### Survivorship bias mitigation: unreviewedRate

PRs that never received a qualifying human review are excluded from the latency distribution (they have no observed latency). To prevent this survivorship bias from masking the full picture, the following metric is reported alongside latency:

$$\text{unreviewedRate}(g) = \frac{|PR_g| - |P_g|}{|PR_g|}$$

where $P_g$ is the subset of $PR_g$ with at least one qualifying human review.

Returns `null` when $|PR_g| = 0$.

> [!TIP]
>
> **Interpretation**
>
> If `unreviewedRate` is significantly higher for AI-authored PRs than human-only PRs, the latency comparison is incomplete — the "missing" PRs may represent the hardest-to-review work. A high `unreviewedRate` is itself an indicator of review burden (avoidance).

#### changeRequestRate — Per-PR macro average

To avoid a single high-churn PR dominating the group rate (Simpson's paradox), the change-request rate is computed as a **macro average** over PRs, not a micro average over reviews.

For each PR $pr_i \in Q_g$ (PRs with at least one qualifying human review where `review.createdAt >= pr.createdAt`):

$$cr_i = \frac{|\{r \in R_{\text{human}}(pr_i) \mid r.\text{state} = \text{CHANGES\_REQUESTED}\}|}{|R_{\text{human}}(pr_i)|}$$

Then:

| Statistic | Definition |
|---|---|
| `median` | 50th percentile of $\{cr_i\}$ |
| `mean` | $\frac{1}{\|Q_g\|}\sum cr_i$ |

Both return `null` when $|Q_g| = 0$.

> [!TIP]
>
> **Rationale**
>
> The macro average weights each PR equally, regardless of how many reviews it received. This prevents a single PR with 50 `CHANGES_REQUESTED` reviews from inflating the group rate. The median further protects against outlier PRs.

#### reviewRounds — Review iteration distribution

For each PR $pr_i \in Q_g$ (PRs with at least one qualifying human review where `review.createdAt >= pr.createdAt`):

$$rounds_i = \max_{u \in \text{humanReviewers}(pr_i)} |\{r \in R_{\text{human}}(pr_i) \mid r.\text{reviewer} = u\}|$$

| Statistic | Definition |
|---|---|
| `median` | 50th percentile of $\{rounds_i\}$ |
| `p90` | 90th percentile of $\{rounds_i\}$ |
| `mean` | $\frac{1}{\|Q_g\|}\sum rounds_i$ |

All three return `null` when $|Q_g| = 0$.

### Size-stratified analysis

All per-group metrics above are computed **twice**:

1. **Unstratified** — across all PRs in each AI category group.
2. **Stratified by PR size tier** — for each combination of (AI category × size tier), producing a matrix of metrics.

The stratified view controls for the confounding effect of PR size. Comparing AI-authored vs human-only PRs **within the same size tier** isolates the effect of AI involvement from the effect of PR size.

> [!TIP]
>
> **Example**
>
> If AI-authored Large PRs have a median of 3 review rounds while human-only Large PRs have a median of 2, the difference is more likely attributable to AI involvement than to PR size.

Groups with fewer than 3 PRs in a given size tier report `null` for all metrics in that cell to avoid misleading statistics from tiny samples.

### Summary counts

Each group's `prCount` field provides the count of PRs in that group:

| Field | Definition |
|---|---|
| `humanReviewBurden.aiAuthored.prCount` | $\|PR_{\text{ai-authored}}\|$ |
| `humanReviewBurden.aiAssisted.prCount` | $\|PR_{\text{ai-assisted}}\|$ |
| `humanReviewBurden.humanOnly.prCount` | $\|PR_{\text{human-only}}\|$ |

## Data structures

### PullRequestRecord (extended)

```typescript
type AICategory = "ai-authored" | "ai-assisted" | "human-only";

interface PullRequestRecord {
  // ... existing fields ...
  additions: number;
  deletions: number;
  aiCategory: AICategory;
}
```

### AIPatternResult (extended)

```typescript
type PRSizeTier = "S" | "M" | "L" | "Empty";

interface DistributionStats {
  median: number | null;
  p90: number | null;
  mean: number | null;
}

interface HumanReviewBurdenGroup {
  prCount: number;
  humanReviewsPerPR: DistributionStats;
  firstReviewLatencyMs: DistributionStats;
  unreviewedRate: number | null;
  changeRequestRate: {
    median: number | null;
    mean: number | null;
  };
  reviewRounds: DistributionStats;
}

interface HumanReviewBurden {
  aiAuthored: HumanReviewBurdenGroup;
  aiAssisted: HumanReviewBurdenGroup;
  humanOnly: HumanReviewBurdenGroup;
  stratifiedBySize: Record<
    PRSizeTier,
    {
      aiAuthored: HumanReviewBurdenGroup | null;
      aiAssisted: HumanReviewBurdenGroup | null;
      humanOnly: HumanReviewBurdenGroup | null;
    }
  >;
}

interface AIPatternResult {
  // ... existing fields ...
  humanReviewBurden: HumanReviewBurden;
}
```

## Edge cases

| Condition | Behavior |
|---|---|
| No PRs in a group | All metrics for that group return `null`; `prCount` is `0` |
| PR has reviews but all are bot/PENDING/self | Treated as zero human reviews; included in `humanReviewsPerPR` distribution (as 0) but excluded from latency, changeRequestRate, and reviewRounds |
| `review.createdAt < pr.createdAt` | Review excluded from first-review latency calculation only. For `changeRequestRate` and `reviewRounds`, all qualifying human reviews are included regardless of timestamp. A PR whose qualifying human reviews **all** predate `pr.createdAt` is treated as unreviewed for latency, `changeRequestRate`, and `reviewRounds` (it contributes no datapoint to $P_g$ / $Q_g$) |
| Division by zero | Always returns `null`, never `NaN` or `Infinity` |
| AI tool account reviews its own PR | Excluded by self-review rule (reviewer === author) |
| Size tier group has fewer than 3 PRs | Stratified metrics for that cell return `null` |
| PR with `additions === 0 && deletions === 0` | Assigned size tier `Empty` |
| PR author or reviewer is a deleted/unknown user (`ghost` placeholder) | Self-review exclusion is skipped — the review is retained as a qualifying human review. When GraphQL returns `null` for an author, the normalizer substitutes the shared placeholder `ghost`. Without this guard, two unrelated deleted users would collide on the same login and be incorrectly excluded as a self-review. |

## Module boundaries

| Concern | Location |
|---|---|
| AI tool account detection | `src/collect/normalizer.ts` — new `isAIToolAccount()` function |
| AI co-author detection | `src/collect/normalizer.ts` — new `hasAICoAuthor()` function |
| `aiCategory` assignment | `src/collect/normalizer.ts` — within `normalizePullRequests()` |
| PR size tier assignment | `src/analyze/ai-patterns.ts` — helper function |
| Percentile computation | `src/analyze/ai-patterns.ts` — pure helper function |
| Human review burden computation | `src/analyze/ai-patterns.ts` — within `analyzeAIPatterns()` |
| AI co-author patterns (email list) | `src/collect/normalizer.ts` — constant array |
| AI tool account prefixes | `src/collect/normalizer.ts` — constant array |
| GraphQL additions/deletions fields | `src/collect/graphql-queries.ts` — query extension |
