import * as controllers from "./controllers/index";
import Router from "koa-router";
const router = new Router();
router.get("/", ctx => {
  ctx.body = "welcome";
});
router.get("/block/scan", controllers.scanBlock);
router.get("/block/change", controllers.changeBlock);

export default router;
