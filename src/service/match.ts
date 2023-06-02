import { Op, Sequelize } from "sequelize";
import { initModels } from "../models";
import { Context } from "../context";
import { getFormatDate } from "../utils/oldUtils";
const prodDb: Sequelize = new Sequelize({
  dialect: "mysql",
  database: process.env.PROD_MYSQL_DB_NAME || "orbiter",
  username: process.env.PROD_MYSQL_DB_USERNAME || "root",
  password: process.env.PROD_MYSQL_DB_PASSWORD || "root",
  host: process.env.PROD_MYSQL_DB_HOST || "localhost",
  port: Number(process.env.PROD_MYSQL_DB_PORT || "3306"),
  logging: false,
  timezone: "+00:00",
  define: {
    underscored: false,
  },
});
prodDb.authenticate()
  .then(() => {
    console.log("Prod Database connection has been established successfully.");
  })
  .catch(error => {
    console.error("Prod Unable to connect to the database:", error);
  });
const prodModels = initModels(prodDb);


export async function asycDataBase(ctx: Context) {
  const count: number = <any>await ctx.models.Transaction.count(<any>{
    where: {
      status: 99,
    },
  });
  if (count) {
    console.log(`status tx already ${count} =====================`);
    console.log(`status tx already ${count} =====================`);
    console.log(`status tx already ${count} =====================`);
    return;
  }
  const startTime = 1678838400000;
  const endTime = new Date().valueOf();
  console.log(`${getFormatDate(startTime)} - ${getFormatDate(endTime)} Main network database synchronization begin`);
  const transactionList = await prodModels.Transaction.findAll({
    raw: true,
    order: [["timestamp", "desc"]],
    where: {
      status: 99,
      timestamp: {
        [Op.gte]: startTime,
        [Op.lte]: endTime,
      },
    },
  });
  console.log("transactionList count:", transactionList.length);
  const resultList = await ctx.models.Transaction.bulkCreate(transactionList);
  console.log("resultList count:", resultList.length);
  console.log("Main network database synchronization completed");
  console.log("Main network database synchronization completed");
  console.log("Main network database synchronization completed");
  console.log("Main network database synchronization completed");
}




