# Action Outputs

This document defines the outputs set by the review-insights GitHub Action via `core.setOutput()`.

## Outputs

| Output | Type | Description |
|---|---|---|
| `report-path` | `string` | Absolute path to the generated HTML report file. Only set when at least one output mode succeeds. |
| `total-prs-analyzed` | `number` | Number of PRs included in the analysis after filtering. When `include-bots` is `false`, bot-authored PRs are excluded from this count. |
| `top-reviewer` | `string` | Login of the user with the highest `reviewsGiven`. Empty string (`""`) if no reviewers exist in the dataset. |
| `bias-detected` | `string` | `"true"` if at least one reviewer-author pair was flagged by bias detection, `"false"` otherwise. |

## Filtering consistency

All outputs reflect the **post-filtering** state of the data:

- `total-prs-analyzed` excludes bot-authored PRs when `include-bots` is `false`, matching the filtered count used by analysis modules (`per-user-stats`, `bias-detector`, `merge-correlation`) and the HTML report KPI "Pull Requests".
- `top-reviewer` is derived from `userStats`, which already applies both author and reviewer bot filtering.
- `bias-detected` is derived from `detectBias()`, which already applies both author and reviewer bot filtering.
