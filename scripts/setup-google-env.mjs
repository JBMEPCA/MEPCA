// Copies service-account credentials from the downloaded key into .env
import { readFileSync, appendFileSync } from "fs";

const key = JSON.parse(readFileSync("C:\\Users\\CIM Ltd\\Downloads\\mepca-hub-3a328269ffde.json", "utf8"));
const env = readFileSync(".env", "utf8");
if (env.includes("GOOGLE_CLIENT_EMAIL")) {
  console.log("already configured");
  process.exit(0);
}

const block = `
# --- Google (Calendar + Analytics + Search Console via service account) ---
GOOGLE_CLIENT_EMAIL="${key.client_email}"
GOOGLE_PRIVATE_KEY="${key.private_key.replace(/\n/g, "\\n")}"
GOOGLE_CALENDAR_ID="jontheface86@gmail.com"
GA4_PROPERTY_ID="385082229"
`;
appendFileSync(".env", block);
console.log("added:", key.client_email);
