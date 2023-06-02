import { Sequelize } from "sequelize";
import { Context } from "../context";
import { getFormatDate } from "../utils/oldUtils";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc);
const prodDb: Sequelize = new Sequelize({
  dialect: "mysql",
  database: process.env.PROD_MYSQL_DB_NAME || "orbiter",
  username: process.env.PROD_MYSQL_DB_USERNAME || "root",
  password: process.env.PROD_MYSQL_DB_PASSWORD || "root",
  host: process.env.PROD_MYSQL_DB_HOST || "localhost",
  port: Number(process.env.PROD_MYSQL_DB_PORT || "3306"),
  logging: true,
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
  console.log(`${getFormatDate(startTime)} - now Main network database synchronization begin`);
  const transactionList = (await prodDb.query('select * from transaction where status=99 and timestamp >= "2023-03-15T00:00:00.000Z" and timestamp <= "2023-06-02T05:50:39.091Z" limit 10'))[0]

  console.log("transactionList count:", transactionList.length);
  const resultList = await ctx.models.Transaction.bulkCreate(transactionList);
  console.log("resultList count:", resultList.length);
  console.log("Main network database synchronization completed");
  console.log("Main network database synchronization completed");
  console.log("Main network database synchronization completed");
  console.log("Main network database synchronization completed");
}




