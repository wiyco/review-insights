import { describe, expect, it } from "vitest";
import { requiredAt } from "../../src/utils/array";

describe("requiredAt", () => {
  it("returns the item at the requested index", () => {
    expect(
      requiredAt(
        [
          "alpha",
          "beta",
        ],
        1,
        "item",
      ),
    ).toBe("beta");
  });

  it("throws when the requested index is missing", () => {
    expect(() =>
      requiredAt(
        [
          "alpha",
        ],
        1,
        "item",
      ),
    ).toThrow("Missing item at index 1");
  });
});
