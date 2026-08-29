import { rateLimitProbe } from "./rate-limit-probe.js";
import { robotsAudit } from "./robots-audit.js";

const args = process.argv.slice(2);
const urls = args.filter((arg) => !arg.startsWith("--"));
// Opt-in: the probe sends ~45 requests per URL at a deliberately rising rate.
const withRateLimit = args.includes("--rate-limit");

if (urls.length === 0) {
  console.error("usage: pnpm scraper [--rate-limit] <url>...");
  process.exit(1);
}

for (const url of urls) {
  const robots = await robotsAudit(url);
  const rateLimit = withRateLimit ? await rateLimitProbe(url) : undefined;

  console.log(JSON.stringify({ url, robots, rateLimit }, null, 2));
}
