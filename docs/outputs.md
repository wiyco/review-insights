# Action Outputs

This document defines the outputs set by the review-insights GitHub Action via `core.setOutput()`.

## Outputs

| Output | Type | Description |
|---|---|---|
| `report-path` | `string` | Absolute path to the generated HTML report file. Only set when at least one output mode succeeds. |
| `total-prs-analyzed` | `number` | Number of PRs included in the analysis after filtering. When `include-bots` is `false`, bot-authored PRs are excluded from this count. |
| `top-reviewers` | `string` | JSON array of logins in the argmax set of `reviewsGiven`, restricted to users with `reviewsGiven > 0` and sorted in ascending code-unit order for deterministic serialization. Returns `[]` if no active reviewers exist. |
| `max-reviews-given` | `string` | JSON number for the maximum `reviewsGiven` among active reviewers, or `null` if no active reviewers exist. |
| `bias-detected` | `string` | `"true"` if at least one reviewer-author pair was flagged by bias detection, `"false"` otherwise. |
| `partial-data` | `string` | `"true"` when pagination stopped at the 10-minute collection limit and the analysis used a partial PR dataset, `"false"` otherwise. |

## Filtering consistency

All outputs reflect the **post-filtering** state of the data:

- `total-prs-analyzed` excludes bot-authored PRs when `include-bots` is `false`, matching the filtered count used by analysis modules (`per-user-stats`, `bias-detector`, `merge-correlation`) and the HTML report KPI "Pull Requests".
- `top-reviewers` and `max-reviews-given` are derived from `userStats`, which already applies both author and reviewer bot filtering.
- `bias-detected` is derived from `detectBias()`, which already applies both author and reviewer bot filtering.
- `partial-data` is derived from the collection phase before filtering. When it is `"true"`, the filtered outputs still remain internally consistent, but they are based on an incomplete PR population.

## Partial data contract

When `partial-data` is `"true"`, pagination hit the fixed 10-minute wall-clock limit in the collection phase and the action analyzed only the PRs fetched before that point. The action still succeeds and publishes outputs, but counts and derived metrics should be treated as lower bounds or incomplete statistics.

The same partial-data state is surfaced in the job summary, PR comment, and HTML artifact so consumers do not need to rely on the Actions log warning alone.

## Tie-aware reviewer ranking

The active reviewer population is defined as:

$$R = \{u \mid \text{reviewsGiven}(u) > 0\}$$

The output `top-reviewers` is the full argmax set:

$$\operatorname{ArgMax}_{u \in R}\ \text{reviewsGiven}(u)$$

This avoids collapsing ties into an arbitrary single login. When $R = \emptyset$, the argmax set is undefined, so the serialized outputs are `[]` and `null`.

For deterministic serialization across runners, `top-reviewers` is sorted in ascending code-unit order of the login strings.
