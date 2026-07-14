// Dumps raw text from the FileMaker ledger PDF so we can map its layout
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import { readFileSync, writeFileSync } from "fs";

const buf = readFileSync("C:\\Users\\CIM Ltd\\Desktop\\FM JTB Ledger.pdf");
const data = await pdfParse(buf);
writeFileSync("scripts/ledger-raw.txt", data.text);
console.log(`pages: ${data.numpages}, chars: ${data.text.length}`);
console.log("--- first 2000 chars ---");
console.log(data.text.slice(0, 2000));
