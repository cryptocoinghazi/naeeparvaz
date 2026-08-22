import { access, writeFile } from "node:fs/promises";
import { randomBytes, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../.env", import.meta.url));

try {
  await access(target);
  console.log("Using the existing ignored .env file.");
} catch {
  const adminCode = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const sessionSecret = randomBytes(32).toString("hex");
  const contents = `# Local development only. This file is ignored by Git.\n\nADMIN_EMAIL=editor@naeeparvaz.com\nCONTACT_FROM_EMAIL=website@send.naeeparvaz.com\nDATABASE_URL=postgresql://naee:local-development-only@127.0.0.1:5432/naee_parvaz\nLOCAL_ADMIN_CODE=${adminCode}\nRESEND_API_KEY=\nSESSION_SECRET=${sessionSecret}\nTURNSTILE_SITE_KEY=1x00000000000000000000AA\nTURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA\n`;
  await writeFile(target, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log("Created an ignored .env file for local development.");
  console.log(`Local editor one-time code: ${adminCode}`);
  console.log("Save this code. To rotate it later, edit LOCAL_ADMIN_CODE in .env.");
}
