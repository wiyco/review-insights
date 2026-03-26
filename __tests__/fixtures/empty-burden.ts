import type {
  HumanReviewBurden,
  HumanReviewBurdenGroup,
} from "../../src/types";

export const EMPTY_BURDEN_GROUP = {
  prCount: 0,
  humanReviewsPerPR: {
    median: null,
    p90: null,
    mean: null,
  },
  firstReviewLatencyMs: {
    median: null,
    p90: null,
    mean: null,
  },
  unreviewedRate: null,
  changeRequestRate: {
    median: null,
    mean: null,
  },
  reviewRounds: {
    median: null,
    p90: null,
    mean: null,
  },
} as const satisfies HumanReviewBurdenGroup;

export const EMPTY_BURDEN = {
  aiAuthored: EMPTY_BURDEN_GROUP,
  aiAssisted: EMPTY_BURDEN_GROUP,
  humanOnly: EMPTY_BURDEN_GROUP,
  stratifiedBySize: {
    S: {
      aiAuthored: null,
      aiAssisted: null,
      humanOnly: null,
    },
    M: {
      aiAuthored: null,
      aiAssisted: null,
      humanOnly: null,
    },
    L: {
      aiAuthored: null,
      aiAssisted: null,
      humanOnly: null,
    },
    Empty: {
      aiAuthored: null,
      aiAssisted: null,
      humanOnly: null,
    },
  },
} as const satisfies HumanReviewBurden;
