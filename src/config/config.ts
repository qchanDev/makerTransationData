// export const isLocal = () => process.env.NODE_ENV === 'test';
// export const isDev = () => process.env.NODE_ENV === 'development';
export const isProd = () => process.env.NODE_ENV === 'production';

export default {
  development: {
    dialect: "mysql",
    database: process.env.MYSQL_DB_NAME || "orbiter",
    username: process.env.MYSQL_DB_USERNAME || "root",
    password: process.env.MYSQL_DB_PASSWORD || "root",
    host: process.env.MYSQL_DB_HOST || "localhost",
    port: Number(process.env.MYSQL_DB_PORT || "3306"),
    logging: false,
    timezone: "+00:00",
  },
  test: {
    dialect: "mysql",
    database: process.env.MYSQL_DB_NAME || "ob",
    username: process.env.MYSQL_DB_USERNAME || "root",
    password: process.env.MYSQL_DB_PASSWORD || "root",
    host: process.env.MYSQL_DB_HOST || "localhost",
    logging: false,
    port: Number(process.env.MYSQL_DB_PORT || "3306"),
    timezone: "+00:00",
  },
  production: {
    dialect: "mysql",
    database: process.env.MYSQL_DB_NAME,
    username: process.env.MYSQL_DB_USERNAME,
    password: process.env.MYSQL_DB_PASSWORD,
    host: process.env.MYSQL_DB_HOST,
    port: Number(process.env.MYSQL_DB_PORT),
    logging: false,
    timezone: "+00:00",
  },
};
