import { describe, expect, it } from "vitest";
import { computeMedian } from "../../src/utils/median";

describe("computeMedian", () => {
  it("returns null for empty array", () => {
    expect(computeMedian([])).toBeNull();
  });

  it("returns the single element for length-1 array", () => {
    expect(
      computeMedian([
        42,
      ]),
    ).toBe(42);
  });

  it("returns the middle value for odd-length array", () => {
    expect(
      computeMedian([
        3,
        1,
        2,
      ]),
    ).toBe(2);
  });

  it("returns the mean of two middle values for even-length array", () => {
    expect(
      computeMedian([
        4,
        1,
        3,
        2,
      ]),
    ).toBe(2.5);
  });

  it("does not mutate the input array", () => {
    const input = [
      3,
      1,
      2,
    ];
    computeMedian(input);
    expect(input).toEqual([
      3,
      1,
      2,
    ]);
  });

  it("handles duplicate values", () => {
    expect(
      computeMedian([
        5,
        5,
        5,
        5,
      ]),
    ).toBe(5);
  });

  it("handles two elements", () => {
    expect(
      computeMedian([
        1,
        5,
      ]),
    ).toBe(3);
  });

  it("throws for sparse arrays without the lower middle value", () => {
    expect(() => computeMedian(new Array<number>(1))).toThrow(RangeError);
  });

  it("throws for sparse arrays without the upper middle value", () => {
    const values = new Array<number>(2);
    values[0] = 1;

    expect(() => computeMedian(values)).toThrow(RangeError);
  });

  it("throws for sparse arrays even when the middle values exist", () => {
    const values = new Array<number>(4);
    values[0] = 1;
    values[1] = 2;
    values[2] = 3;

    expect(() => computeMedian(values)).toThrow(RangeError);
  });

  it("throws for non-finite values", () => {
    expect(() =>
      computeMedian([
        1,
        Number.POSITIVE_INFINITY,
      ]),
    ).toThrow(RangeError);
  });

  it("averages extreme finite middle values without overflowing", () => {
    expect(
      computeMedian([
        Number.MAX_VALUE,
        Number.MAX_VALUE,
      ]),
    ).toBe(Number.MAX_VALUE);
  });
});
