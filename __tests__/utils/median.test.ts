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
});
