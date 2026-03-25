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
      - uses: <your-org>/review-insights@<commit-sha> # v1.0.0
        with:
          output-mode: "summary,artifact"
```

## Inputs

| Input | Description | Default |
|---|---|---|
| `github-token` | GitHub token with repo read access | `${{ github.token }}` |
| `repository` | Repository to analyze (`owner/repo`) | Current repository |
| `since` | Start date (ISO 8601, e.g. `2025-01-01`) | 90 days ago |
| `until` | End date (ISO 8601) | Now |
| `output-mode` | Output targets: `summary`, `comment`, `artifact` (comma-separated) | `summary,artifact` |
| `bias-threshold` | Std deviations to flag review imbalance (0.5–10.0) | `2.0` |
| `include-bots` | Include bot accounts in statistics ([details](docs/filtering.md)) | `false` |
| `max-prs` | Maximum PRs to analyze (1–5000) | `500` |

## Outputs

| Output | Description |
|---|---|
| `report-path` | Path to the generated HTML report file |
| `total-prs-analyzed` | Number of PRs analyzed |
| `top-reviewer` | Login of the most active reviewer |
| `bias-detected` | Whether review imbalance was detected (`true`/`false`) |

## Output Modes

### `summary` (default)

Writes a visual report to the GitHub Actions **Job Summary** with inline SVG charts.

### `comment`

Posts or updates a comment on the triggering PR with review stats. Only works with `pull_request` events. Requires `pull-requests: write` permission.

### `artifact`

Uploads a self-contained HTML report as a downloadable artifact.

## Visualizations

- **Review Heatmap** — Reviewer × Author matrix showing who reviews whom. Flagged pairs highlighted.
- **Bar Charts** — Per-user reviews given, reviews received, and approval counts.
- **Time Series** — Weekly/monthly review activity and PR volume trends.

## Analysis Features

- **Per-user stats** — Reviews given/received, approval rate, avg time to first review
- **Merge correlation** — PRs authored vs merged, zero-review merges
- **Bias detection** — Statistical imbalance via z-score and Gini coefficient
- **AI/Bot patterns** — Bot review percentage, co-authored commits detection

For detailed metric definitions, see [docs/statistics.md](docs/statistics.md). For filtering behavior, see [docs/filtering.md](docs/filtering.md).

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

- **Co-authored-by detection is approximate.** Only the last commit of each PR is fetched from the GraphQL API (`commits(last: 1)`). This means co-authorship trailers on earlier commits are not inspected, and the result varies by merge strategy: merge commits typically do not carry the trailer, squash merges may or may not preserve it depending on the repository's settings, and rebase merges only expose the final commit. The `coAuthoredPRs` metric should be treated as a lower-bound estimate.
- **Review data is capped at 100 per PR.** The GitHub GraphQL API limits nested connections. PRs with more than 100 reviews will have truncated data; a warning is shown when this occurs.
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
