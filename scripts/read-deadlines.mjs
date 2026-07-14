// Inspect the Deadlines 2026 workbook structure
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const wb = XLSX.readFile("C:\\Users\\CIM Ltd\\Desktop\\Deadlines 2026.xlsx", { cellDates: true });
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  console.log(`=== SHEET: ${name} (${rows.length} rows)`);
  for (const row of rows.slice(0, 25)) {
    console.log(JSON.stringify(row.slice(0, 12)));
  }
}
