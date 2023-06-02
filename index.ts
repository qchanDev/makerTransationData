import "dotenv/config";
import { Watch } from "./src/service/watch";
import { Context } from "./src/context";
import utc from "dayjs/plugin/utc";
import dayjs from "dayjs";
import { asycDataBase } from "./src/service/match";
dayjs.extend(utc);
export class Application {
  public ctx: Context = new Context();
  async bootstrap() {
    await this.ctx.init();
    if (process.env.NODE_ENV === "async") {
      if(Number(process.env.INSTANCES) === 0) asycDataBase(this.ctx);
    } else {
      // process
      const watch = new Watch(this.ctx);
      await watch.start();
    }
  }
}
const app = new Application();
app.bootstrap().catch(error => {
  app.ctx.logger.error("start app error", error);
});
process.on("uncaughtException", (err: Error) => {
  app.ctx.logger.error("Global Uncaught exception:", err);
});
process.on("unhandledRejection", (err: Error) => {
  app.ctx.logger.error(
    "There are failed functions where promise is not captured：",
    err,
  );
});
