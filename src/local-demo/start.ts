process.env.DB_MODE =
  "sqlite";

process.env.SQLITE_PATH =
  process.env.SQLITE_PATH ||
  "./data/forest-local-demo.sqlite";

await import("../index.js");
