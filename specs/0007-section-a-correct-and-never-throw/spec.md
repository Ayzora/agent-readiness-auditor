---
type: Spec
title: "Section A: correct and never-throw"
---

## Problem

Section A (access) is the oldest code in the scraper, and it predates the rules the rest of the codebase follows. Five problems follow from that:

- **One failure loses the whole section.** Its probes throw. `index.ts` wraps all of Section A in a single `try`/`catch`, so a failure in any one probe discards all seven access findings. The scorecard then shows access as N/A and withholds the total.
- **A blocked agent can look allowed.** Agent probes run through Crawlee's `HttpCrawler`. It throws on any status of 500 or above, retries up to three times, then gives up without recording a status. `findPolicyDivergentAgents` reads the missing status as "not blocked". A site that answers agents with 503s or drops their connections therefore passes `access.policy_divergence` and escapes the cap-25 gate. The retries also mean one agent can hit the site four times.
- **One problem is charged twice.** A blocked agent's empty body fails `access.baseline_mismatch` as "different text". A 402 counts against both `access.pay_per_crawl` and `access.policy_divergence`.
- **robots.txt and the sitemap are judged loosely.** robots.txt is fetched three times, and every agent is judged only against the site root, never against the audited page. Crawlee treats a 404 robots.txt as allow-all but throws on every other error. A robots.txt `Sitemap:` line passes `access.sitemap_present` without the file ever being fetched. A single-page app's HTML shell at `/sitemap.xml` also passes, because it answers 200.
- **The rate-limit probe can hang, and has no tests.** It sets no timeout, so a silent site can stall the run. Section A has one test in total, for `policy_divergence`.

Four HTTP clients are in use: Crawlee's crawler, Crawlee's robots reader, `got-scraping` and global `fetch`. Each has its own timeouts, retries and user agent.

## Proposed Outcome

Section A gets the fetch/check split every other section has. [L9]

- **Phase 1:** a never-throwing `captureAccess(url)` fetches robots.txt once, runs the agent probes, the rate-limit ramp and the sitemap fetches, and returns one plain **access capture**.
- **Phase 2:** the seven checks are pure synchronous functions over that capture, so each can be tested with literals and no network.
- **One HTTP client:** Crawlee leaves the codebase, and every Section A fetch goes through `got-scraping`.

The checks become correct:

- Agent probes make one request each and sort into four outcomes. Server errors and dropped connections count as blocked, and each problem is charged once. [L4]
- robots.txt failures follow RFC 9309. [L5]
- Agents are probed only if robots.txt allows them on the audited page. [L8]
- A sitemap counts only when it loads as a sitemap. [L6]
- The rate-limit probe has a timeout, stops on no answer, and says why it stopped. [L7]

The rate-limit probe stays as it is in two respects: it still runs on every audit and still targets the audited page. The docs that say otherwise are corrected. [L2] [L3]

`index.ts` no longer needs a `try`/`catch` around Section A. [L1]

## User Stories

1. As a site owner whose server answers AI agents with 503s or dropped connections, I want the audit to report them as blocked, so the report does not tell me agents can read my site when they cannot. [L4]
2. As a site owner, I want each problem charged once, so one blocked agent does not also count as "different content" and a paywall does not also count as a block. [L4]
3. As a site owner whose robots.txt returns a server error, I want to be told that agents following the robots.txt standard will stay away, because that is what they do. [L5]
4. As a site owner whose robots.txt closes one folder, I want the audit of a page in that folder to respect the rule, not to charge my server for refusing agents robots.txt already turned away. [L8]
5. As a site owner whose robots.txt names a sitemap that is missing, or whose `/sitemap.xml` is really an HTML page, I want that reported as a problem rather than a pass. [L6]
6. As a user, I want a failure in one access probe to cost only that probe's findings, never the whole access dimension or the total. [L1]
7. As a user, I want the rate-limit probe to finish in bounded time and to say why it stopped. [L7]
8. As a developer of this tool, I want every Section A check tested without a network, as every other section's checks are. [L1] [L9]

## Requirements

### Shape

1. `scraper/src/section-a/` gains a Phase 1 function `captureAccess(url): Promise<AccessCapture>` that performs every Section A fetch: robots.txt, the agent probes, the rate-limit ramp and the sitemaps. [L9]
2. `captureAccess` never throws. A failed fetch leaves its fields null and populates an `error` string on the part of the capture it belongs to, and the checks reading it return `skip` or the verdict the requirements below give. [L1] [L9]
3. The seven Section A checks are pure synchronous functions over the `AccessCapture`, the snapshot's raw HTML (for `baseline_mismatch`), the site and page URLs, and the rulebook. None performs I/O. [L9]
4. A synchronous aggregator — `judgeAccess(...)` or similar — runs the seven checks and returns their findings in today's order: `robots_allows_agents`, `policy_divergence`, `pay_per_crawl`, `baseline_mismatch`, `rate_limit`, `sitemap_present`, `sitemap_freshness`. [L9]
5. `runSectionAAudit(url, snapshot, rulebook)` keeps its name, arguments and async return. It calls `captureAccess` and then the aggregator. [L9]
6. `index.ts` calls `runSectionAAudit` with no `try`/`catch`. The comment about a Section A crash is removed. `printSectionAFailure` is removed from `print-report.ts` if nothing else uses it. [L1]
7. The access capture's types live in `scraper/src/types.ts`, beside the other captures. [L9]

### HTTP client

8. Every Section A fetch goes through `got-scraping`, with an explicit timeout and `retry: { limit: 0 }`. [L9]
9. Crawlee is no longer imported anywhere. Section A was its only user, so `crawlee` is removed from `scraper/package.json`, and `CRAWLEE_LOG_LEVEL=WARNING` is removed from the `start` script. [L9]
10. `robots-parser` is added to `scraper/package.json` as a direct dependency. [L9]

### robots.txt

11. robots.txt is fetched exactly once per run. The capture records its status, body and any error, and nothing else fetches it. [L1] [L9]
12. The body is parsed in Phase 2 by a pure helper using `robots-parser`, so a test can pass a robots.txt as an inline string. Phase 1 calls the same helper to decide which agents to probe. [L9]
13. The robots.txt response is interpreted per RFC 9309: [L5]

    | robots.txt response | Meaning | `access.robots_allows_agents` |
    | --- | --- | --- |
    | 200 | parse the rules | `pass` when no agent is blocked, `warn` when some are, `fail` when all are — as today |
    | 400–499 | every agent allowed | `pass` |
    | 500 or above, or no answer | every agent disallowed | `fail` |

14. For a 5xx or no answer, the evidence records the cause: the status code, or the error. [L5]
15. `access.robots_allows_agents` judges each agent against the **site root**, as today. It stays site-scope, and it is the finding the cap-20 gate reads. [L8]
16. Its evidence gains the agents robots.txt disallows on the **audited page's** path, alongside today's `blockedAgents`. [L8]

### Agent probes

17. The agents probed are those robots.txt allows on the **audited page's** path, under the interpretation in requirement 13. A 4xx robots.txt probes every agent, and a 5xx or no answer probes none. [L5] [L8]
18. Each probed agent gets exactly one request, with no retries, sent under that agent's existing user-agent string. Probes run one at a time, as today. [L4]
19. Each agent probe has a 15-second timeout, matching the page capture's raw fetch. [L4]
20. The capture records each probe's status code, whether it was challenged (`cf-mitigated: challenge`, as today), its body, and any error. [L4] [L9]
21. A pure helper puts each probe into exactly one outcome: [L4]

    | Outcome | When |
    | --- | --- |
    | got through | status below 400 and not challenged |
    | asked to pay | status 402 |
    | blocked | challenged, or status 400 or above other than 402 |
    | no answer | no response: a timeout, a refused or dropped connection, or any other request error |

22. `access.policy_divergence` counts agents that are **blocked** or have **no answer**. It returns `pass` when none do, `warn` when some do, and `fail` only when every probed agent does. It returns `skip` with `reason: "no agents allowed to probe"` when no agent was probed, as today. [L4]
23. `access.policy_divergence` evidence still lists the counted agents, and records each one's cause: the status code, `challenged`, or the error. [L4]
24. `access.pay_per_crawl` counts agents that were **asked to pay**. Otherwise it is unchanged: `warn` when any were, `pass` when none were, and `skip` when no agent was probed. [L4]
25. A 402 is never counted by `access.policy_divergence`. [L4]
26. `access.baseline_mismatch` compares only agents that **got through**: [L4]
    - It returns `skip` with `reason: "no agents allowed to probe"` when no agent was probed.
    - It returns `skip` with `reason: "no agent got through"` when agents were probed but none got through.
    - Its existing `skip` for a baseline with no text is unchanged, and so is its threshold comparison.

### Rate-limit probe

27. The rate-limit probe runs on every audit, with no flag and no ownership check. [L2]
28. It targets the audited page, as today. [L3]
29. The ramp is unchanged: 1 → 2 → 4 → 8 requests per second, 3 seconds per step, never above 10 per second, `followRedirect: false`. [L2] [L3]
30. Each request has a 10-second timeout. [L7]
31. The ramp stops at the first response with status 429, the first response carrying a `Retry-After` header, or the first request with **no answer** (a timeout or dropped connection). [L7]
32. A 500, a 503 or any other 5xx does not stop the ramp. [L7]
33. The capture records `limitFoundAt` (the rate at which the ramp stopped, or null) and `stoppedBy`, one of `"429"`, `"retry-after"` or `"no answer"`, or null when the ramp completed. [L7]
34. `access.rate_limit` returns `pass` when the ramp completed and `warn` when it stopped. Its evidence carries `limitFoundAt` and `stoppedBy`. [L7]

### Sitemaps

35. A sitemap **loads** when it answers 200 and its body contains `<urlset` or `<sitemapindex`. [L6]
36. When robots.txt lists sitemaps, those are tried in order until one loads, and `/sitemap.xml` is not consulted, as today. When robots.txt lists none, or could not be read, `/sitemap.xml` is tried. [L6]
37. `access.sitemap_present`: [L6]

    | Situation | Status |
    | --- | --- |
    | a sitemap listed in robots.txt loads | `pass` |
    | none listed, and `/sitemap.xml` loads | `warn` |
    | sitemaps listed, and none of them loads | `fail`, evidence naming each listed URL and why it did not load |
    | none listed, and `/sitemap.xml` does not load | `fail` |

38. `access.sitemap_freshness` reads `<lastmod>` dates from the sitemap that loaded. It returns `skip` with `reason: "no sitemap"` when none loaded, and keeps its `skip` for no readable lastmod and its threshold comparison. [L6]

### Documentation

39. `CLAUDE.md`'s **Rate-limit probe safety constraints** say that the probe runs on every audit against the audited page, and stops on a 429, a `Retry-After` header or no answer. The lines "hits one cheap static asset" and "should stay opt-in and gated on verified domain ownership" are removed. [L2] [L3]
40. `agent-readiness-auditor-spec.md` §8's rate-limit safety constraints record, as built, that the probe runs on every audit against the audited page, with no opt-in and no ownership gate. [L2] [L3]
41. `CLAUDE.md`'s Section A text describes `captureAccess`, the access capture, the pure checks and the never-throw rule. It drops the paragraphs saying the probes predate never-throw, are not migrated off Crawlee, and are wrapped in `try`/`catch`. It no longer lists `robots-audit.ts` or `rate-limit-probe.ts` as Phase-1-only exceptions if the files change shape, and it adds Section A to the tests paragraph. [L1] [L9]
42. `GLOSSARY.md` gained **Agent probe** and **Access capture** during the interview and needs no further edit.

## Technical Decisions

- **Correctness, not a rewrite** [L1]. The spec fixes what gives wrong answers or loses findings. Crawlee is removed because its crawler's retry-and-drop behaviour is the `policy_divergence` bug, and its robots reader's throw-on-anything-but-404 is the robots bug. Nothing is rewritten only for style.
- **The rate-limit probe stays unlocked and on the audited page** [L2] [L3]. The product spec asked for opt-in, ownership verification and a static target. The user judged about 45 requests over 12 seconds, capped at 8 per second and stopping at the first sign of a limit, not to be an attack, and chose to measure what an agent actually meets. A cached `/robots.txt` may never reach a site's limiter. The docs change to match the code, rather than the code to match the docs.
- **Four outcomes, one charge each** [L4]. Each agent probe lands in exactly one outcome, and each check reads only the outcomes it is about, so no single refusal is counted twice. "No answer" counts as blocked because dropping connections is a real way sites refuse agents.
- **RFC 9309 for robots.txt** [L5]. It is what well-behaved agents do, so it is what an audit of agent access should report. The cost accepted: a single transient 5xx on robots.txt fails `robots_allows_agents` and caps the total at 20 for that run.
- **Site root for the gate, audited page for the probes** [L8]. The gate answers "has this site shut agents out?", which is a site question, so closing one folder must not cap a whole site. The probes answer "what does this agent receive for this page?", which only makes sense for agents robots.txt lets onto the page.
- **A sitemap is judged by its content** [L6]. This is the same lesson Section G drew from llms.txt: a 200 is not presence when a single-page app answers every path with its shell.
- **Parsing in the check, fetching in the probe** [L9]. This is Section G's split. robots.txt parsing is pure string work, so it lives in Phase 2, where a test can feed it a string. The rate-limit ramp is the exception that must decide in Phase 1, because whether to send the next request depends on the last response. Its stop rule is still a pure helper.

## Testing Strategy

The Test Seam is the established one: pure synchronous checks over literal captures, run with Node's built-in runner, with no network. [L9]

`accessFrom(overrides)` is added to `scraper/src/utils.ts` beside `snapshotFrom`, `documentFrom`, `llmsTxtFrom` and `findingFrom`. Its default is a healthy site, so a case states only the field it is about: [L9]

- a 200 robots.txt allowing every agent;
- every agent probed and got through;
- a completed rate-limit ramp;
- a robots.txt-listed sitemap that loads, with a recent `<lastmod>`.

Tests load the real `criteria.yaml` through `loadRulebook()`, because `baseline_mismatch` and `sitemap_freshness` read thresholds by name. Each file drives off a written list of expectations. [L9]

Required cases:

- **Outcome helper** [L4]: 200 → got through; 200 challenged → blocked; 402 → asked to pay; 403 → blocked; 503 → blocked; an error with no status → no answer.
- **`robots_allows_agents`** [L5] [L8]:
  - 200 allowing all → `pass`; blocking some → `warn`; blocking all → `fail`.
  - 404 → `pass`; 403 → `pass`.
  - 500 → `fail` with the status in evidence; no answer → `fail` with the error in evidence.
  - A robots.txt disallowing `/docs/` for one agent, with the audited page under `/docs/`: `pass` at the root, with that agent named as blocked from the page.
- **Agents to probe** [L8]: the helper deciding which agents to probe excludes an agent disallowed on the audited page's path, includes every agent for a 4xx robots.txt, and includes none for a 5xx.
- **`policy_divergence`** [L4]: the existing four cases, plus: a no-answer agent counts as blocked; a 402 agent is not counted; every agent no-answer → `fail`; the cause is recorded per agent.
- **`pay_per_crawl`** [L4]: a 402 → `warn`; none → `pass`; no probes → `skip`.
- **`baseline_mismatch`** [L4]: a blocked agent with an empty body is not compared; no agent got through → `skip` with `"no agent got through"`; a got-through agent with divergent text → `fail`.
- **Rate-limit stop rule** [L7]: 429 stops; a `Retry-After` header stops; no answer stops; 503 does not stop; 200 does not stop.
- **`rate_limit`** [L7]: completed → `pass`; each `stoppedBy` value → `warn` carrying `limitFoundAt` and `stoppedBy`.
- **Sitemap loads** [L6]: 200 with `<urlset` loads; 200 with `<sitemapindex` loads; 200 with an HTML body does not; 404 does not.
- **`sitemap_present`** [L6]: one case per row of requirement 37.
- **`sitemap_freshness`** [L6]: reads the loaded sitemap's dates; no sitemap loaded → `skip`.
- **Aggregator** [L9]: `accessFrom()` yields seven findings with the keys in requirement 4's order.

The Phase 1 fetches themselves are not unit-tested. They are verified manually. Nothing in a test catches what a check throws.

**Manual verification:**

- `pnpm scraper <url>` against a healthy site prints seven access findings, with the rate-limit evidence showing `stoppedBy`.
- Against a site that challenges agents, `policy_divergence` is `warn` or `fail` and names the causes.
- The run completes without the `try`/`catch`.
- `pnpm lint` and `pnpm --filter scraper test` pass.

## Out of Scope

- Latency capture per agent probe. [L1]
- Domain-ownership verification, and any opt-in flag for the rate-limit probe. [L1] [L2]
- Switching the rate-limit probe to a static asset. [L3]
- The sitemap coverage-gap check, which waits for the crawler. [L1]
- Tests for Section B.
- Any change to the rulebook's Section A weights, severities or gates.

## Open Questions

- **How many listed sitemaps to try.** Requirement 36 tries robots.txt-listed sitemaps in order until one loads. A robots.txt listing dozens of broken sitemaps would cost one request each. No cap was discussed.
- **A transient failure reads as a block** [L4] [L5]. A one-off network fault on our side makes an agent "no answer", or makes robots.txt "unreachable", and is charged to the site. For robots.txt that fires the cap-20 gate. This was accepted as the cost of following what agents actually experience, and has not been measured.
- **A sitemap body has no size ceiling.** A sitemap can be up to 50 MB, and the whole body is read to find `<lastmod>` dates.

## Follow-Ups

- Latency capture per agent probe, now that each probe is one request and easy to time.
- Domain-ownership verification, if the rate-limit probe's stance changes.
- Tests for Section B, the last section without them.
- The sitemap coverage-gap check, once the crawler exists.

## Notes

After this spec, a Section A crash can no longer leave access without findings: `robots_allows_agents` always returns `pass`, `warn` or `fail`. The scorecard's "total withheld because access could not be measured" path (Spec 0006, requirement 25) therefore has no remaining trigger in a normal run. It stays as a guard.

`GLOSSARY.md` gained **Agent probe** and **Access capture** during the interview. "Agent probe" replaces the code's "UA probe" wording (`ua-probe.ts`, `userAgentProb`). Renaming those identifiers is within this spec's reshaping of the section, but is not required by it.
