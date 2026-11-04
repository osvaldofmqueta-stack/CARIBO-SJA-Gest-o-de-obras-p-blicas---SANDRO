const fs = require("node:fs");
const path = require("node:path");

// Use Node rather than a POSIX shell so installation also works on Windows.
if (!(process.env.npm_config_user_agent || "").startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
for (const filename of ["package-lock.json", "yarn.lock"]) {
  fs.rmSync(path.join(root, filename), { force: true });
}
