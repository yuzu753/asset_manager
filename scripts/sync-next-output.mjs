import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("web/.next");
const target = resolve(".next");

if (!existsSync(source)) {
  throw new Error(`Next.js build output was not found: ${source}`);
}

rmSync(target, { force: true, recursive: true });
cpSync(source, target, { recursive: true });
