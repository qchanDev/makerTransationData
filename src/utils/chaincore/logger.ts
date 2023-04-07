import path from "path";
import { WinstonX } from "orbiter-chaincore/src/packages/winstonX";

export function getLoggerService(
  intranetId: string,
  name: string,
  runtimeDir: string = path.join(
    process.env.logDir || process.cwd() + "/runtime",
  ) || "runtime",
) {
  return WinstonX.getLogger(intranetId, {
    label: name,
    logDir: path.join(runtimeDir, "chaincore", intranetId),
  });
}
