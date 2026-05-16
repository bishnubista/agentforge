import type { Product, ScoredOption } from "./types";
import { envPositiveInteger } from "./env";
import { logger } from "./logger";

type ProductExtraction = Product & {
  normalizedQuery?: string;
};

type ChatProvider = {
  name: "qwen" | "zai" | "tokenrouter";
  apiKey: string;
  baseUrl: string;
  model: string;
  endpoint: "chat" | "responses";
};

export type LlmIntentClassification = {
  intent: "product_price_compare" | "merchant_card_pick" | "category_card_pick" | "unknown";
  merchantName?: string;
  category?: string;
  confidence?: number;
  normalizedQuery?: string;
};

export async function classifyIntentWithLlm(
  query: string,
  requestId?: string
): Promise<LlmIntentClassification | null> {
  const providers = getProviders("intent");
  const llmLogger = logger.child({
    module: "llm",
    requestId,
    operation: "intent_classification"
  });
  if (providers.length === 0) {
    llmLogger.debug("LLM intent classification skipped because no provider is configured");
    return null;
  }

  for (const provider of providers) {
    const result = await classifyIntentWithProvider({ provider, query, requestId });
    if (result) {
      return result;
    }
  }

  return null;
}

async function classifyIntentWithProvider({
  provider,
  query,
  requestId
}: {
  provider: ChatProvider;
  query: string;
  requestId?: string;
}): Promise<LlmIntentClassification | null> {
  const llmLogger = logger.child({
    module: "llm",
    requestId,
    operation: "intent_classification",
    provider: provider.name
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envPositiveInteger("INTENT_LLM_TIMEOUT_MS", 2500));
  const prompt =
    "Classify this shopping query. Return strict JSON with intent, merchantName, category, confidence, normalizedQuery. " +
    "intent must be one of product_price_compare, merchant_card_pick, category_card_pick, unknown. " +
    "Bare store names like Starbucks should be merchant_card_pick. Product names like Starbucks Frappuccino bottle should be product_price_compare. " +
    "Categories include dining, grocery, gas, travel, electronics, home_goods, sporting_goods, general_merchandise.\n" +
    `Query: ${query}`;

  try {
    const response =
      provider.endpoint === "responses"
        ? await fetch(responsesUrl(provider), {
            method: "POST",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify({
              model: provider.model,
              input: prompt,
              max_output_tokens: 160,
              response_format: { type: "json_object" }
            })
          })
        : await fetch(chatCompletionsUrl(provider), {
            method: "POST",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify({
              model: provider.model,
              temperature: 0,
              max_tokens: 160,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: "You are a fast router for a shopping rewards app. Output only valid JSON."
                },
                {
                  role: "user",
                  content: prompt
                }
              ]
            })
          });

    if (!response.ok) {
      llmLogger.warn("LLM intent classification returned a non-OK response", {
        status: response.status,
        statusText: response.statusText,
        queryLength: query.length,
        model: provider.model
      });
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const content =
      payload.choices?.[0]?.message?.content?.trim() ||
      extractResponsesText(payload);

    return content ? parseIntentClassification(content) : null;
  } catch (error) {
    llmLogger.warn("LLM intent classification provider failed; trying next provider if configured", {
      error,
      queryLength: query.length,
      model: provider.model
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractProductWithLlm(query: string, requestId?: string): Promise<ProductExtraction | null> {
  const provider = getProvider();
  const llmLogger = logger.child({
    module: "llm",
    requestId,
    operation: "product_extraction",
    provider: provider?.name
  });
  if (!provider) {
    llmLogger.debug("LLM product extraction skipped because no provider is configured");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envPositiveInteger("LLM_TIMEOUT_MS", 4000));

  try {
    if (provider.endpoint !== "chat") {
      llmLogger.debug("LLM product extraction skipped for non-chat provider endpoint", {
        endpoint: provider.endpoint
      });
      return null;
    }

    const response = await fetch(chatCompletionsUrl(provider), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract a shopping product from user input. Return strict JSON with title, brand, category, mccFamily, confidence, normalizedQuery. Do not include prices or rewards."
          },
          {
            role: "user",
            content: query
          }
        ]
      })
    });

    if (!response.ok) {
      llmLogger.warn("LLM product extraction returned a non-OK response", {
        status: response.status,
        statusText: response.statusText,
        queryLength: query.length,
        model: provider.model
      });
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      llmLogger.warn("LLM product extraction response did not include message content", {
        model: provider.model
      });
      return null;
    }

    return parseProductExtraction(content);
  } catch (error) {
    llmLogger.warn("LLM product extraction failed; keyword fallback may be used", {
      error,
      queryLength: query.length,
      model: provider.model
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function explainWithLlm({
  product,
  results,
  requestId
}: {
  product: Product;
  results: ScoredOption[];
  requestId?: string;
}): Promise<{ text: string; provider: string } | null> {
  const provider = getProvider();
  const llmLogger = logger.child({
    module: "llm",
    requestId,
    operation: "recommendation_explanation",
    provider: provider?.name
  });
  if (!provider || results.length === 0) {
    llmLogger.debug("LLM explanation skipped", {
      hasProvider: Boolean(provider),
      resultCount: results.length
    });
    return null;
  }

  const rankedOptions = results.slice(0, 3).map((result) => ({
    rank: result.rank,
    retailer: result.retailerName,
    card: result.cardName,
    listPrice: result.listPrice,
    effectivePrice: result.effectivePrice,
    source: result.source,
    lineItems: result.lineItems.map((lineItem) => ({
      label: lineItem.label,
      amount: lineItem.amount
    }))
  }));

  const prompt = [
    "Write one concise shopper-facing explanation for the winning retailer-card pair.",
    "Use only the supplied numbers. Do not invent offers, rewards, or prices.",
    results.some((result) => result.source === "estimated")
      ? "For estimated results, call the $100 input a benchmark spend, mention the after-rewards benchmark, and do not imply a live product price was found. Keep it under 45 words."
      : "Mention the winning effective price and the largest driver. Keep it under 45 words.",
    JSON.stringify({ product, rankedOptions })
  ].join("\n");

  if (provider.endpoint === "responses") {
    return explainWithResponsesProvider(provider, prompt, requestId);
  }

  return explainWithChatProvider(provider, prompt, requestId);
}

async function explainWithChatProvider(provider: ChatProvider, prompt: string, requestId?: string) {
  const llmLogger = logger.child({
    module: "llm",
    requestId,
    operation: "recommendation_explanation",
    provider: provider.name
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envPositiveInteger("LLM_TIMEOUT_MS", 4000));

  try {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You explain deterministic credit-card reward math. Be precise and concise."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      llmLogger.warn("LLM chat explanation returned a non-OK response", {
        status: response.status,
        statusText: response.statusText,
        model: provider.model
      });
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    return text ? { text, provider: provider.name } : null;
  } catch (error) {
    llmLogger.warn("LLM chat explanation failed; deterministic explanation will be used", {
      error,
      model: provider.model
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function explainWithResponsesProvider(provider: ChatProvider, prompt: string, requestId?: string) {
  const llmLogger = logger.child({
    module: "llm",
    requestId,
    operation: "recommendation_explanation",
    provider: provider.name
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envPositiveInteger("LLM_TIMEOUT_MS", 4000));

  try {
    const response = await fetch(responsesUrl(provider), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        input: prompt
      })
    });

    if (!response.ok) {
      llmLogger.warn("LLM responses explanation returned a non-OK response", {
        status: response.status,
        statusText: response.statusText,
        model: provider.model
      });
      return null;
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const text = extractResponsesText(payload);

    return text ? { text, provider: provider.name } : null;
  } catch (error) {
    llmLogger.warn("LLM responses explanation failed; deterministic explanation will be used", {
      error,
      model: provider.model
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getProvider(purpose: "default" | "intent" = "default"): ChatProvider | null {
  return getProviders(purpose)[0] ?? null;
}

function responsesUrl(provider: ChatProvider) {
  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  return baseUrl.endsWith("/v1") ? `${baseUrl}/responses` : `${baseUrl}/v1/responses`;
}

function chatCompletionsUrl(provider: ChatProvider) {
  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  return baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
}

function extractResponsesText(payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}) {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text?.trim())
    .filter((text): text is string => Boolean(text))
    .at(-1);
}

function getProviders(purpose: "default" | "intent" = "default"): ChatProvider[] {
  const tokenRouter: ChatProvider | null = process.env.TOKENROUTER_API_KEY
    ? {
        name: "tokenrouter" as const,
        apiKey: process.env.TOKENROUTER_API_KEY,
        baseUrl: process.env.TOKENROUTER_BASE_URL ?? "https://api.tokenrouter.com/v1",
        model:
          purpose === "intent"
            ? process.env.TOKENROUTER_INTENT_MODEL ||
              process.env.INTENT_LLM_MODEL ||
              process.env.TOKENROUTER_MODEL ||
              "xiaomi/mimo-v2-flash"
            : process.env.TOKENROUTER_MODEL || "auto:balance",
        endpoint: purpose === "intent" ? ("chat" as const) : ("responses" as const)
      }
    : null;
  const qwen: ChatProvider | null = process.env.DASHSCOPE_API_KEY
    ? {
        name: "qwen" as const,
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseUrl: process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        model:
          purpose === "intent"
            ? process.env.QWEN_INTENT_MODEL || process.env.INTENT_LLM_MODEL || "qwen-turbo"
            : process.env.QWEN_MODEL || "qwen-plus",
        endpoint: "chat" as const
      }
    : null;
  const zai: ChatProvider | null = process.env.ZAI_API_KEY
    ? {
        name: "zai" as const,
        apiKey: process.env.ZAI_API_KEY,
        baseUrl: process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4",
        model:
          purpose === "intent"
            ? process.env.ZAI_INTENT_MODEL || process.env.INTENT_LLM_MODEL || process.env.ZAI_MODEL || "glm-5.1"
            : process.env.ZAI_MODEL || "glm-5.1",
        endpoint: "chat" as const
      }
    : null;

  return purpose === "intent"
    ? [tokenRouter, qwen, zai].filter((provider): provider is ChatProvider => Boolean(provider))
    : [qwen, tokenRouter, zai].filter((provider): provider is ChatProvider => Boolean(provider));
}

function parseIntentClassification(content: string): LlmIntentClassification | null {
  try {
    const parsed = JSON.parse(extractJsonObject(content)) as Partial<LlmIntentClassification>;
    if (
      parsed.intent !== "product_price_compare" &&
      parsed.intent !== "merchant_card_pick" &&
      parsed.intent !== "category_card_pick" &&
      parsed.intent !== "unknown"
    ) {
      logger.warn("LLM intent classification JSON had invalid intent", {
        module: "llm",
        contentLength: content.length,
        intent: parsed.intent
      });
      return null;
    }

    return {
      intent: parsed.intent,
      merchantName: parsed.merchantName,
      category: parsed.category,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
      normalizedQuery: parsed.normalizedQuery
    };
  } catch (error) {
    logger.warn("LLM intent classification response was not valid JSON", {
      module: "llm",
      error,
      contentLength: content.length
    });
    return null;
  }
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) {
    return fenced;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseProductExtraction(content: string): ProductExtraction | null {
  try {
    const parsed = JSON.parse(content) as Partial<ProductExtraction>;
    if (!parsed.title || !parsed.brand || !parsed.category || !parsed.mccFamily) {
      logger.warn("LLM product extraction JSON missed required fields", {
        module: "llm",
        contentLength: content.length,
        hasTitle: Boolean(parsed.title),
        hasBrand: Boolean(parsed.brand),
        hasCategory: Boolean(parsed.category),
        hasMccFamily: Boolean(parsed.mccFamily)
      });
      return null;
    }

    return {
      title: parsed.title,
      brand: parsed.brand,
      category: parsed.category,
      mccFamily: parsed.mccFamily,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.65,
      normalizedQuery: parsed.normalizedQuery
    };
  } catch (error) {
    logger.warn("LLM product extraction response was not valid JSON", {
      module: "llm",
      error,
      contentLength: content.length
    });
    return null;
  }
}
