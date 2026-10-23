require("dotenv").config();
const { firebase } = require("../server/firebase/config");
(async () => {
  const args = process.argv.slice(2),
    value = (flag) => args[args.indexOf(flag) + 1];
  if (!args.includes("--uid") || !args.includes("--project"))
    throw new Error(
      "Usage: npm run firebase:admin -- --uid FIREBASE_UID --project PROJECT_ID [--write]",
    );
  if (value("--project") !== process.env.FIREBASE_PROJECT_ID)
    throw new Error("Project mismatch.");
  const { auth } = firebase(),
    user = await auth.getUser(value("--uid"));
  if (!args.includes("--write"))
    return console.log(
      "Dry run: would grant admin to Firebase UID " +
        user.uid +
        ". Re-run with --write only for your trusted administrator.",
    );
  await auth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    admin: true,
  });
  console.log("Admin claim set. Sign out and back in to refresh the ID token.");
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
