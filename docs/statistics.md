# Statistical Methodology

This document defines the metrics computed by review-insights and their mathematical foundations.

## Observation window

The analysis dataset is a censored snapshot:

- A PR is included when `since <= pr.createdAt <= until`
- For included PRs, reviews with `review.createdAt > until` are excluded
- PR merge/close state is evaluated as of `until`; a PR merged or closed after `until` is treated as still open
- Current-snapshot commit and PR size fields (`commitMessages`, `additions`, `deletions`) are treated as unobserved for PRs not merged at `until`; commit-trailer-dependent `aiCategory` is also unobserved for those PRs. `ai-authored` is retained because it is determined from the PR author, not from mutable commit metadata.

This makes historical reruns stable instead of letting later review activity or later pushes leak into an older window.

## Per-user statistics

Source: `per-user-stats.ts`

### reviewsGiven

Number of **unique PRs** a user reviewed (not total review submissions). If a reviewer submits multiple reviews on the same PR, it counts as 1.

$$\text{reviewsGiven}(u) = |\{pr \mid \exists\, r \in pr.\text{reviews},\; r.\text{reviewer} = u\}|$$

### topReviewers / maxReviewsGiven

The active reviewer population is the subset of users with at least one qualifying reviewed PR:

$$R = \{u \mid \text{reviewsGiven}(u) > 0\}$$

The top-reviewer statistic is defined as the full argmax set rather than a single login:

$$T = \{u \in R \mid \text{reviewsGiven}(u) = \max_{v \in R} \text{reviewsGiven}(v)\}$$

and

$$\text{maxReviewsGiven} = \max_{v \in R} \text{reviewsGiven}(v)$$

If $R = \emptyset$, then `topReviewers = []` and `maxReviewsGiven = null`.

For deterministic serialization, `topReviewers` is sorted in ascending code-unit order of the login strings.

### reviewsReceived

Total review submissions received across all PRs authored by a user. Multiple reviews on the same PR each count separately.

$$\text{reviewsReceived}(u) = \sum_{pr \in \text{PRs}(u)} |\{r \in pr.\text{reviews} \mid r.\text{reviewer} \neq u\}|$$

### approvals, changeRequests, comments, dismissed

Count of review submissions by state for each reviewer. These are per-submission counts (not per-PR), so:

$$\text{approvals}(u) + \text{changeRequests}(u) + \text{comments}(u) + \text{dismissed}(u) \geq \text{reviewsGiven}(u)$$

The inequality holds because the left side counts every submission while the right counts unique PRs.

### avgTimeToFirstReview

For each PR authored by a user, the time from PR creation to the earliest qualifying review. Averaged across all PRs that received at least one review.

$$\text{avgTimeToFirstReview}(u) = \frac{1}{|P_u|} \sum_{pr \in P_u} (\min_{r \in pr.\text{reviews}} r.\text{createdAt} - pr.\text{createdAt})$$

where $P_u$ is the set of PRs authored by $u$ that have at least one qualifying review with `createdAt >= pr.createdAt`.

### medianTimeToFirstReview

The median of the same per-PR first-review latencies used by `avgTimeToFirstReview`. The median is more robust to outliers (e.g., a single PR left unreviewed for days) and better represents the typical review experience.

For an even number of PRs, the median is the arithmetic mean of the two middle values. Returns `null` when the user has no PRs with a qualifying first review.

## Bias detection

Source: `bias-detector.ts`

### Review matrix

A matrix $M$ where $M[reviewer][author]$ is the count of review submissions from reviewer to author. Every qualifying review submission is counted (not unique PRs), capturing the full frequency of interactions.

### Quasi-independence expected counts

Bias detection conditions on both reviewer activity and author activity.

Let:

- $R$ = reviewers with at least one qualifying review submission
- $A^+$ = authors with at least one qualifying received review submission
- $S = \{(i, j) \in R \times A^+ \mid M_{ij} > 0\}$, the observed reviewer-author interaction support

Explicit zero-valued matrix entries are treated as absent support and do not enter $R$, $A^+$, or $S$. Negative matrix entries are invalid because review-submission counts cannot be negative.

The detector fits a quasi-independence model on $S$:

$$E_{ij} = \alpha_i \beta_j \quad \text{for } (i, j) \in S$$

with row and column margins matched to the observed review matrix:

$$\sum_{j:(i,j)\in S} E_{ij} = \sum_{j:(i,j)\in S} M_{ij}$$

$$\sum_{i:(i,j)\in S} E_{ij} = \sum_{i:(i,j)\in S} M_{ij}$$

The parameters $\alpha_i, \beta_j$ are solved by iterative proportional fitting (IPF). Self-reviews are removed before the review matrix is built, so they never enter $S$.

Convergence is checked on the fitted row and column margins using the maximum relative margin error:

$$\max \left(
\max_i \frac{\left|\sum_{j:(i,j)\in S} E_{ij} - \sum_{j:(i,j)\in S} M_{ij}\right|}{\max\left(1,\sum_{j:(i,j)\in S} M_{ij}\right)},
\max_j \frac{\left|\sum_{i:(i,j)\in S} E_{ij} - \sum_{i:(i,j)\in S} M_{ij}\right|}{\max\left(1,\sum_{i:(i,j)\in S} M_{ij}\right)}
\right) < 10^{-8}$$

with a hard cap of 10,000 IPF iterations.

This means a high-volume reviewer paired with a high-volume author is compared against its activity-adjusted expected count $E_{ij}$ instead of against a global mean of populated cells. Unobserved reviewer-author pairs do not enter this model because the dataset does not record the full review-assignment opportunity graph.

### Pearson residual

For each observed reviewer-author pair, the detector computes the Pearson residual:

$$r_{ij} = \frac{M_{ij} - E_{ij}}{\sqrt{E_{ij}}}$$

A pair is flagged when both of the following hold:

- $M_{ij} > E_{ij}$
- $r_{ij} > t$, where $t$ is the `bias-threshold` input (default: 2.0)

The output for each flagged pair includes:

- `count = M_{ij}`
- `expectedCount = E_{ij}`
- `pearsonResidual = r_{ij}`

If the quasi-independence model cannot be fit numerically, no reviewer-author pair is flagged. In that case the reports surface bias warnings as unavailable rather than claiming that no pair exceeded the threshold. The review matrix and Gini coefficient are still reported because they do not depend on the fitted model.

> [!NOTE]
>
> **Interpretation**
>
> The Pearson residual is a model diagnostic, not a multiplicity-adjusted significance test.
>
> It answers "how much larger was the observed cell than the activity-adjusted expectation?" rather than "what is the family-wise false positive rate across all pairs?".
>

### Gini coefficient

Measures inequality of review distribution. Computed from the sorted array of all matrix cell values $x_1 \leq x_2 \leq \cdots \leq x_n$:

$$G = \frac{2 \sum_{i=1}^{n} i \cdot x_i}{n \sum_{i=1}^{n} x_i} - \frac{n+1}{n}$$

- $G = 0$: perfectly equal distribution (every pair has the same review count)
- $G \to 1$: maximally unequal (all reviews concentrated in one pair)

> [!NOTE]
>
> **Note on structural zeros**
>
> The Pearson residual detector and Gini coefficient use **different** matrix domains, because they answer different questions:
>
> **Pearson residual detector (active interaction submatrix)**
>
> The quasi-independence model is fit over the observed interaction support:
>
> - rows are reviewers with at least one qualifying review
> - columns are authors with at least one qualifying received review
> - only reviewer-author pairs with at least one observed qualifying review enter the fitted support
> - explicit zero-valued cells are treated the same as absent pairs and do not enter the fitted support
> - unobserved reviewer-author pairs are excluded because the dataset does not record whether they were genuine review opportunities
>
> Authors whose PRs received zero qualifying reviews do not enter this model because their column margin is zero and they cannot contribute to a positive flag.
>
> **Gini coefficient (full matrix including zeros)**
>
> The Gini coefficient is computed over the **full** reviewer-author matrix, including zero cells. The total number of cells is $|R| \times |A| - |D|$, where:
>
> - $R$ = the set of users who submitted at least one qualifying review (i.e., the row keys of the review matrix)
> - $A$ = the set of all PR authors in the filtered PR set, **including authors whose PRs received zero qualifying reviews**
> - $D = \{u \in R \cap A \mid u \ne \texttt{ghost}\}$, the set of genuine identity overlaps whose diagonal cells are excluded as self-reviews
>
> Zero cells represent pairs that *could* interact but did not — this absence of interaction is essential for measuring inequality. Without zeros, a reviewer who reviews only one author would yield $G = 0$ (single data point), masking extreme concentration. The implementation avoids materializing the zero-padded array; only non-zero values are sorted, with rank indices offset by the implicit zero count.

> For the shared `ghost` placeholder, the diagonal is retained instead of being subtracted from the Gini matrix domain. `ghost -> ghost` may represent two different deleted accounts that GitHub exposed as `null`, so treating it as a guaranteed self-review would bias the denominator downward.

## Merge correlation

Source: `merge-correlation.ts`

### avgReviewsBeforeMerge

For each author, the average number of qualifying review submissions on their merged PRs.

$$\text{avgReviewsBeforeMerge}(u) = \frac{\sum_{pr \in M_u} |pr.\text{reviews}|}{|M_u|}$$

where $M_u$ is the set of PRs authored by $u$ that were merged on or before `until`, and reviews are filtered by the same bot/PENDING/self-review rules and must satisfy `review.createdAt <= pr.mergedAt`.

If $|M_u| = 0$, this metric is undefined and is represented as `null` in machine-readable outputs and `N/A` in the HTML report.

### medianReviewsBeforeMerge

The median of per-PR review counts across merged PRs for each author. Like `medianTimeToFirstReview`, this is more robust to outliers (e.g., a single PR with an unusually high number of review submissions) and better represents the typical merge experience.

For an even number of merged PRs, the median is the arithmetic mean of the two middle values. Returns `null` when the author has no merged PRs.

### zeroReviewMerges

Count of merged PRs by an author that had zero qualifying reviews.

$$\text{zeroReviewMerges}(u) = |\{pr \in M_u \mid |\{r \in pr.\text{reviews} \mid r.\text{createdAt} \le pr.\text{mergedAt}\}| = 0\}|$$

## AI / Bot patterns

Source: `ai-patterns.ts`

This module splits into two populations:

- Bot observability metrics (`botReviewers`, `botReviewPercentage`, `aiCoAuthoredPRs`, `totalPRs`) ignore `include-bots` and operate on the full unfiltered dataset. `aiCoAuthoredPRs` only counts PRs with observable commit metadata, so it remains a lower-bound estimate when commit metadata is censored by the observation window.
- `humanReviewBurden` uses a comparison cohort that excludes traditional bot-authored PRs (`authorIsBot === true`) and PRs whose `aiCategory` is unobservable at the cutoff, regardless of `include-bots`.

### botReviewPercentage

$$\text{botReviewPercentage} = \frac{\sum_{b \in \text{bots}} \text{reviewCount}(b)}{\text{totalReviews}} \times 100$$

where totalReviews includes all reviews (including PENDING and bot reviews) across all PRs.

> [!NOTE]
>
> **Note on PENDING review counting**
>
> This module intentionally counts PENDING reviews in `totalReviews`, unlike `per-user-stats.ts`, `bias-detector.ts`, and `merge-correlation.ts` which exclude them. The purpose of this module is to observe the full scope of bot activity, and PENDING bot reviews (e.g., automated checks in progress) are part of that picture. As a result, `botReviewPercentage` has a different denominator than metrics in other modules — direct cross-module comparison of review counts should account for this difference.

### aiCoAuthoredPRs

Count of PRs where any observable commit message contains an AI co-author trailer as defined in [ai-human-review-burden.md](ai-human-review-burden.md#ai-co-author-detection). Only the last commit per PR is inspected (GraphQL limitation), and PRs with observation-window-censored commit metadata are not counted, so this is a lower-bound estimate.

### Human review burden (per AI category)

`reviewRounds` counts distinct reviewed revisions per PR from qualifying human reviews observed at or after PR creation, using the commit SHA attached to each review. PRs are excluded from this metric when an observed review is missing a commit SHA or when the per-PR review list is truncated.


See [ai-human-review-burden.md](ai-human-review-burden.md) for the full specification of PR classification (`ai-authored` / `ai-assisted` / `human-only`) and per-group human review burden metrics (`humanReviewsPerPR`, `firstReviewLatencyMs`, `unreviewedRate`, `changeRequestRate`, `reviewRounds`) — each reported as distribution statistics (median, p90, mean) rather than a single average. These metrics are computed only on the comparison cohort of non-traditional-bot PRs whose AI category is observable at the cutoff.

## HTML report KPIs

Source: `html-report.ts`

| KPI | Definition |
|---|---|
| Pull Requests | `filteredPRs.length` - total PRs after author bot filtering |
| Unique PR Reviews | $\sum_u \text{reviewsGiven}(u)$ - sum of unique PRs reviewed per user from `userStats`; uses the per-user qualifying-review filters. When `include-bots` is `false`, bot-authored PRs are skipped entirely and bot reviewer reviews are excluded. PENDING reviews are always excluded; self-reviews are excluded when both identities are known, with the shared `ghost`/`UNKNOWN_USER` placeholder exempt. |
| Active Reviewers | Count of users in `userStats` with `reviewsGiven > 0`; uses the same qualifying-review filters as Unique PR Reviews |
| PR Authors | Count of distinct `pr.author` values in `filteredPRs`, after author bot filtering |
| Avg Reviewers/PR | Unique PR Reviews $\div$ Pull Requests; numerator is `userStats`-derived, denominator is `filteredPRs`-derived |
| Gini Coefficient | From bias detection; uses the `bias-detector` qualifying-review filters |
| Data Completeness | Collection completeness label, not a post-filtering count |

## HTML report: Reviewer Ranking card

Source: `html-report.ts`

This card reports a descriptive ranking over the observed active reviewer population. It does **not** perform hypothesis testing or claim inferential significance.

| Field | Definition |
|---|---|
| Top reviewers | `topReviewers` - the full argmax set of `reviewsGiven` over users with `reviewsGiven > 0` |
| Max reviews given | `maxReviewsGiven` - the maximum `reviewsGiven` among active reviewers |
| Active reviewer population | `reviewerCount` - number of users with `reviewsGiven > 0` |
| Tie size | $\|topReviewers\|$ and its share of the active reviewer population |

The `Reviews Given` bar chart in the HTML report is also restricted to the active reviewer population so the visual ranking does not include zero-review authors.

## HTML report: Human Review Burden section

Source: `burden-chart.ts`, rendered in `html-report.ts`

This section visualizes the human review burden metrics from [ai-human-review-burden.md](ai-human-review-burden.md). It appears after the AI & Bot Patterns card.

Traditional bot-authored PRs and PRs whose AI classification is unobservable at the cutoff are excluded from this comparison section even when `include-bots` is `true`. The report notes those excluded counts when present. Size-stratified cells also exclude PRs whose size at the cutoff is unobservable.

### Components

| Component | Content |
|---|---|
| PR count cards | Sample size (n) and percentage for each AI category (ai-authored, ai-assisted, human-only) |
| Grouped bar charts | One chart per metric — bars show **median**, whisker lines extend to **p90** (where available). Metrics: Reviews/PR, Time to 1st Review, Change Request Rate (median-only, no p90 — see [rationale](ai-human-review-burden.md#changerequestrate--per-pr-macro-average)), Review Rounds |
| Detailed metrics table | Median and p90 columns per category, plus Unreviewed Rate (highlighted in red when > 20%) |
| Size-stratified table | Median values per (AI category × size tier) cell, with sample sizes. Cells with < 3 PRs show "—" |

### Design rationale

- **Median over mean** — Review counts and latencies follow right-skewed distributions. The median represents typical burden; the mean is inflated by outliers.
- **P90 whiskers** — Show worst-case burden without requiring box plots.
- **Sample sizes everywhere** — Small-n comparisons are misleading; displaying n= lets readers judge statistical reliability.
- **Unreviewed Rate alongside latency** — Latency is only computed for PRs that received reviews. A high unreviewed rate means the latency metric suffers from survivorship bias.
- **Size stratification** — PR size can confound review burden. The table compares categories within the same coarse size tier (S/M/L/Empty), which avoids direct cross-tier comparisons but does not isolate AI causality or adjust for other confounders.
