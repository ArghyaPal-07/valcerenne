const { buildSync } = require("esbuild");
const fs = require("fs");
fs.mkdirSync("public/js/vendor", { recursive: true });
buildSync({
  entryPoints: ["client/firebase-session.js"],
  bundle: true,
  minify: true,
  platform: "browser",
  target: ["es2020"],
  outfile: "public/js/vendor/firebase-session.js",
  legalComments: "eof",
});
console.log("Firebase Authentication browser bundle generated.");
