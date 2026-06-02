import fs from "node:fs";
const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const f of r) {
  if (f.errorCount === 0) continue;
  console.log("\n---", f.filePath.replace(/\\/g, "/").split("report_readr_fe/")[1]);
  for (const m of f.messages) {
    if (m.severity !== 2) continue;
    console.log(`  ${m.line}:${m.column}  ${m.ruleId}  -  ${m.message.slice(0, 100)}`);
  }
}
