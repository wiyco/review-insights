import { describe, expect, it } from "vitest";
import { formatDuration } from "../../src/utils/format";

describe("formatDuration", () => {
  it("returns '0s' for negative values", () => {
    expect(formatDuration(-1000)).toBe("0s");
  });

  it("formats seconds", () => {
    expect(formatDuration(5000)).toBe("5s");
  });

  it("formats minutes", () => {
    expect(formatDuration(120_000)).toBe("2m");
  });

  it("formats hours", () => {
    expect(formatDuration(7_200_000)).toBe("2.0h");
  });

  it("formats days", () => {
    expect(formatDuration(172_800_000)).toBe("2.0d");
  });

  it("formats exactly 0ms as 0s", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});
