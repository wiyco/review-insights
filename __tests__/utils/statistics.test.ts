import { describe, expect, it } from "vitest";
import {
  arithmeticMean,
  assertFiniteDenseNumbers,
  interpolateLinear,
  midpoint,
  readFiniteDenseNumber,
} from "../../src/utils/statistics";

describe("statistics helpers", () => {
  it("reads finite dense numbers", () => {
    expect(
      readFiniteDenseNumber(
        [
          1,
          2,
          3,
        ],
        1,
        "Test",
      ),
    ).toBe(2);
  });

  it("throws when a value is missing", () => {
    const values = new Array<number>(1);

    expect(() => readFiniteDenseNumber(values, 0, "Test")).toThrow(RangeError);
  });

  it("throws when a value is not finite", () => {
    expect(() =>
      readFiniteDenseNumber(
        [
          Number.NaN,
        ],
        0,
        "Test",
      ),
    ).toThrow(RangeError);
  });

  it("validates dense finite arrays", () => {
    expect(() =>
      assertFiniteDenseNumbers(
        [
          0,
          1,
          2,
        ],
        "Test",
      ),
    ).not.toThrow();
  });

  it("computes a midpoint without overflowing", () => {
    expect(midpoint(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
  });

  it("preserves equal subnormal values when computing a midpoint", () => {
    expect(midpoint(Number.MIN_VALUE, Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
    expect(midpoint(-Number.MIN_VALUE, -Number.MIN_VALUE)).toBe(
      -Number.MIN_VALUE,
    );
  });

  it("linearly interpolates across extreme finite values", () => {
    expect(interpolateLinear(-Number.MAX_VALUE, Number.MAX_VALUE, 0.9)).toBe(
      Number.MAX_VALUE * 0.8,
    );
  });

  it("returns null for the mean of an empty array", () => {
    expect(arithmeticMean([], "Test")).toBeNull();
  });

  it("returns zero for the mean of all-zero values", () => {
    expect(
      arithmeticMean(
        [
          0,
          0,
        ],
        "Test",
      ),
    ).toBe(0);
  });

  it("computes a mean without overflowing", () => {
    expect(
      arithmeticMean(
        [
          Number.MAX_VALUE,
          Number.MAX_VALUE,
        ],
        "Test",
      ),
    ).toBe(Number.MAX_VALUE);
  });
});
