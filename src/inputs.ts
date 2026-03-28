import * as core from "@actions/core";
import type { ActionConfig, OutputMode } from "./types";
import { validateRepositoryFormat } from "./utils/sanitize";

const VALID_OUTPUT_MODES: ReadonlySet<OutputMode> = new Set<OutputMode>([
  "summary",
  "comment",
  "artifact",
]);

function isValidOutputMode(value: string): value is OutputMode {
  return VALID_OUTPUT_MODES.has(value as OutputMode);
}

const MIN_DATE = "2008-01-01T00:00:00Z";
const MIN_BIAS_THRESHOLD = 0.5;
const MAX_BIAS_THRESHOLD = 10.0;
const MIN_MAX_PRS = 1;
const MAX_MAX_PRS = 5000;
const DEFAULT_LOOKBACK_DAYS = 90;

/**
 * Matches the supported ISO 8601 subset:
 * - Date only: YYYY-MM-DD
 * - Date + time with Z: YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss.sss...
 * - Date + time with offset: YYYY-MM-DDTHH:mm:ss+HH:MM or -HH:MM
 */
const ISO_8601_RE =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<timezone>Z|(?<offsetSign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2})))?$/;

function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseIso8601Date(value: string): Date | null {
  const match = ISO_8601_RE.exec(value);
  if (!match?.groups) {
    return null;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);

  if (!isInRange(month, 1, 12)) {
    return null;
  }
  if (!isInRange(day, 1, daysInMonth(year, month))) {
    return null;
  }

  if (match.groups.hour == null) {
    return new Date(Date.UTC(year, month - 1, day));
  }

  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);

  if (!isInRange(hour, 0, 23)) {
    return null;
  }
  if (!isInRange(minute, 0, 59)) {
    return null;
  }
  if (!isInRange(second, 0, 59)) {
    return null;
  }

  let offsetMinutes = 0;
  if (match.groups.timezone !== "Z") {
    const offsetHour = Number(match.groups.offsetHour);
    const offsetMinute = Number(match.groups.offsetMinute);

    if (!isInRange(offsetHour, 0, 23)) {
      return null;
    }
    if (!isInRange(offsetMinute, 0, 59)) {
      return null;
    }

    const offsetMagnitude = offsetHour * 60 + offsetMinute;
    offsetMinutes =
      match.groups.offsetSign === "+" ? offsetMagnitude : -offsetMagnitude;
  }

  const fraction = match.groups.fraction ?? "";
  const milliseconds =
    fraction.length === 0 ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second, milliseconds) -
    offsetMinutes * 60_000;

  return new Date(utcMs);
}

/**
 * Parses and validates an ISO 8601 date string, ensuring it falls within a sane range.
 * `now` is passed in so that a single timestamp is used consistently across all
 * validation and default-value logic, avoiding TOCTOU-style drift between calls.
 */
function parseAndValidateDate(value: string, label: string, now: Date): string {
  const date = parseIso8601Date(value);
  if (date === null || Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid ${label} date: "${value}" is not a valid ISO 8601 date.`,
    );
  }
  if (date < new Date(MIN_DATE)) {
    throw new Error(
      `Invalid ${label} date: "${value}" is before 2008. GitHub did not exist before then.`,
    );
  }
  if (date > now) {
    throw new Error(`Invalid ${label} date: "${value}" is in the future.`);
  }
  return date.toISOString();
}

/** Parses a comma-separated output mode string into a deduplicated list of valid modes. */
function parseOutputModes(raw: string): OutputMode[] {
  const modes = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  if (modes.length === 0) {
    throw new Error(
      'No output modes specified. Use one or more of: "summary", "comment", "artifact".',
    );
  }

  const validated = modes.filter((mode): mode is OutputMode => {
    if (!isValidOutputMode(mode)) {
      throw new Error(
        `Invalid output mode: "${mode}". Allowed values: summary, comment, artifact.`,
      );
    }
    return true;
  });

  return [
    ...new Set(validated),
  ];
}

/** Parses the bias threshold, clamping it to the allowed range. */
function parseBiasThreshold(raw: string): number {
  const value = Number(raw);
  if (Number.isNaN(value) || value <= 0) {
    throw new Error(
      `Invalid bias-threshold: "${raw}" must be a positive number.`,
    );
  }
  return Math.min(Math.max(value, MIN_BIAS_THRESHOLD), MAX_BIAS_THRESHOLD);
}

/** Parses the max-prs input, ensuring it is an integer within the allowed range. */
function parseMaxPRs(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid max-prs: "${raw}" must be an integer.`);
  }
  if (value < MIN_MAX_PRS || value > MAX_MAX_PRS) {
    throw new Error(
      `Invalid max-prs: ${value} must be between ${MIN_MAX_PRS} and ${MAX_MAX_PRS}.`,
    );
  }
  return value;
}

/** Reads and validates all action inputs, returning a fully resolved configuration. */
export function getConfig(): ActionConfig {
  const token = core.getInput("github-token", {
    required: true,
  });
  if (!token) {
    throw new Error("github-token is required.");
  }
  core.setSecret(token);

  const repository = core.getInput("repository", {
    required: true,
  });
  if (!validateRepositoryFormat(repository)) {
    throw new Error(
      `Invalid repository format: "${repository}". Expected "owner/repo".`,
    );
  }
  const [owner, repo] = repository.split("/");

  const now = new Date();
  const defaultSince = new Date(
    now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const sinceRaw = core.getInput("since");
  const since = sinceRaw
    ? parseAndValidateDate(sinceRaw, "since", now)
    : defaultSince.toISOString();

  const untilRaw = core.getInput("until");
  const until = untilRaw
    ? parseAndValidateDate(untilRaw, "until", now)
    : now.toISOString();

  if (new Date(since) >= new Date(until)) {
    throw new Error(
      `"since" date (${since}) must be before "until" date (${until}).`,
    );
  }

  const outputModeRaw = core.getInput("output-mode") || "summary,artifact";
  const outputModes = parseOutputModes(outputModeRaw);

  const biasThresholdRaw = core.getInput("bias-threshold") || "2.0";
  const biasThreshold = parseBiasThreshold(biasThresholdRaw);

  const includeBots =
    core.getInput("include-bots").trim().toLowerCase() === "true";

  const maxPRsRaw = core.getInput("max-prs") || "500";
  const maxPRs = parseMaxPRs(maxPRsRaw);

  return {
    token,
    owner,
    repo,
    since,
    until,
    outputModes,
    biasThreshold,
    includeBots,
    maxPRs,
  };
}
