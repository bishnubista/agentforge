export function envFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function envPositiveInteger(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function hasBrightDataConfig() {
  return Boolean(process.env.BRIGHT_DATA_API_KEY || process.env.BRIGHTDATA_API_KEY || process.env.BRIGHTDATA_API_TOKEN);
}

export function activeLlmProvider() {
  if (process.env.DASHSCOPE_API_KEY) {
    return "qwen" as const;
  }
  if (process.env.TOKENROUTER_API_KEY) {
    return "tokenrouter" as const;
  }
  if (process.env.ZAI_API_KEY) {
    return "zai" as const;
  }
  return null;
}

export function getBrightDataApiKey() {
  return process.env.BRIGHT_DATA_API_KEY || process.env.BRIGHTDATA_API_KEY || process.env.BRIGHTDATA_API_TOKEN || "";
}

export function getButterbaseConfig() {
  const apiKey = process.env.BUTTERBASE_API_KEY;
  const appId = process.env.BUTTERBASE_APP_ID;
  const configuredBase = process.env.BUTTERBASE_API_BASE || process.env.BUTTERBASE_BASE_URL || "https://api.butterbase.ai";

  if (!apiKey || !appId) {
    return null;
  }

  return {
    apiKey,
    appId,
    apiBase: normalizeButterbaseBase(configuredBase, appId)
  };
}

function normalizeButterbaseBase(apiBase: string, appId: string) {
  const trimmed = apiBase.replace(/\/$/, "");
  return trimmed.includes(`/v1/${appId}`) ? trimmed : `${trimmed}/v1/${appId}`;
}
