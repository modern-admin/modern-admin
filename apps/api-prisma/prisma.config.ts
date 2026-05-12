import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { defineConfig, env } from 'prisma/config';

const result = dotenv.config();
dotenvExpand.expand(result);

export default defineConfig({
  typedSql: {
    path: "prisma/sql",
  },
  schema: "prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});