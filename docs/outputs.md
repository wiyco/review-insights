# Action Outputs

This document defines the outputs set by the review-insights GitHub Action via `core.setOutput()`.

## Outputs

| Output | Type | Description |
|---|---|---|
| `report-path` | `string` | Absolute path to the generated HTML report file. Only set when at least one output mode succeeds. |
| `total-prs-analyzed` | `number` | Number of PRs included in the analysis after filtering. When `include-bots` is `false`, bot-authored PRs are excluded from this count. |
| `top-reviewers` | `string` | JSON array of logins in the argmax set of `reviewsGiven`, restricted to users with `reviewsGiven > 0` and sorted in ascending code-unit order for deterministic serialization. Returns `[]` if no active reviewers exist. |
| `max-reviews-given` | `string` | JSON number for the maximum `reviewsGiven` among active reviewers, or `null` if no active reviewers exist. |
| `bias-detected` | `string` | `"true"` if at least one reviewer-author pair was flagged by bias detection, `"false"` otherwise. A `"false"` value does not distinguish between "no flagged pair" and "bias warnings unavailable because the quasi-independence model could not be fit"; that state is surfaced in the workflow warning and rendered reports. |
| `partial-data` | `string` | `"true"` when analysis used a capped or partial PR dataset because pagination hit `max-prs` or the fixed 10-minute collection budget, `"false"` otherwise. |

## Filtering consistency

All outputs reflect the **post-filtering** state of the data:

- `total-prs-analyzed` excludes bot-authored PRs when `include-bots` is `false`, matching the filtered count used by analysis modules (`per-user-stats`, `bias-detector`, `merge-correlation`) and the HTML report KPI "Pull Requests".
- `top-reviewers` and `max-reviews-given` are derived from `userStats`, which already applies both author and reviewer bot filtering.
- `bias-detected` is derived from `detectBias()`, which already applies both author and reviewer bot filtering.
- `partial-data` is derived from the collection phase before filtering. When it is `"true"`, the filtered outputs still remain internally consistent, but they are based on a capped or partial PR population rather than the full date-range population.

## Partial data contract

When `partial-data` is `"true"`, the collection phase did not establish a complete date-range population. This can happen in three ways:

- pagination found additional PRs within the requested date range after reaching `max-prs`, so the dataset is marked as `Capped`
- the fixed 10-minute wall-clock collection budget was reached
- the next required rate-limit delay would have exceeded the remaining collection budget

The action still succeeds and publishes outputs, but counts and derived metrics should be treated as being based on the collected subset rather than the full date-range population.

The same partial-data state is surfaced in the job summary, PR comment, and HTML artifact so consumers do not need to rely on the Actions log warning alone.

## Review fetch truncation warning

Each PR fetch requests the first 100 nested reviews plus `reviews.pageInfo.hasNextPage`. A post-filtering PR is warned as truncated only when GitHub reports additional review pages beyond that first page.

The same review-fetch-limit warning is surfaced in the job summary, PR comment, and HTML artifact. When `include-bots` is `false`, bot-authored PRs are excluded from that warning consistently with the rest of the filtered outputs.

## Tie-aware reviewer ranking

The active reviewer population is defined as:

$$R = \{u \mid \text{reviewsGiven}(u) > 0\}$$

The output `top-reviewers` is the full argmax set:

$$\mathrm{ArgMax}_{u \in R}\ \text{reviewsGiven}(u)$$

This avoids collapsing ties into an arbitrary single login. When $R = \emptyset$, the argmax set is undefined, so the serialized outputs are `[]` and `null`.

For deterministic serialization across runners, `top-reviewers` is sorted in ascending code-unit order of the login strings.
