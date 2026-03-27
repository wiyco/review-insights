import * as core from "@actions/core";
import { runAction } from "./action";

runAction().catch((err: unknown) => {
  if (err instanceof Error) {
    core.error(err);
    core.setFailed(err.message);
  } else {
    core.setFailed(String(err));
  }
});
