import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputDir = resolve(".next");
const packageJson = resolve(outputDir, "package.json");

mkdirSync(outputDir, { recursive: true });
writeFileSync(packageJson, JSON.stringify({ type: "commonjs" }) + "\n");
