# Input Validation Specification

This document defines validation rules for all action inputs parsed by `src/inputs.ts`.

## `since` / `until` (date inputs)

These inputs define a historical snapshot in two steps:

1. PRs are included when `since <= pr.createdAt <= until`
2. For included PRs, reviews and merge/close state are observed only up to `until`

This prevents later review activity from changing the results of the same historical rerun.

### Accepted format

This action accepts a strict ISO 8601 subset. Inputs must match one of the
following forms and must represent a real calendar date/time:

| Form | Example | Interpretation |
|---|---|---|
| Date only | `2025-06-01` | Midnight UTC (`2025-06-01T00:00:00.000Z`) |
| Date + time (UTC) | `2025-06-01T09:30:00Z` | As specified |
| Date + time + fractional seconds (UTC) | `2025-06-01T09:30:00.000Z` | As specified, normalized to milliseconds |
| Date + time + offset | `2025-06-01T09:30:00+09:00` | Converted to UTC |
| Date + time + offset | `2025-06-01T09:30:00-05:00` | Converted to UTC |

### Rejected formats

Any string outside that subset is rejected, even if JavaScript's `Date`
constructor would parse or normalize it:

- `June 1, 2025` - English date format
- `2025/06/01` - slash-separated
- `2025-6-1` - unpadded month/day
- `1 Jun 2025` - day-month-year prose
- `1719792000000` - Unix timestamp
- `2025-02-30` - non-existent calendar date
- `2025-06-01T23:60:00Z` - out-of-range time component
- `2025-06-01T09:30:00+09:60` - out-of-range UTC offset

### Range constraints

After format validation, the parsed date must satisfy:

1. **Not before 2008-01-01** - GitHub did not exist before then.
2. **Not in the future** - relative to the current time at execution.
3. **`since` < `until`** - the date range must be non-empty.

### Output normalization

All accepted dates are normalized to full ISO 8601 UTC format
(`YYYY-MM-DDTHH:mm:ss.sssZ`) via `Date.prototype.toISOString()` before use in
the pipeline.

## `repository`

Format: `owner/repo`. Validated by `validateRepositoryFormat()` in `src/utils/sanitize.ts`.

## `output-mode`

Comma-separated list of: `summary`, `comment`, `artifact`. At least one mode is required. Duplicates are removed.

When `comment` is included, the action manages a workflow-owned PR comment on
the triggering pull request. An existing comment is updated only when it was
authored by the current workflow identity; otherwise a new comment is created.
If the previously managed comment no longer exists, the action creates a new
comment instead of failing the mode.
If the workflow identity cannot be resolved because of permission restrictions
or missing identity metadata, the action creates a new comment instead of
updating. Unexpected identity-resolution errors fail the `comment` mode.

## `bias-threshold`

Positive number. Clamped to the range `[0.5, 10.0]`. Non-numeric or non-positive values are rejected.

## `max-prs`

Integer in the range `[1, 5000]`. Non-integer or out-of-range values are rejected.

## `include-bots`

Boolean string. `"true"` (case-insensitive) enables bot inclusion; all other values are treated as `false`.

## `github-token`

Required. Immediately registered as a secret via `core.setSecret()` to prevent accidental log exposure.
