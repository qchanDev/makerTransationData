import Koa2 from "koa";
import router from "./server/router";
import { isProd } from "./config/config";
export function createServer() {
  const app = new Koa2();
  app.use(async (ctx, next) => {
    const routerPath = ctx.originalUrl.split("?")[0];
    try {
      const startTime = new Date().valueOf();
      await next();
      const excTime = new Date().valueOf() - startTime;
      console.log(`${routerPath} ${excTime}ms`);
    } catch (e: any) {
      const status = e.status || 500;
      console.error(routerPath, e.message, e.stack);
      ctx.body = {
        code: 500,
        msg: isProd() ? "Server internal error" : e.message,
      };
      if (status === 422) {
        ctx.body.detail = e.errors;
      }
      ctx.status = status;
    }
  });
  app.use(router.routes());
  const port = process.env["PORT"] || 3000;
  app.listen(port, () => {
    console.log(`Api Service Start: http://127.0.0.1:${port}`);
  });
  return app;
}
