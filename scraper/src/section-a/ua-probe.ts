import {
    AGENTS,
    type Agent,
    type AgentsProbeResult,
    type BaselineMisMatch,
    type PayPerCrawlFinding,
    type PolicyDivergenceFinding,
    type RobotsAudit,
} from "../types.ts";
import { PlaywrightController, PlaywrightCrawler, RequestQueue } from 'crawlee';
import { HttpCrawler, log, LogLevel } from 'crawlee';
import { type ProbeResult } from "../types.ts";


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


//Mimic a real user visit to the website (Baseline)
export async function humanCrawler(url: string): Promise<ProbeResult> {
    let htmlContent = '';
    let statusCode = null;
    let isChallenged = null;

    const requestQueue = await RequestQueue.open(`ua-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const crawler = new PlaywrightCrawler({
        requestQueue,
        useSessionPool: false,
        launchContext: {
            launchOptions: {
                headless: true,
            },

        },
        async requestHandler({ page, response }) {
            htmlContent = await page.content();
            statusCode = response?.status();
            isChallenged = await response?.headerValue('cf-mitigated') === "challenge";
        }

    });

    try {
        await crawler.run([url]);
    } finally {
        await requestQueue.drop();
    }

    return { statusCode, htmlContent, isChallenged }
}


async function userAgentCrawler(url: string, userAgentString: string): Promise<ProbeResult> {
    let htmlContent = '';
    let statusCode = null;
    let isChallenged = null;

    const requestQueue = await RequestQueue.open(`ua-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const crawler = new HttpCrawler({
        requestQueue,
        useSessionPool: false,
        additionalMimeTypes: ['*/*'],
        preNavigationHooks: [
            async (crawlingContext, gotOptions) => {
                gotOptions.headers = {
                    ...gotOptions.headers,
                    'user-agent': userAgentString
                };
            },
        ],
        async requestHandler({ response, body }) {
            statusCode = response?.statusCode;
            htmlContent = body.toString('utf-8');
            //Detect for cloudflare challenge page
            isChallenged = response?.headers['cf-mitigated'] === "challenge";
        },
        failedRequestHandler({ request, log }) {
            log.error(`Failed: ${request.url}`);
        },
    });

    try {
        await crawler.run([url]);
    } finally {
        await requestQueue.drop();
    }

    return { statusCode, htmlContent, isChallenged }

}


export async function userAgentProb(robotsResults: Record<Agent, boolean>, url: string): Promise<AgentsProbeResult[]> {
    let allowedAgents = AGENTS.filter((agent) => robotsResults[agent])
    let probeResults = [];

    for (let index = 0; index < allowedAgents.length; index++) {
        let probeResult = await userAgentCrawler(url, USER_AGENT_STRINGS[allowedAgents[index]])
        probeResults.push({ userAgent: allowedAgents[index], ...probeResult })

    }
    return probeResults
}


export function payPerCrawlDetected(agentResults: AgentsProbeResult[]): PayPerCrawlFinding {
    const agents = agentResults
        .filter((result) => result.statusCode === 402)
        .map((result) => result.userAgent);

    return { detected: agents.length > 0, agents };
}


export function findPolicyDivergentAgents(agentResults: AgentsProbeResult[]): PolicyDivergenceFinding {
    const agents = agentResults
        .filter((result) => result.isChallenged || (result.statusCode ?? 0) >= 400)
        .map((result) => result.userAgent);

    return { agents };
}


export function findBaselineMismatchedAgents(baseline: ProbeResult, agentProbs: AgentsProbeResult[]): BaselineMisMatch[] {

    let mismatched: BaselineMisMatch[] = [];

    for (const agent of agentProbs) {
        if (agent.htmlContent !== baseline.htmlContent) {
            mismatched.push({
                mismatchedAgents: agent.userAgent,
                baselineHtml: baseline.htmlContent,
                agentUaHtml: agent.htmlContent
            });
        }
    }

    return mismatched
}

