const fs = require("fs"),
  path = require("path"),
  { spawnSync } = require("child_process");
let files = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(name);
    else if (/\.(js|cjs)$/.test(name)) files.push(name);
  }
}
for (const dir of ["public/js", "server", "api", "database", "scripts"])
  scan(dir);
let failed = false;
for (const file of files) {
  const r = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (r.status) {
    failed = true;
    console.error(r.stderr);
  }
}
console.log(`${files.length} JavaScript files checked.`);
process.exitCode = failed ? 1 : 0;
