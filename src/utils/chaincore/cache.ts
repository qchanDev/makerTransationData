import Keyv from "keyv";
import path from "path";
import KeyvFile from "orbiter-chaincore/src/utils/keyvFile";

export async function getCacheService(
  intranetId: string,
  runtimeDir: string = path.join(
    process.env.logDir || process.cwd() + "/runtime",
  ) || "runtime",
) {
  return new Keyv({
    store: new KeyvFile({
      filename: path.join(runtimeDir, "cache", intranetId), // the file path to store the data
      expiredCheckDelay: 999999 * 24 * 3600 * 1000, // ms, check and remove expired data in each ms
      writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write performance.
      encode: JSON.stringify, // serialize function
      decode: JSON.parse, // deserialize function
    }),
  });
}
