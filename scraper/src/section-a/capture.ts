import { setTimeout as sleep } from "node:timers/promises";
import { gotScraping } from "got-scraping";
import type {
  AccessCapture,
  Agent,
  AgentProbe,
  RateLimitCapture,
  RobotsTxtCapture,
  SitemapFetch,
} from "../types.ts";
import { agentsToProbe, readRobots } from "./robots.ts";
import { rateLimitStop } from "./rate-limit.ts";
import { sitemapLoads } from "./sitemap.ts";

// Matches the page capture's raw fetch, so an agent gets as long as the baseline did.
const AGENT_TIMEOUT_MS = 15_000;
const RATE_LIMIT_TIMEOUT_MS = 10_000;
const FILE_TIMEOUT_MS = 10_000;

const RATES = [1, 2, 4, 8]; // requests/second, hard cap 10
const STEP_MILLIS = 3000; // hold each rate this long

const USER_AGENT_STRINGS: Record<Agent, string> = {
  "ChatGPT-User": "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
  "Claude-User": "Mozilla/5.0 (compatible; Claude-User/1.0; +https://www.anthropic.com/claude-user)",
  "Perplexity-User": "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  "MistralAI-User": "Mozilla/5.0 (compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)",
  "Meta-ExternalFetcher": "meta-externalfetcher/1.1",
  "Amzn-User": "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
  "Google-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Google-Agent/1.0)",
  "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
  "Claude-SearchBot": "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com/claude-searchbot)",
  "xSeek": "Mozilla/5.0 (compatible; xSeek/1.0)",
  "PerplexityBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "DuckAssistBot": "Mozilla/5.0 (compatible; DuckAssistBot/1.0; +https://duckduckgo.com/duckassistbot)",
  "MistralAI-Index": "Mozilla/5.0 (compatible; MistralAI-Index/1.0; +https://docs.mistral.ai/robots)",
  "Amzn-SearchBot": "Mozilla/5.0 (compatible; Amazon-SearchBot/1.0; +https://developer.amazon.com/support/amazonbot)",
  "Bingbot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Safari/537.36",
  "Googlebot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Safari/537.36",
};

// Every Section A fetch, once per run. Never throws: a failed fetch leaves its
// fields null and an `error` on its own part of the capture.
export async function captureAccess(url: string): Promise<AccessCapture> {
  const robots = await fetchRobots(url);
  const agentProbes = await probeAgents(url, agentsToProbe(robots, url));
  const rateLimit = await rampRequests(url);
  const sitemaps = await fetchSitemaps(url, readRobots(robots).sitemaps);

  return { robots, agentProbes, rateLimit, sitemaps };
}

async function fetchRobots(url: string): Promise<RobotsTxtCapture> {
  const robotsUrl = new URL("/robots.txt", url).href;
  const { statusCode, body, error } = await fetchFile(robotsUrl);
  return { url: robotsUrl, statusCode, body, error };
}

// One at a time, one request each: a retry would hit the site again for an
// answer that has already been given.
async function probeAgents(url: string, agents: Agent[]): Promise<AgentProbe[]> {
  const probes: AgentProbe[] = [];

  for (const agent of agents) {
    try {
      const response = await gotScraping({
        url,
        headers: { "user-agent": USER_AGENT_STRINGS[agent] },
        throwHttpErrors: false,
        retry: { limit: 0 },
        timeout: { request: AGENT_TIMEOUT_MS },
      });
      probes.push({
        agent,
        statusCode: response.statusCode,
        challenged: response.headers["cf-mitigated"] === "challenge",
        body: response.body,
        error: null,
      });
    } catch (error) {
      probes.push({ agent, statusCode: null, challenged: false, body: null, error: describe(error) });
    }
  }

  return probes;
}

// Puts deliberate load on someone else's server; see CLAUDE.md before changing it.
async function rampRequests(url: string): Promise<RateLimitCapture> {
  for (const rps of RATES) {
    const stepStart = performance.now();
    let requestsSent = 0;

    while (performance.now() - stepStart < STEP_MILLIS) {
      let response = null;
      let error = null;
      try {
        response = await gotScraping({
          url,
          throwHttpErrors: false,
          retry: { limit: 0 },
          followRedirect: false,
          timeout: { request: RATE_LIMIT_TIMEOUT_MS },
        });
      } catch (caught) {
        error = describe(caught);
      }
      requestsSent += 1;

      const stoppedBy = rateLimitStop(response);
      if (stoppedBy !== null) return { limitFoundAt: rps, stoppedBy, error };

      const nextSlot = stepStart + (requestsSent / rps) * 1000;
      await sleep(Math.max(0, nextSlot - performance.now()));
    }
  }

  return { limitFoundAt: null, stoppedBy: null, error: null };
}

// Listed sitemaps are tried in order until one loads; /sitemap.xml only when
// robots.txt listed none.
async function fetchSitemaps(url: string, listed: string[]): Promise<AccessCapture["sitemaps"]> {
  const source = listed.length > 0 ? "robots.txt" : "default";
  const candidates = listed.length > 0 ? listed : [new URL("/sitemap.xml", url).href];
  const fetches: SitemapFetch[] = [];

  for (const candidate of candidates) {
    const fetch = { url: candidate, ...(await fetchFile(candidate)) };
    fetches.push(fetch);
    if (sitemapLoads(fetch)) break;
  }

  return { source, fetches };
}

async function fetchFile(
  url: string,
): Promise<{ statusCode: number | null; body: string | null; error: string | null }> {
  try {
    const response = await gotScraping({
      url,
      throwHttpErrors: false,
      retry: { limit: 0 },
      timeout: { request: FILE_TIMEOUT_MS },
    });
    return { statusCode: response.statusCode, body: response.body, error: null };
  } catch (error) {
    return { statusCode: null, body: null, error: describe(error) };
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0].trim();
}
