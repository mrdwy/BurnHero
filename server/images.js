import sharp from "sharp";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
sharp.cache(false);
sharp.concurrency(1);
export function localImages(root) {
  const path = (id) => join(root, `${id}.webp`);
  return {
    async put(id, bytes) {
      let result;
      try {
        const img = sharp(bytes, {
          limitInputPixels: 24_000_000,
          failOn: "error",
        });
        const { format, pages } = await img.metadata();
        if (!["jpeg", "png", "webp"].includes(format) || pages > 1)
          throw Error();
        result = await img
          .rotate()
          .resize({
            width: 1280,
            height: 1280,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 75 })
          .toBuffer();
      } catch {
        throw Object.assign(Error("请选择 JPEG、PNG 或 WebP 静态图片"), {
          statusCode: 400,
        });
      }
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(path(id), result, { mode: 0o600, flag: "wx" });
    },
    get: (id) => readFile(path(id)),
    remove: (id) => rm(path(id), { force: true }),
  };
}
