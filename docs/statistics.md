# Statistical Methodology

This document defines the metrics computed by review-insights and their mathematical foundations.

## Observation window

The analysis dataset is a censored snapshot:

- A PR is included when `since <= pr.createdAt <= until`
- For included PRs, reviews with `review.createdAt > until` are excluded
- PR merge/close state is evaluated as of `until`; a PR merged or closed after `until` is treated as still open

This makes historical reruns stable instead of letting later review activity leak into an older window.

## Per-user statistics

Source: `per-user-stats.ts`

### reviewsGiven

Number of **unique PRs** a user reviewed (not total review submissions). If a reviewer submits multiple reviews on the same PR, it counts as 1.

$$\text{reviewsGiven}(u) = |\{pr \mid \exists\, r \in pr.\text{reviews},\; r.\text{reviewer} = u\}|$$

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

### Z-Score

For each reviewer-author pair, the z-score measures how many standard deviations the pair's count is above the population mean.

$$z_{ij} = \frac{M_{ij} - \mu}{\sigma}$$

where:

- $\mu = \frac{1}{n} \sum_{ij} M_{ij}$ (mean across all non-zero cells)
- $\sigma = \sqrt{\frac{1}{n} \sum_{ij} (M_{ij} - \mu)^2}$ (population standard deviation)
- $n$ = number of non-zero (populated) reviewer-author pairs in the matrix

A pair is flagged when $M_{ij} > \mu + t \cdot \sigma$, where $t$ is the `bias-threshold` input (default: 2.0).

Note: the population standard deviation ($\div n$) is used, not the sample standard deviation ($\div (n-1)$). This is appropriate because the matrix represents the complete observed review population within the analysis window, not a sample drawn from a larger population.

> [!NOTE]
>
> **Limitation: normality assumption**
>
> The z-score threshold ($\mu + t \cdot \sigma$) implicitly assumes that review counts are approximately normally distributed. In practice, review counts follow a right-skewed distribution (closer to Poisson or negative binomial): most pairs interact infrequently, while a few pairs interact heavily. Under right-skewed distributions, the standard deviation $\sigma$ is inflated by the long right tail, causing the flagging threshold to be higher than intended and increasing the false-negative rate.
>
> This is a known trade-off. The z-score approach is retained as a simple, interpretable heuristic that works reasonably well for the purpose of surfacing the most extreme outliers. For teams requiring more rigorous detection, potential improvements include:
>
> - **Log-transformation** — applying $\ln(M_{ij} + 1)$ before computing z-scores to compress the right tail
> - **Non-parametric methods** — Tukey's fences ($Q_3 + 1.5 \cdot \text{IQR}$), which make no distributional assumption
> - **Count-based models** — fitting a Poisson or negative binomial model and flagging pairs exceeding expected counts

### Gini coefficient

Measures inequality of review distribution. Computed from the sorted array of all matrix cell values $x_1 \leq x_2 \leq \cdots \leq x_n$:

$$G = \frac{2 \sum_{i=1}^{n} i \cdot x_i}{n \sum_{i=1}^{n} x_i} - \frac{n+1}{n}$$

- $G = 0$: perfectly equal distribution (every pair has the same review count)
- $G \to 1$: maximally unequal (all reviews concentrated in one pair)

> [!NOTE]
>
> **Note on structural zeros**
>
> The z-score and Gini coefficient use **different** treatments of zero cells in the review matrix, because they measure different things:
>
> **Z-score (non-zero cells only)**
>
> The z-score statistics ($\mu$, $\sigma$) are computed exclusively over populated (non-zero) cells. In sparse matrices (typical for real teams), including structural zeros would drive the mean close to zero and inflate standard deviations, causing nearly every active pair to appear as an outlier. The populated-cells-only approach avoids this false-positive noise and focuses on detecting skew *among pairs that actually interact*. If only one pair exists, $\sigma = 0$ and no pairs are flagged.
>
> **Gini coefficient (full matrix including zeros)**
>
> The Gini coefficient is computed over the **full** reviewer-author matrix, including zero cells. The total number of cells is $|R| \times |A| - |R \cap A|$, where:
>
> - $R$ = the set of users who submitted at least one qualifying review (i.e., the row keys of the review matrix)
> - $A$ = the set of all PR authors in the filtered PR set, **including authors whose PRs received zero qualifying reviews**
> - $R \cap A$ excludes self-review diagonal entries (a user who is both reviewer and author)
>
> Zero cells represent pairs that *could* interact but did not — this absence of interaction is essential for measuring inequality. Without zeros, a reviewer who reviews only one author would yield $G = 0$ (single data point), masking extreme concentration. The implementation avoids materializing the zero-padded array; only non-zero values are sorted, with rank indices offset by the implicit zero count.

## Merge correlation

Source: `merge-correlation.ts`

### avgReviewsBeforeMerge

For each author, the average number of qualifying review submissions on their merged PRs.

$$\text{avgReviewsBeforeMerge}(u) = \frac{\sum_{pr \in M_u} |pr.\text{reviews}|}{|M_u|}$$

where $M_u$ is the set of PRs authored by $u$ that were merged on or before `until`, and reviews are filtered by the same bot/PENDING/self-review rules and must satisfy `review.createdAt <= pr.mergedAt`.

### medianReviewsBeforeMerge

The median of per-PR review counts across merged PRs for each author. Like `medianTimeToFirstReview`, this is more robust to outliers (e.g., a single PR with an unusually high number of review rounds) and better represents the typical merge experience.

For an even number of merged PRs, the median is the arithmetic mean of the two middle values. Returns `null` when the author has no merged PRs.

### zeroReviewMerges

Count of merged PRs by an author that had zero qualifying reviews.

$$\text{zeroReviewMerges}(u) = |\{pr \in M_u \mid |\{r \in pr.\text{reviews} \mid r.\text{createdAt} \le pr.\text{mergedAt}\}| = 0\}|$$

## AI / Bot patterns

Source: `ai-patterns.ts`

This module splits into two populations:

- Bot observability metrics (`botReviewers`, `botReviewPercentage`, `aiCoAuthoredPRs`, `totalPRs`) ignore `include-bots` and operate on the full unfiltered dataset.
- `humanReviewBurden` uses a comparison cohort that excludes traditional bot-authored PRs (`authorIsBot === true`) regardless of `include-bots`.

### botReviewPercentage

$$\text{botReviewPercentage} = \frac{\sum_{b \in \text{bots}} \text{reviewCount}(b)}{\text{totalReviews}} \times 100$$

where totalReviews includes all reviews (including PENDING and bot reviews) across all PRs.

> [!NOTE]
>
> **Note on PENDING review counting**
>
> This module intentionally counts PENDING reviews in `totalReviews`, unlike `per-user-stats.ts`, `bias-detector.ts`, and `merge-correlation.ts` which exclude them. The purpose of this module is to observe the full scope of bot activity, and PENDING bot reviews (e.g., automated checks in progress) are part of that picture. As a result, `botReviewPercentage` has a different denominator than metrics in other modules — direct cross-module comparison of review counts should account for this difference.

### aiCoAuthoredPRs

Count of PRs where any commit message contains an AI co-author trailer as defined in [ai-human-review-burden.md](ai-human-review-burden.md#ai-co-author-detection). Only the last commit per PR is inspected (GraphQL limitation), so this is a lower-bound estimate.

### Human review burden (per AI category)

See [ai-human-review-burden.md](ai-human-review-burden.md) for the full specification of PR classification (`ai-authored` / `ai-assisted` / `human-only`) and per-group human review burden metrics (`humanReviewsPerPR`, `firstReviewLatencyMs`, `unreviewedRate`, `changeRequestRate`, `reviewRounds`) — each reported as distribution statistics (median, p90, mean) rather than a single average. These metrics are computed only on the comparison cohort of non-traditional-bot PRs.

## HTML report KPIs

Source: `html-report.ts`

| KPI | Definition |
|---|---|
| Pull Requests | `filteredPRs.length` — total PRs after bot filtering |
| Unique PR Reviews | $\sum_u \text{reviewsGiven}(u)$ — sum of unique PRs reviewed per user (double-counts PRs reviewed by multiple people) |
| Active Reviewers | Count of users with `reviewsGiven > 0` |
| PR Authors | Count of distinct `pr.author` values in filtered PRs |
| Avg Reviewers/PR | Unique PR Reviews $\div$ Pull Requests |
| Gini Coefficient | From bias detection (see above) |

## HTML report: Human Review Burden section

Source: `burden-chart.ts`, rendered in `html-report.ts`

This section visualizes the human review burden metrics from [ai-human-review-burden.md](ai-human-review-burden.md). It appears after the AI & Bot Patterns card.

Traditional bot-authored PRs are excluded from this comparison section even when `include-bots` is `true`. The report notes the excluded count when the burden cohort is smaller than `aiPatterns.totalPRs`.

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
- **Size stratification** — PR size confounds review burden. Comparing within the same size tier (S/M/L) isolates the effect of AI involvement.
