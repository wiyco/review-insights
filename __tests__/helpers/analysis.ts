import type { AnalysisResult } from "../../src/types";
import { requiredAt } from "../../src/utils/array";

export function userStatsAt(
  analysis: AnalysisResult,
  index: number,
): AnalysisResult["userStats"][number] {
  return requiredAt(analysis.userStats, index, "user stats");
}
