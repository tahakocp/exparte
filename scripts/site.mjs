// Builds public/: the static demo plus the compiled engine. Run `npm run build` first.
import { cpSync, mkdirSync, rmSync } from "node:fs";
rmSync("public", { recursive: true, force: true });
mkdirSync("public/lib", { recursive: true });
cpSync("site", "public", { recursive: true });
cpSync("dist/src", "public/lib", { recursive: true, filter: (f) => !f.endsWith(".d.ts") && !f.endsWith("cli.js") });
cpSync("fixtures/cases.json", "public/cases.json");
console.log("public/ ready");
