# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL DIRECTIVE: NO ASSUMPTIONS

**You MUST NEVER make assumptions, guesses, or inferences about business logic, expected outputs, or data structures.** — All code generation, modifications, and architectural decisions MUST be strictly grounded in verified facts from the `docs/` directory or explicit user instructions.
- **Action Required on Missing Info** — If facts are missing, unclear, or not found in the documentation, you **MUST STOP** and explicitly ask the user for clarification. Do not attempt to fill in the gaps with your own assumptions.

---

## What This Is

A GitHub Action that analyzes PR review statistics and generates visual reports (heatmaps, bar charts, time-series graphs). It fetches PR data via GraphQL, runs statistical analysis (bias detection, merge correlation, bot activity), and outputs self-contained HTML/SVG reports.

## Zero-Compromise Directives

You **MUST NEVER** compromise on the following principles. Any code generation or modification must strictly adhere to these rules:

1. Security (Strict)
   - **Zero XSS vulnerability** — All user-derived content (usernames, PR titles, body text) MUST pass through `src/utils/sanitize.ts` before being embedded into SVG/HTML.
   - **Secret Handling** — NEVER log, expose, or leak GitHub tokens (`GITHUB_TOKEN`) or any environment variables under any circumstances.
   - **No Unsafe Execution** — No `eval()`, `new Function()`, or unsafe prototype manipulation.
2. Performance & Resource Limits
   - **Algorithmic Efficiency** — Analysis functions (loops, aggregations) must be highly optimized (O(N) or O(N log N)). The action must comfortably handle repositories with thousands of PRs without memory crashes (OOM).
   - **Query Optimization** — GraphQL queries MUST strictly fetch only required fields. Cursor pagination must be robust against rate limits and timeout errors.
3. Mathematical & Statistical Correctness
   - **Formula Rigor** — Implementations of statistical methods (Z-score, Gini coefficient, correlation) must use strictly correct mathematical formulas. Do not use shortcuts or approximations.
   - **Edge Case Math** — You MUST explicitly handle zero-division (`0/0`, `x/0`), empty arrays, nullish values, and prevent `NaN` or `Infinity` from propagating into the SVG/JSON output.
   - **Precision** — Be mindful of JavaScript floating-point arithmetic issues when accumulating large numbers or calculating precise coefficients.
4. Testing Correctness
   - **Zero Flakiness** — Tests MUST be 100% deterministic. Do not depend on real-time (`Date.now()`) or external network conditions without rigorous mocking.
   - **Boundary & Outlier Testing** — Statistical functions MUST be tested against extreme outliers, negative numbers, empty datasets, and massive single-user data skews.
   - **Accurate Mocks** — GraphQL response mocks must perfectly reflect real GitHub API schemas (including correct node/edge structures).

## Commands

```bash
pnpm install              # Install dependencies
pnpm run check            # Biome lint + format check
pnpm run check:fix        # Auto-fix lint/format issues
pnpm test                 # Run tests once
pnpm run test:watch       # Watch mode
pnpm run test:coverage    # Tests with V8 coverage
pnpm run typecheck        # TypeScript type checking
pnpm run build            # tsc + rolldown → dist/index.mjs
pnpm run all              # check + test + build (full CI)
```

Others:

```bash
# Run a specific test file
pnpm exec vitest run __tests__/analyze/bias-detector.test.ts
```

## Architecture

Pipeline flow: collect → analyze → visualize → output

- `src/collect/` — GraphQL cursor-based pagination, PR fetching, bot detection, data normalization
- `src/analyze/` — Pure functions: per-user stats, bias detection (Z-score, Gini coefficient), merge correlation, AI/bot pattern analysis
- `src/visualize/` — Custom SVG primitive renderer (no external libs), generates heatmaps, bar charts, time-series, and full HTML reports
- `src/output/` — Publishing: GitHub job summary, PR comments, artifact upload
- `src/inputs.ts` — Input validation and config parsing
- `src/types.ts` — Core interfaces shared across modules

Entry point is `src/main.ts` → `run()` which orchestrates the full pipeline. Analysis steps run sequentially (all are pure synchronous CPU-bound functions; `Promise.all` would not yield concurrency on a single thread).

## Key Constraints

- **No external resources in output** — all HTML/SVG reports must be fully self-contained (inline styles, no CDN links)
- **XSS prevention** — all user-derived content must go through `src/utils/sanitize.ts` before embedding in HTML/SVG
- **Coverage** — 90% threshold, `src/main.ts` excluded (side-effectful entry point)
- **dist freshness** — CI verifies `dist/index.mjs` is committed and up-to-date after build

## Tooling

- **Node ≥24**, **pnpm 10**, **TypeScript** (ES2024, strict, composite project references)
- **Rolldown** bundles to single ESM file for the action runtime
- **Biome 2** for linting/formatting (2-space indent, 80-char width)
- **Vitest** with V8 coverage
- **Lefthook** git hooks: pre-commit runs biome + tsc, post-merge runs pnpm install

## Documentation & Specifications

- **Consult `docs/`** — When implementing new features, fixing bugs, or analyzing architecture, you **MUST** refer to the specification documents in the `docs/` directory.

---

## Pre-Output Checklist

Before generating any code or response, you must strictly verify the following:

1. **Fact Check** Is this solution based entirely on verified facts from `docs/` or explicit user instructions?
2. **Zero Assumptions** — Did I make any assumptions to complete this task? *(If yes, you MUST stop and ask the user for missing details instead of outputting an assumed solution.)*
