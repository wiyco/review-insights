# Review Insights

GitHub Action that analyzes PR review statistics per user and generates visual reports — heatmaps, bar charts, and time-series graphs.

## Use Cases

- Detect review workload imbalance (who reviews whom)
- Track how AI / bot adoption affects merge and review counts
- Visualize review activity trends over time
- Identify zero-review merges and review bottlenecks

## Quick Start

```yaml
name: Review Insights
on:
  schedule:
    - cron: "0 9 * * 1" # Weekly Monday at 09:00 UTC
  workflow_dispatch:

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: wiyco/review-insights@v1 # or pin to a specific commit SHA for security
        with:
          output-mode: "summary,artifact"
```

## Inputs

| Input | Description | Default |
|---|---|---|
| `github-token` | GitHub token with repo read access | `${{ github.token }}` |
| `repository` | Repository to analyze (`owner/repo`) | Current repository |
| `since` | Start date for the PR creation window (ISO 8601, e.g. `2025-01-01`) | 90 days ago |
| `until` | End date for the snapshot. Reviews and merge/close state after this timestamp are ignored. | Now |
| `output-mode` | Output targets: `summary`, `comment`, `artifact` (comma-separated) | `summary,artifact` |
| `bias-threshold` | Pearson residual threshold for activity-adjusted review imbalance (0.5–10.0) | `2.0` |
| `include-bots` | Include bot accounts in statistics ([details](docs/filtering.md)) | `false` |
| `max-prs` | Maximum PRs to analyze (1–5000) | `500` |

For full descriptions and validation rules, see [docs/inputs.md](docs/inputs.md).

The date range selects PRs by `createdAt`. For those PRs, review activity and merge/close state are observed only through `until`, so rerunning the same historical window produces a stable snapshot instead of drifting as later reviews arrive.

> [!NOTE]
>
> `include-bots` controls traditional bot accounts (Dependabot, Renovate, etc.) only. AI tool accounts (e.g., OpenClaw, Devin, Copilot) are always included in analysis because they produce substantive code changes that require peer review. See [docs/ai-human-review-burden.md](docs/ai-human-review-burden.md) for classification details.
>
> Traditional bot-authored PRs are still excluded from the AI-vs-human `Human Review Burden` comparison cohort, even when `include-bots` is `true`. They remain visible in bot observability metrics such as bot review percentage.

## Outputs

| Output | Description |
|---|---|
| `report-path` | Absolute path to the generated HTML report file |
| `total-prs-analyzed` | Number of PRs analyzed |
| `top-reviewers` | JSON array of logins tied for the maximum `reviewsGiven` among users with `reviewsGiven > 0`; `[]` if no active reviewers exist |
| `max-reviews-given` | JSON number for the maximum `reviewsGiven` among users with `reviewsGiven > 0`; `null` if no active reviewers exist |
| `bias-detected` | Whether at least one reviewer-author pair was flagged (`true`/`false`). If the bias model is unavailable, reports surface that warning separately. |
| `partial-data` | Whether analysis used a capped or partial PR dataset because pagination hit `max-prs` or the fixed collection budget (`true`/`false`) |

For details on each output, see [docs/outputs.md](docs/outputs.md).

## Output Modes

### `summary` (default)

Writes a visual report to the GitHub Actions **Job Summary** with inline SVG charts.
When the collected dataset is capped/partial, or when any post-filtering PR hits the per-PR review fetch limit, the corresponding warning is shown near the top of the summary.

### `comment`

Posts or updates a workflow-managed comment on the triggering PR with review stats when the workflow event payload includes `pull_request.number`. Existing comments are updated only when they were authored by the current workflow identity; otherwise a new comment is created. If the workflow identity cannot be resolved because of permission restrictions or missing identity metadata, the action creates a new comment instead of updating. Unexpected identity-resolution errors fail the `comment` mode. Requires `pull-requests: write` permission.
The comment also surfaces capped/partial-dataset warnings and per-PR review-fetch-limit warnings for the same filtered PR set used by the report body.

### `artifact`

Uploads a self-contained HTML report as a downloadable artifact.
The HTML report includes the same capped/partial-dataset warnings and per-PR review-fetch-limit warnings near the top of the page.

## Visualizations

- **Review Heatmap** — Reviewer × Author matrix showing who reviews whom. Flagged pairs highlighted.
- **Bar Charts** — Per-user reviews given and reviews received.
- **Time Series** — Weekly/monthly review activity and PR volume trends.
- **Human Review Burden** — Grouped bar charts comparing median review workload (with p90 whiskers) across AI-authored, AI-assisted, and human-only PRs, excluding traditional bot-authored PRs from the comparison cohort. Includes a detailed metrics table and size-stratified breakdown.

## Analysis Features

- **Per-user stats** — Reviews given/received, approval rate, avg time to first review
- **Merge correlation** — PRs authored vs merged, zero-review merges
- **Bias detection** — Activity-adjusted reviewer-author concentration via Pearson residuals and Gini coefficient
- **AI/Bot patterns** — Bot review percentage and AI co-authored PR detection using the same [AI tool email patterns](docs/ai-human-review-burden.md#ai-co-author-detection) that define `ai-assisted`
- **Human review burden** — Compares review workload (review counts, latency, change-request rate, review rounds) across AI-authored, AI-assisted, and human-only PRs after excluding traditional bot-authored PRs from the comparison cohort, with size-stratified breakdowns

For detailed metric definitions, see [docs/statistics.md](docs/statistics.md).
For filtering behavior, see [docs/filtering.md](docs/filtering.md).
For the AI impact on human review burden methodology, see [docs/ai-human-review-burden.md](docs/ai-human-review-burden.md).

## Permissions

| Permission | Required when | Purpose |
|---|---|---|
| `contents: read` | Always | Access repository and commit data via GraphQL API |
| `pull-requests: read` | `summary` or `artifact` mode | Read PR context (minimum for non-comment modes) |
| `pull-requests: write` | `comment` mode | Create or update PR comments with the report |

Example for `summary` / `artifact` only:

```yaml
permissions:
  contents: read
  pull-requests: read
```

Example including `comment` mode:

```yaml
permissions:
  contents: read
  pull-requests: write
```

## Known Limitations

- **AI co-authored detection is approximate.** Only the last commit of each PR is fetched from the GraphQL API (`commits(last: 1)`). This means AI co-author trailers on earlier commits are not inspected, and the result varies by merge strategy: merge commits typically do not carry the trailer, squash merges may or may not preserve it depending on the repository's settings, and rebase merges only expose the final commit. The `aiCoAuthoredPRs` metric should be treated as a lower-bound estimate.
- **Review fetches are capped at 100 per PR.** The GitHub GraphQL query requests at most 100 nested reviews per PR. When a PR hits that fetch limit, its review data may be truncated and a warning is surfaced in the job summary, HTML report, and PR comment.
- **PR collection may complete with capped or partial data.** Pagination runs within a fixed 10-minute wall-clock collection budget and may also be bounded by `max-prs`. If the action finds additional PRs within the requested date range after reaching `max-prs`, it marks the dataset as `Capped`; if the wall-clock budget is exhausted, it marks the dataset as `Partial`. In both cases the action still succeeds, sets `partial-data` to `true`, and surfaces a warning in the job summary, PR comment, and HTML report. Counts and derived metrics then reflect only the collected subset rather than the full date-range population.
- **Large repositories may cause long execution times.** When the GitHub API rate limit is exhausted during pagination, the action waits up to 5 minutes per reset cycle. For very active repositories with high `max-prs` values, this can result in extended run times. Set `timeout-minutes` in your workflow job to guard against this (e.g. `timeout-minutes: 15`), and consider using a shorter date range or lower `max-prs` value.

## Security

- GitHub token is only passed to the Octokit client, never logged or written to files
- All inputs are strictly validated and sanitized
- GraphQL queries use parameterized variables (no string interpolation)
- HTML/SVG output escapes all user-derived content to prevent XSS
- No external resources are loaded — the HTML report is fully self-contained
- Minimal dependencies: only `@actions/core`, `@actions/github`, `@actions/artifact`

## Development

```bash
pnpm install
pnpm run check    # Biome lint + format
pnpm test         # Vitest
pnpm run build    # TypeScript check + Rolldown bundle
```

## License

[MIT](LICENSE)

## Legal

- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)
