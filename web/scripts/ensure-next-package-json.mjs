import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageJsonPaths = [
  resolve(".next/package.json"),
  resolve("..", ".next/package.json"),
];

for (const packageJson of packageJsonPaths) {
  mkdirSync(dirname(packageJson), { recursive: true });
  writeFileSync(packageJson, JSON.stringify({ type: "commonjs" }) + "\n");
}
