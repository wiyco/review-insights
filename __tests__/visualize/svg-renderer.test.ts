import { describe, expect, it } from "vitest";
import {
  colorScale,
  group,
  line,
  polyline,
  rect,
  svgDoc,
  text,
  truncateLabel,
} from "../../src/visualize/svg-renderer";

describe("svgDoc", () => {
  it("wraps content in svg element with viewBox", () => {
    const result = svgDoc(100, 200, "<rect/>");
    expect(result).toContain('width="100"');
    expect(result).toContain('height="200"');
    expect(result).toContain('viewBox="0 0 100 200"');
    expect(result).toContain("<rect/>");
    expect(result).toContain("</svg>");
  });
});

describe("rect", () => {
  it("renders basic rect", () => {
    const result = rect(10, 20, 30, 40, "#fff");
    expect(result).toContain('x="10"');
    expect(result).toContain('fill="#fff"');
    expect(result).toContain("/>");
  });

  it("renders rect with rx and opacity", () => {
    const result = rect(0, 0, 10, 10, "#000", {
      rx: 5,
      opacity: 0.5,
    });
    expect(result).toContain('rx="5"');
    expect(result).toContain('opacity="0.5"');
  });

  it("renders rect with stroke", () => {
    const result = rect(0, 0, 10, 10, "#000", {
      stroke: "red",
    });
    expect(result).toContain('stroke="red"');
    expect(result).toContain('stroke-width="2"');
  });

  it("renders rect with custom strokeWidth", () => {
    const result = rect(0, 0, 10, 10, "#000", {
      stroke: "red",
      strokeWidth: 3,
    });
    expect(result).toContain('stroke-width="3"');
  });

  it("renders rect with title", () => {
    const result = rect(0, 0, 10, 10, "#000", {
      title: "hello",
    });
    expect(result).toContain("<title>hello</title></rect>");
  });
});

describe("text", () => {
  it("renders basic text", () => {
    const result = text(10, 20, "hello");
    expect(result).toContain('x="10"');
    expect(result).toContain(">hello</text>");
  });

  it("renders text with all opts", () => {
    const result = text(0, 0, "t", {
      fontSize: 14,
      fill: "red",
      anchor: "middle",
      fontWeight: "bold",
      dy: "0.3em",
      rotate: 45,
    });
    expect(result).toContain('font-size="14"');
    expect(result).toContain('fill="red"');
    expect(result).toContain('text-anchor="middle"');
    expect(result).toContain('font-weight="bold"');
    expect(result).toContain('dy="0.3em"');
    expect(result).toContain("rotate(45, 0, 0)");
  });
});

describe("line", () => {
  it("renders line element", () => {
    const result = line(0, 0, 100, 100, "#000");
    expect(result).toContain('x1="0"');
    expect(result).toContain('x2="100"');
    expect(result).toContain('stroke-width="1"');
  });

  it("renders line with custom strokeWidth", () => {
    const result = line(0, 0, 10, 10, "#000", 3);
    expect(result).toContain('stroke-width="3"');
  });
});

describe("polyline", () => {
  it("renders polyline with points", () => {
    const result = polyline(
      [
        [
          0,
          0,
        ],
        [
          10,
          20,
        ],
      ],
      "#000",
    );
    expect(result).toContain('points="0,0 10,20"');
    expect(result).toContain('fill="none"');
  });

  it("renders polyline with fill", () => {
    const result = polyline(
      [
        [
          0,
          0,
        ],
        [
          10,
          10,
        ],
      ],
      "#000",
      "blue",
    );
    expect(result).toContain('fill="blue"');
  });
});

describe("group", () => {
  it("wraps content in g element without transform", () => {
    const result = group("<rect/>");
    expect(result).toBe("<g><rect/></g>");
  });

  it("wraps content in g element with transform", () => {
    const result = group("<rect/>", "translate(10,20)");
    expect(result).toBe('<g transform="translate(10,20)"><rect/></g>');
  });
});

describe("colorScale", () => {
  it("returns #f0f0f0 when min equals max", () => {
    expect(colorScale(5, 5, 5)).toBe("#f0f0f0");
  });

  it("returns min color for min value", () => {
    expect(colorScale(0, 0, 10)).toBe("#f0f0f0");
  });

  it("returns max color for max value", () => {
    expect(colorScale(10, 0, 10)).toBe("#2d6a4f");
  });

  it("clamps values below min", () => {
    expect(colorScale(-5, 0, 10)).toBe("#f0f0f0");
  });

  it("clamps values above max", () => {
    expect(colorScale(15, 0, 10)).toBe("#2d6a4f");
  });
});

describe("truncateLabel", () => {
  it("returns label unchanged when within maxLen", () => {
    expect(truncateLabel("short", 10)).toBe("short");
  });

  it("returns label unchanged when exactly maxLen", () => {
    expect(truncateLabel("12345", 5)).toBe("12345");
  });

  it("truncates with ellipsis when exceeding maxLen", () => {
    expect(truncateLabel("abcdefghij", 5)).toBe("abcd\u2026");
  });
});
