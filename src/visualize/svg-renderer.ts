import { escapeForSvg } from "../utils/sanitize";

/** Optional styling attributes for an SVG rect element. */
export interface RectOpts {
  rx?: number;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  title?: string;
}

/** Optional styling attributes for an SVG text element. */
export interface TextOpts {
  fontSize?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  fontWeight?: string;
  rotate?: number;
  dy?: string;
}

/**
 * Wraps SVG content in a complete SVG document element with viewBox.
 */
export function svgDoc(width: number, height: number, content: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<style>text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }</style>`,
    content,
    "</svg>",
  ].join("\n");
}

/**
 * Returns an SVG rect element string.
 */
export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  opts?: RectOpts,
): string {
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"`,
  ];
  if (opts?.rx != null) parts.push(` rx="${opts.rx}"`);
  if (opts?.opacity != null) parts.push(` opacity="${opts.opacity}"`);
  if (opts?.stroke)
    parts.push(
      ` stroke="${opts.stroke}" stroke-width="${opts.strokeWidth ?? 2}"`,
    );
  if (opts?.title) {
    parts.push(`><title>${escapeForSvg(opts.title)}</title></rect>`);
  } else {
    parts.push("/>");
  }
  return parts.join("");
}

/**
 * Returns an SVG text element string. All content is escaped.
 */
export function text(
  x: number,
  y: number,
  content: string,
  opts?: TextOpts,
): string {
  const parts = [
    `<text x="${x}" y="${y}"`,
  ];
  if (opts?.fontSize) parts.push(` font-size="${opts.fontSize}"`);
  if (opts?.fill) parts.push(` fill="${opts.fill}"`);
  if (opts?.anchor) parts.push(` text-anchor="${opts.anchor}"`);
  if (opts?.fontWeight) parts.push(` font-weight="${opts.fontWeight}"`);
  if (opts?.dy) parts.push(` dy="${opts.dy}"`);
  if (opts?.rotate != null) {
    parts.push(` transform="rotate(${opts.rotate}, ${x}, ${y})"`);
  }
  parts.push(`>${escapeForSvg(content)}</text>`);
  return parts.join("");
}

/**
 * Returns an SVG line element string.
 */
export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth?: number,
): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth ?? 1}"/>`;
}

/**
 * Returns an SVG polyline element string.
 */
export function polyline(
  points: [
    number,
    number,
  ][],
  stroke: string,
  fill?: string,
): string {
  const pts = points.map(([px, py]) => `${px},${py}`).join(" ");
  return `<polyline points="${pts}" stroke="${stroke}" fill="${fill ?? "none"}" stroke-width="2"/>`;
}

/**
 * Wraps content in a g element with an optional transform.
 */
export function group(content: string, transform?: string): string {
  if (transform) {
    return `<g transform="${transform}">${content}</g>`;
  }
  return `<g>${content}</g>`;
}

/**
 * Interpolates a hex color between #f0f0f0 (min) and #2d6a4f (max).
 * Returns #f0f0f0 when min === max.
 */
export function colorScale(value: number, min: number, max: number): string {
  if (min === max) return "#f0f0f0";

  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const r0 = 0xf0,
    g0 = 0xf0,
    b0 = 0xf0;
  const r1 = 0x2d,
    g1 = 0x6a,
    b1 = 0x4f;

  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Truncates a label with "\u2026" (ellipsis) if it exceeds maxLen characters.
 */
export function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return `${label.slice(0, maxLen - 1)}\u2026`;
}
