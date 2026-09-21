import { type LlmsTxtCapture } from "../types.ts";

export async function captureLlmsTxt(url: string): Promise<LlmsTxtCapture> {
  const path = new URL("/llms.txt", url).href;

  try {
    const response = await fetch(path, { signal: AbortSignal.timeout(10_000) });
    const body = await response.text()
    return {
      url: path,
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
      body,
      bytes: Buffer.byteLength(body),
      error: null,
    };
  } catch (error) {
    return {
      url: path,
      statusCode: null,
      contentType: null,
      body: null,
      bytes: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
