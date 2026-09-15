import { capturePage } from "./page-snapshot.ts";
import { runSectionAAudit } from "./section-a/index.ts";

const args = process.argv.slice(2);
const url = args.filter((arg) => !arg.startsWith("--"))[0];

const snapshot = await capturePage(url);
const sectionA = await runSectionAAudit(url, snapshot);
console.log(sectionA);
