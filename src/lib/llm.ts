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

    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
    lineItems: result.lineItems.map((lineItem) => ({
      label: lineItem.label,
      amount: lineItem.amount
    }))
  }));

  const prompt = [
    "Write one concise shopper-facing explanation for the winning retailer-card pair.",
    "Use only the supplied numbers. Do not invent offers, rewards, or prices.",
    "Mention the winning effective price and the largest driver. Keep it under 45 words.",
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
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/v1/responses`, {
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
    const text =
      payload.output_text?.trim() ||
      payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text?.trim();

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

function getProvider(): ChatProvider | null {
  if (process.env.DASHSCOPE_API_KEY) {
    return {
      name: "qwen",
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseUrl: process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      model: process.env.QWEN_MODEL || "qwen-plus",
      endpoint: "chat"
    };
  }

  if (process.env.TOKENROUTER_API_KEY) {
    return {
      name: "tokenrouter",
      apiKey: process.env.TOKENROUTER_API_KEY,
      baseUrl: process.env.TOKENROUTER_BASE_URL ?? "https://api.tokenrouter.io",
      model: process.env.TOKENROUTER_MODEL || "auto",
      endpoint: "responses"
    };
  }

  if (process.env.ZAI_API_KEY) {
    return {
      name: "zai",
      apiKey: process.env.ZAI_API_KEY,
      baseUrl: process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4",
      model: process.env.ZAI_MODEL || "glm-5.1",
      endpoint: "chat"
    };
  }

  return null;
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
