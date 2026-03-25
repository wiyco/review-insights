# Privacy Policy

Last updated: 2026-03-25

## Overview

Review Insights is a GitHub Action that analyzes pull request review activity and produces visual reports. This document explains what data the Action accesses, how that data is handled, and where it ends up.

## What Data Is Collected

Each time the Action runs it queries the GitHub GraphQL API with the token supplied by the workflow. The following fields are retrieved:

### Pull Request Metadata

- Number, title, and state (open, closed, or merged)
- Creation, merge, and close timestamps

### User Information

- GitHub usernames (`login`) of PR authors, reviewers, merge actors, and requested reviewers
- Account type (user or bot), used for bot detection

### Review Activity

- Review state (approved, changes requested, commented, or dismissed)
- Review timestamps

### Commit Data

- The most recent commit message on each PR, used solely for co-author detection

## How Data Is Processed

All data is processed **entirely within the GitHub Actions runner** for the duration of the workflow job. The Action:

- Aggregates per-user review statistics (counts, approval rates, time to first review)
- Computes statistical metrics (Z-scores, Gini coefficients, merge correlations)
- Renders self-contained HTML/SVG reports with no external dependencies

**No data is sent to any external server or third-party service.** Every API call targets the GitHub API exclusively.

## Where Data Is Stored

| Location | Scope | Retention |
|---|---|---|
| Runner memory | Single workflow job | Released when the job ends |
| Temporary files | Runner filesystem (`/tmp/`) | Removed on error; discarded when the runner is recycled |
| GitHub Actions artifact | Repository (when `output-mode` includes `artifact`) | Governed by the repository's artifact retention setting (default 90 days) |
| PR comment | Repository (when `output-mode` includes `comment`) | Persists until manually deleted |
| Job summary | Workflow run (when `output-mode` includes `summary`) | Retained with the workflow run record |

The Action does **not** maintain any database, external store, or persistent state between runs.

## What Appears in Reports

Generated reports may include:

- GitHub usernames in tables, heatmaps, and charts
- PR numbers and titles (HTML report only)
- Aggregated review counts and derived statistics
- Date-formatted timestamps

All user-supplied content (usernames, PR titles) is escaped before being embedded in HTML or SVG to prevent cross-site scripting (XSS).

## Token Handling

The GitHub token provided through the `github-token` input is:

- Used only for authenticated requests to the GitHub API
- Masked via `@actions/core` so it cannot appear in workflow logs
- Never written to any report, artifact, or output file
- Never sent to any endpoint other than the GitHub API

## Bot Filtering

With `include-bots` set to `false` (the default), bot-authored PRs and bot reviews are excluded from the statistical output. The AI/bot pattern analysis module still processes the unfiltered dataset for observability, but its results appear only in the dedicated bot-activity section of the report.

## Data Minimization

- GraphQL queries request only the fields needed for analysis
- The `since`, `until`, and `max-prs` inputs let you narrow the window of data that is fetched
- Nothing is persisted once the workflow run ends

## Third-Party Services

This Action does **not** rely on any third-party service, analytics platform, or telemetry. All processing takes place inside the GitHub Actions infrastructure.

## Your Rights

Because all data originates from the GitHub API and stays within GitHub's infrastructure:

- Access is governed by the repository's existing permission model
- Repository administrators can control artifact retention and delete reports at any time
- PR comments containing report data can be removed by any user with sufficient repository permissions

## Changes to This Policy

Updates to this policy will be tracked in the repository's commit history and noted in release changelogs.

## Contact

For privacy-related questions or concerns, please open an issue in this repository or use [GitHub's private vulnerability reporting](https://github.com/wiyco/review-insights/security/advisories) for sensitive matters.
