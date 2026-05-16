"use client";

import { ArrowUpRight, Check, CreditCard, Loader2, Search, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cards } from "@/lib/data";
import type { Recommendation } from "@/lib/types";
import styles from "./moneymaker-app.module.css";

const STORAGE_KEY = "moneymaker:selected-cards";
const DEFAULT_QUERY = "Patagonia Nano Puff Men's Medium Black";

type ApiState =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: Recommendation | null; error: null }
  | { status: "success"; data: Recommendation; error: null }
  | { status: "error"; data: Recommendation | null; error: string };

export function MoneymakerApp() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>(() =>
    cards.slice(0, 4).map((card) => card.id)
  );
  const [apiState, setApiState] = useState<ApiState>({ status: "idle", data: null, error: null });

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as string[];
      const validIds = new Set(cards.map((card) => card.id));
      const nextIds = parsed.filter((id) => validIds.has(id));
      if (nextIds.length > 0) {
        setSelectedCardIds(nextIds);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedCardIds));
  }, [selectedCardIds]);

  const selectedCards = useMemo(
    () => cards.filter((card) => selectedCardIds.includes(card.id)),
    [selectedCardIds]
  );

  async function submitRecommendation(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    setApiState((current) => ({ status: "loading", data: current.data, error: null }));

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          selectedCardIds
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Recommendation failed.");
      }

      setApiState({ status: "success", data: payload as Recommendation, error: null });
    } catch (error) {
      setApiState((current) => ({
        status: "error",
        data: current.data,
        error: error instanceof Error ? error.message : "Recommendation failed."
      }));
    }
  }

  function toggleCard(cardId: string) {
    setSelectedCardIds((current) => {
      if (current.includes(cardId)) {
        return current.length === 1 ? current : current.filter((id) => id !== cardId);
      }
      return [...current, cardId];
    });
  }

  const recommendation = apiState.data;

  return (
    <main className={styles.shell}>
      <section className={styles.workbench}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Moneymaker</p>
            <h1>Wallet-aware checkout math</h1>
          </div>
          <div className={styles.trust}>
            <ShieldCheck size={18} />
            <span>No card numbers</span>
          </div>
        </div>

        <div className={styles.grid}>
          <section className={styles.leftRail} aria-label="Wallet">
            <div className={styles.sectionTitle}>
              <WalletCards size={18} />
              <h2>Wallet</h2>
              <span>{selectedCardIds.length} selected</span>
            </div>

            <div className={styles.cardGrid}>
              {cards.map((card) => {
                const selected = selectedCardIds.includes(card.id);
                return (
                  <button
                    className={`${styles.cardButton} ${selected ? styles.cardSelected : ""}`}
                    key={card.id}
                    onClick={() => toggleCard(card.id)}
                    type="button"
                    aria-pressed={selected}
                  >
                    <span
                      className={styles.cardArt}
                      style={{ background: card.art.background, color: card.art.foreground }}
                    >
                      <CreditCard size={18} />
                      <span>{card.network}</span>
                    </span>
                    <span className={styles.cardText}>
                      <strong>{card.displayName}</strong>
                      <span>{card.issuer}</span>
                    </span>
                    <span className={styles.check}>{selected ? <Check size={16} /> : null}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.mainPanel}>
            <form className={styles.searchPanel} onSubmit={submitRecommendation}>
              <label htmlFor="product-query">Product</label>
              <div className={styles.searchRow}>
                <Search className={styles.searchIcon} size={20} />
                <input
                  id="product-query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Paste a product URL or enter a product name"
                />
                <button disabled={apiState.status === "loading"} type="submit">
                  {apiState.status === "loading" ? <Loader2 className={styles.spin} size={18} /> : <Search size={18} />}
                  <span>Rank cards</span>
                </button>
              </div>
            </form>

            {apiState.error ? <div className={styles.error}>{apiState.error}</div> : null}
            {recommendation?.warnings.length ? (
              <div className={styles.warningStack} aria-label="Recommendation warnings">
                {recommendation.warnings.map((warning) => (
                  <div className={styles.warning} key={warning.code}>
                    <strong>{warning.code.replaceAll("_", " ").toLowerCase()}</strong>
                    <span>{warning.message}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className={styles.statusAndSummary}>
              <section className={styles.statusPanel} aria-label="Agent status">
                <div className={styles.sectionTitle}>
                  <Loader2 className={apiState.status === "loading" ? styles.spin : ""} size={18} />
                  <h2>Agent run</h2>
                </div>
                <ol>
                  {(recommendation?.statusLog ?? idleStatus(apiState.status)).map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ol>
              </section>

              <section className={styles.summaryPanel}>
                <p className={styles.kicker}>Recommendation</p>
                <h2>{recommendation?.product.title ?? "Ready for a product"}</h2>
                <p>{recommendation?.explanation ?? "Run the demo query to compare prices, rewards, and offers."}</p>
                {recommendation ? (
                  <div className={styles.qualityLine}>
                    <span>Source: {recommendation.dataQuality.resultSource}</span>
                    <span>Live check: {recommendation.dataQuality.liveLookupSucceeded ? "succeeded" : "not used"}</span>
                    {recommendation.dataQuality.demoMode ? <span>Demo mode</span> : null}
                  </div>
                ) : null}
              </section>
            </div>

            <section className={styles.results} aria-label="Ranked options">
              {(recommendation?.results ?? []).map((result) => (
                <article className={styles.resultCard} key={`${result.retailerId}-${result.cardId}`}>
                  <div className={styles.resultRank}>#{result.rank}</div>
                  <div className={styles.resultMain}>
                    <div className={styles.resultHeader}>
                      <div>
                        <h3>{result.retailerName}</h3>
                        <p>{result.cardName}</p>
                      </div>
                      <div className={styles.priceBlock}>
                        <span>{formatCurrency(result.effectivePrice)}</span>
                        <small>effective</small>
                      </div>
                    </div>

                    <div className={styles.mathRows}>
                      <MathRow label="List price" value={result.listPrice} tone="base" />
                      {result.lineItems.map((lineItem) => (
                        <MathRow key={`${lineItem.kind}-${lineItem.label}`} label={lineItem.label} value={lineItem.amount} />
                      ))}
                    </div>

                    <div className={styles.resultFooter}>
                      <span className={`${styles.badge} ${styles[result.source]}`}>{result.source}</span>
                      <span>{formatCurrency(result.savings)} value found</span>
                      <a href={result.url} target="_blank" rel="noreferrer">
                        Open <ArrowUpRight size={15} />
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}

function MathRow({ label, value, tone = "discount" }: { label: string; value: number; tone?: "base" | "discount" }) {
  return (
    <div className={styles.mathRow}>
      <span>{label}</span>
      <strong>{tone === "base" ? formatCurrency(value) : `-${formatCurrency(value)}`}</strong>
    </div>
  );
}

function idleStatus(status: ApiState["status"]) {
  if (status === "loading") {
    return ["Starting recommendation run", "Identifying product", "Checking retailer data"];
  }
  return ["Wallet loaded", "Cached demo products ready", "Deterministic scorer ready"];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}
