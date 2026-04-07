# AI Involvement and Human Review Burden

This document specifies a descriptive analysis of how human review workload differs across AI-involvement categories. The module quantifies review burden metrics for AI-involved PRs and human-only PRs; it does not estimate causal impact.

The comparison cohort excludes **traditional bot-authored PRs** (`authorIsBot === true`) and PRs whose AI classification is not observable at the analysis cutoff. Those PRs remain visible in top-level bot observability metrics, but they are not part of the AI-vs-human burden comparison because they are either not human-authored/AI-authored coding-agent work or cannot be classified without using future commit metadata.

## PR classification

During normalization, every pull request is initially classified into exactly one of three mutually exclusive groups and stored as `aiCategory` on the `PullRequestRecord`. Historical snapshot censoring may later set `aiCategory` to `null` when commit-trailer-dependent classification is not observable at `until`.

| Group | Label | Condition (evaluated in order) |
|---|---|---|
| AI-authored | `ai-authored` | PR author is an AI tool account |
| AI-assisted | `ai-assisted` | PR author is human, but at least one commit contains an AI co-author trailer |
| Human-only | `human-only` | Neither of the above |

A PR that is both AI-authored and has AI co-author trailers is classified as `ai-authored` (the first matching rule wins).

For `humanReviewBurden`, the grouped comparison is computed only on PRs with `authorIsBot === false`. Traditional bot-authored PRs may still carry `aiCategory === "human-only"` on the normalized record, but they are excluded before burden metrics are grouped.

After `applyObservationWindow()` censors a historical snapshot, `aiCategory` may be `null` for PRs that were not merged at `until` and whose classification would depend on current commit trailers. Those PRs are also excluded from `humanReviewBurden`. `ai-authored` remains observable for unmerged-at-cutoff PRs because it is determined from the PR author, not from mutable commit metadata.

### AI tool account detection

An account is an AI tool account if its login matches any of the following **prefix** patterns (case-insensitive):

| Prefix | Tool |
|---|---|
| `openclaw-` | OpenClaw (Claude, Codex, etc.) |
| `devin-ai-integration` | Devin AI |
| `copilot-swe-agent` | GitHub Copilot coding agent |

AI tool accounts are **distinct from bots**. Even when an AI tool account's login matches bot detection patterns (e.g., `devin-ai-integration[bot]` has the `[bot]` suffix), the AI tool account classification takes precedence. A PR authored by an AI tool account has `authorIsBot === false` but `aiCategory === "ai-authored"`.

> [!IMPORTANT]
>
> **Precedence rule**
>
> `isAIToolAccount()` is evaluated before `isBot()`. If a login matches both, the account is treated as an AI tool account, not a bot.

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

Detection is applied to **all observable commit messages** in `PullRequestRecord.commitMessages`. Note that the GraphQL query currently fetches only the last commit per PR (`commits(last: 1)`), so this remains a **lower-bound estimate**. For PRs not merged at a historical `until`, commit messages are treated as unobserved (`null`) because GitHub exposes them as current-snapshot metadata, not a historical as-of commit list.

### Interaction with `include-bots`

The `include-bots` flag controls traditional bot filtering only. AI classification is **independent** of `include-bots`:

| `include-bots` | Traditional bots (Dependabot, etc.) | AI tool accounts (OpenClaw) | AI-assisted PRs |
|---|---|---|---|
| `false` | Excluded from per-user-stats, bias, merge-correlation, and `humanReviewBurden` | **Included** (not bots) | Included when AI classification is observable |
| `true` | Included in per-user-stats, bias, and merge-correlation; still excluded from `humanReviewBurden` | Included | Included when AI classification is observable |

Within `ai-patterns`, the split is intentional:

- Bot observability metrics (`botReviewers`, `botReviewPercentage`, `aiCoAuthoredPRs`, `totalPRs`) ignore `include-bots` and operate on the full dataset; `aiCoAuthoredPRs` only counts PRs with observable commit metadata.
- `humanReviewBurden` always excludes traditional bot-authored PRs and PRs whose AI classification is not observable at the cutoff from the comparison cohort, regardless of `include-bots`.

## PR size data

### GraphQL extension

The GraphQL query is extended to fetch both PR size fields and the commit SHA associated with each review submission:

```graphql
additions
deletions
reviews(first: $maxReviews) {
  pageInfo {
    hasNextPage
  }
  nodes {
    commit {
      oid
    }
  }
}
```

These are stored on normalized records as:

- `PullRequestRecord.additions`
- `PullRequestRecord.deletions`
- `ReviewRecord.commitOid`

After the observation window is applied, `additions` and `deletions` may be `null` for PRs that were not merged at `until`, because the fetched GraphQL values describe the current PR diff and can include later pushes.

### PR size tiers

Each PR is assigned a size tier based on total changed lines (`additions + deletions`):

| Tier | Label | Range |
|---|---|---|
| Small | `S` | 1–50 lines |
| Medium | `M` | 51–300 lines |
| Large | `L` | 301+ lines |
| Empty | `Empty` | 0 lines (no changes) |

Size tiers are used for stratified analysis to show review burden within coarse PR-size groups. This avoids direct comparisons across different observed size tiers, but it is not a causal adjustment and does not control for within-tier size variation or other confounders. PRs with `additions === null` or `deletions === null` are excluded from size-stratified cells, but they can still contribute to unstratified burden metrics when their AI category is observable.

## Human review burden metrics

Source: `ai-patterns.ts` (extended)

All metrics below are computed over **human reviews only** — reviews where `reviewerIsBot === false` and `state !== "PENDING"` and reviewer is not the PR author (self-review exclusion).

### Qualifying human reviews

For a given PR, the set of qualifying human reviews is:

$$R_{\text{human}}(pr) = \{r \in pr.\text{reviews} \mid \neg r.\text{reviewerIsBot} \land r.\text{state} \neq \text{PENDING} \land r.\text{reviewer} \neq pr.\text{author}\}$$

This definition is used consistently across all metrics below.

### Per-group metrics

Let the comparison cohort be:

$$C = \{pr \mid \neg pr.\text{authorIsBot} \land pr.\text{aiCategory} \ne \text{null}\}$$

For each group $g \in \{\text{ai-authored},\; \text{ai-assisted},\; \text{human-only}\}$, let $PR_g$ be the set of PRs in group $g$ within that cohort:

$$PR_g = \{pr \in C \mid pr.\text{aiCategory} = g\}$$

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
> Review counts follow a right-skewed distribution. The median captures typical burden, p90 captures upper-tail burden at the 90th percentile (not the maximum), and the mean is provided for backward compatibility but should not be used alone for comparison.

#### Percentile computation

For a sorted array $x_1 \leq x_2 \leq \cdots \leq x_n$ and a percentile $p \in [0, 100]$:

1. Compute the rank: $r = \frac{p}{100} \times (n - 1)$
2. Let $\lfloor r \rfloor = k$ and the fractional part $f = r - k$
3. If $k + 1 < n$, result: $x_{k+1} + f \times (x_{k+2} - x_{k+1})$; otherwise result: $x_n$ (the $p = 100$ boundary)

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
> If `unreviewedRate` is higher for AI-authored PRs than human-only PRs, the latency comparison is incomplete: the "missing" PRs may represent harder-to-review work. Treat `unreviewedRate` as a companion descriptive metric, not as proof of review avoidance.

#### changeRequestRate — Per-PR macro average

To avoid a single high-churn PR dominating the group rate (Simpson's paradox), the change-request rate is computed as a **macro average** over PRs, not a micro average over reviews.

For each PR $pr_i \in Q_g$ (PRs with at least one qualifying human review where `review.createdAt >= pr.createdAt`):

$$cr_i = \frac{|\{r \in R_{\text{human}}(pr_i) \mid r.\text{state} = \text{CHANGES}\_\text{REQUESTED}\}|}{|R_{\text{human}}(pr_i)|}$$

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

For each PR $pr_i \in Q_g$ (PRs with at least one qualifying human review where `review.createdAt >= pr.createdAt`), define the observed post-creation review set:

$$R_{\text{obs}}(pr_i) = \{r \in R_{\text{human}}(pr_i) \mid r.\text{createdAt} \ge pr_i.\text{createdAt}\}$$

Let $Q_g^{\text{round}} \subseteq Q_g$ be the subset of PRs whose observed post-creation human reviews all have non-null `commitOid` values and whose per-PR review list was not truncated.

Each submitted review is linked by GitHub to the commit SHA it reviewed (`review.commit.oid`). A review round is the set of qualifying human reviews attached to the same reviewed revision. For each $pr_i \in Q_g^{\text{round}}$:

$$rounds_i = \left|\{r.\text{commitOid} \mid r \in R_{\text{obs}}(pr_i)\}\right|$$

where the set contains only distinct commit SHAs.

Interpretation:

- Multiple reviewers commenting on the same reviewed revision count as **one** round.
- Re-reviews after the author updates the PR head count as a **new** round when they reference a new commit SHA.
- Multiple submissions from the same reviewer on the same reviewed revision still count as **one** round.

| Statistic | Definition |
|---|---|
| `median` | 50th percentile of $\{rounds_i \mid pr_i \in Q_g^{\text{round}}\}$ |
| `p90` | 90th percentile of $\{rounds_i \mid pr_i \in Q_g^{\text{round}}\}$ |
| `mean` | $\frac{1}{\|Q_g^{\text{round}}\|}\sum_{pr_i \in Q_g^{\text{round}}} rounds_i$ |

All three return `null` when no PR in the group has an observable round count.

> [!TIP]
>
> **Rationale**
>
> This definition measures review iteration at the PR revision level rather than at the reviewer level. It matches the quantity of interest: how many distinct code states required human re-review.

### Size-stratified analysis

All per-group metrics above are computed **twice**:

1. **Unstratified** — across all PRs in each AI category group.
2. **Stratified by PR size tier** — for each combination of (AI category × size tier), producing a matrix of metrics.

The stratified view reports descriptive metrics within each observed PR size tier. Comparing AI-authored vs human-only PRs **within the same size tier** reduces variation due to the coarse size tier being displayed, but it does not isolate the causal effect of AI involvement or adjust for within-tier size differences, project, author, reviewer, timing, complexity, or other confounders. PRs whose size is unobservable at the cutoff are omitted from the stratified cells because assigning them to a size tier would use future data.

> [!TIP]
>
> **Example**
>
> If AI-authored Large PRs have a median `reviewRounds` of 3 while human-only Large PRs have a median of 2, the table shows a within-Large-tier association. It should not be interpreted as evidence that AI involvement caused the difference without additional causal modeling or statistical testing.

Groups with fewer than 3 PRs in a given size tier report `null` for all metrics in that cell to avoid misleading statistics from tiny samples.

### Summary counts

Each group's `prCount` field provides the count of comparison-eligible PRs in that group:

| Field | Definition |
|---|---|
| `humanReviewBurden.aiAuthored.prCount` | $\|PR_{\text{ai-authored}}\|$ |
| `humanReviewBurden.aiAssisted.prCount` | $\|PR_{\text{ai-assisted}}\|$ |
| `humanReviewBurden.humanOnly.prCount` | $\|PR_{\text{human-only}}\|$ |

## Data structures

### PullRequestRecord (extended)

```typescript
type AICategory = "ai-authored" | "ai-assisted" | "human-only";

interface ReviewRecord {
  // ... existing fields ...
  commitOid: string | null;
}

interface PullRequestRecord {
  // ... existing fields ...
  commitMessages: string[] | null;
  additions: number | null;
  deletions: number | null;
  aiCategory: AICategory | null;
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
| PR author is a traditional bot | Excluded from `humanReviewBurden` entirely, regardless of `include-bots` |
| `aiCategory === null` | Excluded from `humanReviewBurden`, because the AI classification is not observable at the cutoff |
| PR has reviews but all are bot/PENDING/self | Treated as zero human reviews; included in `humanReviewsPerPR` distribution (as 0) but excluded from latency, changeRequestRate, and reviewRounds |
| `review.createdAt < pr.createdAt` | Review excluded from first-review latency and `reviewRounds`. A PR whose qualifying human reviews **all** predate `pr.createdAt` is treated as unreviewed for latency, `changeRequestRate`, and `reviewRounds` (it contributes no datapoint to $P_g$ / $Q_g$) |
| Any qualifying post-creation human review has `commitOid === null` | The PR is excluded from `reviewRounds` only, because the reviewed revision cannot be identified exactly |
| GitHub reports additional review pages beyond the first fetched review page | The PR is excluded from `reviewRounds` only, because the observed review set is truncated |
| Division by zero | Always returns `null`, never `NaN` or `Infinity` |
| AI tool account reviews its own PR | Excluded by self-review rule (reviewer === author) |
| Size tier group has fewer than 3 PRs | Stratified metrics for that cell return `null` |
| `additions === null` or `deletions === null` | Excluded from size-stratified cells, because the PR size tier is not observable at the cutoff |
| PR with `additions === 0 && deletions === 0` | Assigned size tier `Empty` |
| PR author or reviewer is a deleted/unknown user (`ghost` placeholder) | Self-review exclusion is skipped — the review is retained as a qualifying human review. When GraphQL returns `null` for an author, the normalizer substitutes the shared placeholder `ghost`. Without this guard, two unrelated deleted users would collide on the same login and be incorrectly excluded as a self-review. |

## Module boundaries

| Concern | Location |
|---|---|
| AI tool account detection | `src/collect/normalizer.ts` — new `isAIToolAccount()` function |
| AI co-author detection | `src/collect/normalizer.ts` — new `hasAICoAuthor()` function |
| `aiCategory` assignment | `src/collect/normalizer.ts` — within `normalizePullRequests()` |
| Historical AI/size metadata censoring | `src/collect/observation-window.ts` — within `applyObservationWindow()` |
| AI co-authored PR counting | `src/analyze/ai-patterns.ts` — within `analyzeAIPatterns()` via `hasAICoAuthor()` |
| PR size tier assignment | `src/analyze/ai-patterns.ts` — helper function |
| Percentile computation | `src/analyze/ai-patterns.ts` — pure helper function |
| Human review burden computation | `src/analyze/ai-patterns.ts` — within `analyzeAIPatterns()` |
| Review round commit SHA extraction | `src/collect/graphql-queries.ts` / `src/collect/normalizer.ts` — `reviews.nodes.commit.oid` to `ReviewRecord.commitOid` |
| AI co-author patterns (email list) | `src/collect/normalizer.ts` — constant array |
| AI tool account prefixes | `src/collect/normalizer.ts` — constant array |
| GraphQL additions/deletions + review commit SHA fields | `src/collect/graphql-queries.ts` — query extension |
