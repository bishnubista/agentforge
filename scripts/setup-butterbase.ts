const apiKey = process.env.BUTTERBASE_API_KEY;
const appId = process.env.BUTTERBASE_APP_ID;
const configuredBase = process.env.BUTTERBASE_API_BASE || process.env.BUTTERBASE_BASE_URL || "https://api.butterbase.ai";

if (!apiKey || !appId) {
  throw new Error("BUTTERBASE_API_KEY and BUTTERBASE_APP_ID are required.");
}

const schema = {
  schema: {
    tables: {
      recommendation_runs: {
        columns: {
          id: { type: "uuid", default: "gen_random_uuid()" },
          query: { type: "text", nullable: false },
          product: { type: "jsonb", nullable: false },
          selected_card_ids: { type: "jsonb", nullable: false },
          best_result: { type: "jsonb" },
          result_count: { type: "integer", default: "0" },
          created_at: { type: "timestamptz", default: "now()" }
        },
        indexes: {
          idx_recommendation_runs_created_at: { columns: ["created_at"] }
        }
      },
      recommendation_logs: {
        columns: {
          id: { type: "uuid", default: "gen_random_uuid()" },
          query: { type: "text", nullable: false },
          product_title: { type: "text", nullable: false },
          product_brand: { type: "text" },
          selected_cards: { type: "text" },
          best_retailer: { type: "text" },
          best_card: { type: "text" },
          effective_price: { type: "numeric" },
          result_count: { type: "integer", default: "0" },
          source: { type: "text" },
          created_at: { type: "timestamptz", default: "now()" }
        },
        indexes: {
          idx_recommendation_logs_created_at: { columns: ["created_at"] }
        }
      }
    }
  },
  dry_run: false,
  name: "create recommendation log history"
};

const apiBase = normalizeButterbaseBase(configuredBase, appId);

const response = await fetch(`${apiBase}/schema/apply`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify(schema)
});

if (!response.ok) {
  throw new Error(`Butterbase schema apply failed with HTTP ${response.status}`);
}

console.log("Butterbase recommendation_logs schema is ready.");

function normalizeButterbaseBase(base: string, appId: string) {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.includes(`/v1/${appId}`) ? trimmed : `${trimmed}/v1/${appId}`;
}

export {};
