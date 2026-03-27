# Input Validation Specification

This document defines validation rules for all action inputs parsed by `src/inputs.ts`.

## `since` / `until` (date inputs)

These inputs define a historical snapshot in two steps:

1. PRs are included when `since <= pr.createdAt <= until`
2. For included PRs, reviews and merge/close state are observed only up to `until`

This prevents later review activity from changing the results of the same historical rerun.

### Accepted format

Any valid **ISO 8601** date or datetime string. The following forms are accepted:

| Form | Example | Interpretation |
|---|---|---|
| Date only | `2025-06-01` | Midnight UTC (`2025-06-01T00:00:00.000Z`) |
| Date + time (UTC) | `2025-06-01T09:30:00Z` | As specified |
| Date + time + ms (UTC) | `2025-06-01T09:30:00.000Z` | As specified |
| Date + time + offset | `2025-06-01T09:30:00+09:00` | Converted to UTC |
| Date + time + offset | `2025-06-01T09:30:00-05:00` | Converted to UTC |

### Rejected formats

Any string that does not match ISO 8601 structure is rejected, even if JavaScript's `Date` constructor would parse it:

- `June 1, 2025` — English date format
- `2025/06/01` — slash-separated
- `2025-6-1` — unpadded month/day
- `1 Jun 2025` — day-month-year prose
- `1719792000000` — Unix timestamp

### Range constraints

After format validation, the parsed date must satisfy:

1. **Not before 2008-01-01** — GitHub did not exist before then.
2. **Not in the future** — relative to the current time at execution.
3. **`since` < `until`** — the date range must be non-empty.

### Output normalization

All accepted dates are normalized to full ISO 8601 UTC format (`YYYY-MM-DDTHH:mm:ss.sssZ`) via `Date.prototype.toISOString()` before use in the pipeline.

## `repository`

Format: `owner/repo`. Validated by `validateRepositoryFormat()` in `src/utils/sanitize.ts`.

## `output-mode`

Comma-separated list of: `summary`, `comment`, `artifact`. At least one mode is required. Duplicates are removed.

## `bias-threshold`

Positive number. Clamped to the range `[0.5, 10.0]`. Non-numeric or non-positive values are rejected.

## `max-prs`

Integer in the range `[1, 5000]`. Non-integer or out-of-range values are rejected.

## `include-bots`

Boolean string. `"true"` (case-insensitive) enables bot inclusion; all other values are treated as `false`.

## `github-token`

Required. Immediately registered as a secret via `core.setSecret()` to prevent accidental log exposure.
