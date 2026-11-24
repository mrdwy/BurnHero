import pg from "pg";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { makeApp } from "./app.js";
import { localImages } from "./images.js";
const pool = new pg.Pool({ max: 6, connectionTimeoutMillis: 5000 });
const root = resolve("public");
const app = await makeApp({
  pool,
  secret: process.env.JWT_SECRET,
  images: localImages(process.env.PHOTO_DIR ?? "/data/images"),
  webRoot: existsSync(root) ? root : undefined,
});
for (const sig of ["SIGINT", "SIGTERM"])
  process.once(sig, async () => {
    await app.close();
    await pool.end();
  });
await app.listen({ port: 8080, host: "0.0.0.0" });
