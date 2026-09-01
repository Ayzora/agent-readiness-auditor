import { runSectionAAudit } from "./section-a/index.ts";

const args = process.argv.slice(2);
const url = args.filter((arg) => !arg.startsWith("--"))[0];

const sectionA = await runSectionAAudit(url);
console.log(sectionA);
