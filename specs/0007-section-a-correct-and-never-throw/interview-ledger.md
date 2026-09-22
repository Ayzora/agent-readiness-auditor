---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: What should "tidying Section A" cover?

Recommended Answer:
- A Spec called "Section A: correct and never-throw".
- In: every Section A probe degrades instead of throwing, so a failure costs only that probe's own findings (a `skip` with a reason) and `index.ts` drops its `try`/`catch`; server errors, timeouts and dropped connections count as blocked in the agent probes, with the cause as evidence; robots.txt is fetched once and shared; every Section A check gets tests.
- Out: latency capture per agent probe, building domain-ownership verification, sitemap coverage (waits on the crawler), and moving off Crawlee for its own sake — replace it only where that is what fixes a bug.

Answer: Happy with the recommendation.

Decision: The Spec makes Section A correct and never-throwing, and tests it. It is not a rewrite for style.

Reason: Two of the problems found are real bugs — one inflates scores, one concerns load on other people's servers. "Tidying" means making the section right and robust.

Negative Requirements:
- No latency capture.
- No domain-ownership verification.
- No sitemap coverage-gap check.

### L2

Status: current

Question: How should the rate-limit probe behave, given that domain-ownership verification does not exist?

Recommended Answer:
- Off by default, enabled by a `--rate-limit` flag standing in for ownership; `skip` with `reason: "not requested — run with --rate-limit"` when off.
- When on, hit `/robots.txt` rather than the audited page.

Answer: No — leave it unlocked. It is not an attack, and no extra machinery is needed.

Decision: The rate-limit probe runs on every audit, with no flag and no ownership gate. The product spec (§8) and `CLAUDE.md`, which both say it must be opt-in, are updated to match the code.

Reason: About 45 requests over 12 seconds, never above 8 req/s, stopping at the first sign of a limit, is not an attack. An opt-in flag adds machinery for no benefit the user wants.

Answer History:
- Recommended: off by default behind a `--rate-limit` flag until ownership verification exists.
- Final answer: always on; no flag.

Negative Requirements:
- No `--rate-limit` flag or any other opt-in switch.
- No ownership check.

### L3

Status: current

Question: Which address should the rate-limit probe send its requests to?

Recommended Answer: Keep it exactly as it is — the audited page. It measures what an agent actually meets, and costs no code. `/robots.txt` would be gentler but is often cached and may never reach the site's limiter.

Answer: Yes, keep it on the audited page.

Decision: The rate-limit probe keeps targeting the audited page. The documented rule "one cheap static asset, never dynamic pages" is removed from `CLAUDE.md` and recorded as not followed in the product spec.

Negative Requirements:
- The probe does not switch to `/robots.txt` or any other static asset.

### L4

Status: current

Question: How should each agent probe's response be sorted?

Recommended Answer:
- One request per agent, no retries.
- Exactly one of four outcomes per agent:
  - **got through** — a status below 400 and no Cloudflare challenge; used by `baseline_mismatch`.
  - **asked to pay** — a 402; used by `pay_per_crawl`.
  - **blocked** — a challenge, or any status of 400 or above except 402; used by `policy_divergence`.
  - **no answer** — a timeout or dropped connection; counted as blocked by `policy_divergence`, with the cause recorded as evidence.
- Each problem is charged once: `baseline_mismatch` compares only agents that got through, and a 402 no longer counts against `policy_divergence`.

Answer: Happy to go with the recommendation.

Decision: Agent probes make one request each with no retries, and each is classified into exactly one of got through, asked to pay, blocked, or no answer. Blocked and no answer both count against `policy_divergence`.

Reason: Today Crawlee's `HttpCrawler` throws on any status of 500 or above, retries up to three times, and then reaches `failedRequestHandler` with no status recorded — so `(statusCode ?? 0) >= 400` reads a 503 or a dropped connection as "not blocked". A site blocking agents that way passes `policy_divergence` and escapes the cap-25 gate. Retries also mean up to four requests per agent. An empty body from a blocked agent also failed `baseline_mismatch`, charging one block twice.

Negative Requirements:
- No retries on an agent probe.
- A 402 is not counted as blocked.
- `baseline_mismatch` never compares an agent that did not get through.

### L5

Status: current

Question: What should happen when robots.txt cannot be read?

Recommended Answer: Follow RFC 9309, since it describes what well-behaved agents do:
- 200 → parse the rules; pass / warn / fail as today.
- 400–499 → everything allowed → pass.
- 500 or above, or no answer → everything blocked → fail, with the cause as evidence.

Answer: Happy to go with the recommendation.

Decision: robots.txt outcomes are interpreted per RFC 9309. A 4xx means all agents are allowed; a 5xx or no answer means all agents are disallowed, which fails `access.robots_allows_agents` and so fires the cap-20 gate.

Reason: Today Crawlee's `RobotsTxtFile.load` treats only a 404 as allow-all and throws on any other error, which costs the run every access finding. RFC 9309 is what real agents follow, so a site whose robots.txt returns a server error really is closed to them.

Examples:
- robots.txt answers 403 → every agent allowed → pass.
- robots.txt answers 503 → every agent disallowed → fail, `cap 20`.

### L6

Status: current

Question: When does a sitemap count as present?

Recommended Answer:
- Only when it loads and looks like a sitemap: a 200 whose body contains `<urlset` or `<sitemapindex`.
- Listed in robots.txt and loads → pass.
- Not listed, but `/sitemap.xml` loads → warn (as today).
- Listed, but none of the listed sitemaps load → fail, evidence naming the broken links.
- No sitemap anywhere → fail.
- `sitemap_freshness` reads dates from the sitemap that actually loaded.

Answer: Happy to go with the recommendation.

Decision: A sitemap is present only when it answers 200 with a body containing `<urlset` or `<sitemapindex`. A robots.txt `Sitemap:` line pointing at a broken file no longer passes.

Reason: Today a robots.txt mention passes without the file being fetched, and a single-page app's HTML shell at `/sitemap.xml` passes on its 200 — the same trap Section G's llms.txt check guards against.

### L7

Status: current

Question: What should the rate-limit probe do when a request fails partway through?

Recommended Answer:
- A 10-second limit on each request.
- Stop and warn, recording the rate reached, on a 429, any `Retry-After` header, or no answer (timeout or dropped connection).
- Record why in evidence: `stoppedBy: "429" | "retry-after" | "no answer"`, alongside `limitFoundAt`.
- A 5xx does not stop the probe.

Answer: Happy to go with the recommendation.

Decision: Each rate-limit request has a 10-second timeout. A 429, a `Retry-After` header or no answer ends the ramp with a warn; a 5xx does not. The evidence records `limitFoundAt` and `stoppedBy`.

Reason: Today no timeout is set, so a silent site can hang the run, and a rejected request throws out of the whole section. Dropping connections is a common way to shed load, and "no answer" is already treated as blocked for agent probes.

Negative Requirements:
- A 500 or 503 does not end the ramp.

### L8

Status: current

Question: Which address should robots.txt be judged against?

Recommended Answer:
- `robots_allows_agents` stays site-wide: each agent is judged against the site root, as today, and it remains the check the cap-20 gate reads.
- The agent probes use the audited page: an agent is probed only if robots.txt allows it on that page's path. An agent disallowed there is not counted against `policy_divergence`.
- The evidence also lists the agents blocked from the audited page.

Answer: Happy to go with the recommendation.

Decision: `robots_allows_agents` judges the site root; the agent probe list is the agents robots.txt allows on the audited page; `robots_allows_agents` evidence gains the agents blocked from the audited page.

Reason: Today every agent is judged against the root only, so auditing `/docs/guide` on a site that disallows `/docs/` for one agent still probes that agent and can charge its refusal to `policy_divergence`. Keeping the gate on the root means a site that closes one folder is not capped as if it closed everything.

### L9

Status: current

Question: How should Section A's code be laid out so it can be tested?

Recommended Answer:
- Phase 1: one `captureAccess(url)` fetches everything once — robots.txt, the agent probes, the rate-limit ramp, the sitemaps — and returns one plain object, the access capture. It never throws; failures are recorded and it moves on.
- Phase 2: the seven checks read only that object, synchronously, with no network.
- Parsing robots.txt happens in Phase 2; Phase 1 stores the body, so a test can pass a robots.txt as a string.
- An `accessFrom(overrides)` helper builds a capture for tests, like `snapshotFrom`.
- Crawlee is removed from Section A; every fetch goes through `got-scraping`, and robots.txt is parsed with `robots-parser` added as a direct dependency.
- `runSectionAAudit(url, snapshot, rulebook)` keeps its name and arguments; `index.ts` drops its `try`/`catch`.

Answer: Happy to go with the recommendation.

Decision: Section A splits into a never-throwing Phase 1 `captureAccess(url)` returning an access capture, and pure synchronous checks over it. Crawlee leaves Section A; `got-scraping` does every fetch; `robots-parser` parses robots.txt in Phase 2.

Reason: It gives Section A the fetch/check split every other section already has, which is the only way to test its checks without a network, and one HTTP client means one set of timeout and retry rules.
