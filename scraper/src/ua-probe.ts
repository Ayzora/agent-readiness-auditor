import { AGENTS, type Agent, type RobotsAudit } from "./types.ts";
import { PlaywrightCrawler, RequestQueue } from 'crawlee';


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



async function runCustomCrawler(url: string, userAgent: string) {
    let htmlContent = '';
    let statusCode = null;

    // Each call needs its own queue — a shared/default one remembers this
    // URL as "already handled" after the first agent visits it, so every
    // later agent's request gets silently skipped.
    const requestQueue = await RequestQueue.open(`ua-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const crawler = new PlaywrightCrawler({
        requestQueue,
        browserPoolOptions: {
            useFingerprints: false,
        },
        launchContext: {
            launchOptions: {
                userAgent: userAgent,
                headless: true
            },
        },
        async requestHandler({ page, response }) {
            statusCode = response?.status();
            htmlContent = await page.content();
        },
        failedRequestHandler({ request, log }) {
            log.error(`Failed: ${request.url}`);
        },
    });

    await crawler.run([url]);
    await requestQueue.drop();

    return { statusCode, htmlContent }

}


export async function userAgentProb(results: Record<Agent, boolean>, url: string) {
    let allowedAgents = AGENTS.filter((agent) => results[agent])
    let res = []

    for(let i = 0; i < allowedAgents.length; i++){
        let item = await runCustomCrawler(url, USER_AGENT_STRINGS[allowedAgents[i]])
        res.push(item)

    }
    return res

}





