"use client";

import { ArrowRight, ArrowUpRight, BarChart3, Check, CreditCard, Loader2, Search, Sparkles, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cards } from "@/lib/data";
import { logger } from "@/lib/logger";
import type { Recommendation } from "@/lib/types";
import styles from "./moneymaker-app.module.css";

const STORAGE_KEY = "moneymaker:selected-cards";
const DEFAULT_QUERY = "";
const RUN_STEPS = [
  "Identifying product",
  "Checking live and fallback coverage",
  "Filtering retailer prices",
  "Scoring wallet rewards",
  "Building explanation",
  "Finalizing recommendation"
];
const SUGGESTED_QUERIES = [
  { label: "Sony WH-1000XM5", kind: "product" },
  { label: "Patagonia Nano Puff", kind: "product" },
  { label: "Costco groceries", kind: "card pick" },
  { label: "Best card for gas", kind: "category" },
  { label: "Starbucks", kind: "card pick" },
  { label: "Garmin Fenix 8", kind: "product" }
];
const appLogger = logger.child({ module: "moneymaker-app" });
type ActiveView = "search" | "wallet" | "results";

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
  const [activeView, setActiveView] = useState<ActiveView>("search");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

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
    } catch (error) {
      appLogger.warn("Stored wallet selection was invalid and has been reset", { error });
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedCardIds));
  }, [selectedCardIds]);

  useEffect(() => {
    if (apiState.status !== "loading") {
      return;
    }

    setLoadingStepIndex(0);
    const interval = window.setInterval(() => {
      setLoadingStepIndex((current) => Math.min(current + 1, RUN_STEPS.length - 1));
    }, 1150);

    return () => window.clearInterval(interval);
  }, [apiState.status]);

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

    setLoadingStepIndex(0);
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

      const requestId = response.headers.get("x-request-id");
      const payload = await response.json().catch((error) => {
        appLogger.warn("Recommendation API response was not valid JSON", {
          error,
          status: response.status,
          requestId
        });
        return null;
      });
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Recommendation failed.";
        throw new Error(requestId ? `${message} Request id: ${requestId}` : message);
      }
      if (!payload) {
        throw new Error(requestId ? `Recommendation failed. Request id: ${requestId}` : "Recommendation failed.");
      }

      setApiState({ status: "success", data: payload as Recommendation, error: null });
    } catch (error) {
      appLogger.error("Recommendation request failed in browser", {
        error,
        queryLength: trimmed.length,
        selectedCardCount: selectedCardIds.length
      });
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
        <header className={styles.topbar}>
          <button className={styles.brand} type="button" onClick={() => setActiveView("search")} aria-label="Rewardr home">
            <span>r</span>
            <strong>
              reward<em>r</em>
            </strong>
          </button>
          <nav className={styles.nav} aria-label="Primary">
            <button
              className={activeView === "search" ? styles.navActive : ""}
              type="button"
              onClick={() => setActiveView("search")}
              aria-current={activeView === "search" ? "page" : undefined}
            >
              <Search size={16} />
              Search
            </button>
            <button
              className={activeView === "wallet" ? styles.navActive : ""}
              type="button"
              onClick={() => setActiveView("wallet")}
              aria-current={activeView === "wallet" ? "page" : undefined}
            >
              <CreditCard size={16} />
              Wallet
            </button>
            <button
              className={activeView === "results" ? styles.navActive : ""}
              type="button"
              onClick={() => setActiveView("results")}
              aria-current={activeView === "results" ? "page" : undefined}
            >
              <BarChart3 size={16} />
              Dashboard
            </button>
          </nav>
        </header>

        {activeView === "search" ? (
          <>
            <section className={styles.hero}>
              <div className={styles.heroCopy}>
                <p className={styles.kicker}>
                  <Sparkles size={14} />
                  AI-Powered Agent
                </p>
                <h1>
                  What are you <em>buying?</em>
                </h1>
                <p>
                  A product, a brand, a store. The AI agent searches the web in real-time, compares prices, and picks
                  the best card from your wallet.
                </p>

                <form className={styles.searchPanel} onSubmit={submitRecommendation}>
                  <label htmlFor="product-query">Product search</label>
                  <div className={styles.searchRow}>
                    <Search className={styles.searchIcon} size={22} />
                    <input
                      id="product-query"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder='Try "Sony WH-1000XM5" or "Costco" or "best card for dining"'
                    />
                    <button disabled={apiState.status === "loading"} type="submit">
                      {apiState.status === "loading" ? (
                        <Loader2 className={styles.spin} size={18} />
                      ) : (
                        <>
                          <span>Ask</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className={styles.suggested} aria-label="Suggested searches">
                  <span>Try:</span>
                  {SUGGESTED_QUERIES.map((suggestion) => (
                    <button
                      key={`${suggestion.label}-${suggestion.kind}`}
                      type="button"
                      onClick={() => setQuery(suggestion.label)}
                    >
                      {suggestion.label}
                      <em>{suggestion.kind}</em>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <LiveExample selectedCardCount={selectedCards.length} />

            <Alerts apiState={apiState} recommendation={recommendation} />

            {apiState.status !== "idle" || recommendation ? (
              <section className={styles.searchRun}>
                <RunPanel apiState={apiState} loadingStepIndex={loadingStepIndex} recommendation={recommendation} />
              </section>
            ) : null}
          </>
        ) : null}

        {activeView === "wallet" ? (
          <section className={styles.walletOnly}>
            <ViewIntro
              icon={<WalletCards size={14} />}
              label="Your wallet"
              title="Cards we'll optimize across."
              copy="Just the card types - we never ask for numbers, logins, or balances. Add or remove anytime."
            />
            <WalletStats selectedCardCount={selectedCards.length} />
            <WalletPanel selectedCardIds={selectedCardIds} onToggleCard={toggleCard} expanded />
          </section>
        ) : null}

        {activeView === "results" ? (
          <>
            <ViewIntro
              icon={<BarChart3 size={14} />}
              label="Your savings"
              title="Dashboard"
              copy="Tracking what you've saved by following the agent's recommendations. Real numbers, real math."
            />
            <DashboardStats />
            <Alerts apiState={apiState} recommendation={recommendation} />
            <section className={styles.resultsOnly}>
              <RunPanel apiState={apiState} loadingStepIndex={loadingStepIndex} recommendation={recommendation} />
            </section>
          </>
        ) : null}

        <footer className={styles.footer}>
          <span>Rewardr - AI-powered savings agent</span>
          <span>No PII - No card numbers - Honest math</span>
        </footer>
      </section>
    </main>
  );
}

function LiveExample({ selectedCardCount }: { selectedCardCount: number }) {
  const prices = [
    { retailer: "Walmart", price: "$189", best: true },
    { retailer: "Apple", price: "$249" },
    { retailer: "Best Buy", price: "$229" },
    { retailer: "Amazon", price: "$199" }
  ];

  return (
    <section className={styles.liveExample} aria-label="Live example">
      <div className={styles.liveMain}>
        <div className={styles.liveLabel}>
          <span />
          <p>
            Live example &middot; <em>see what the agent does</em>
          </p>
        </div>
        <div className={styles.exampleCard}>
          <div className={styles.exampleHeader}>
            <strong>&quot;AirPods Pro 2, USB-C model&quot;</strong>
            <span>
              12 retailers scanned
              <em>{selectedCardCount} cards evaluated</em>
            </span>
          </div>
          <div className={styles.priceGrid}>
            {prices.map((item) => (
              <div className={item.best ? styles.bestPrice : ""} key={item.retailer}>
                <span>{item.retailer}</span>
                <strong>{item.price}</strong>
              </div>
            ))}
          </div>
          <div className={styles.exampleResult}>
            <strong>
              <Sparkles size={14} />
              Buy at Walmart. Use Chase Freedom Flex.
            </strong>
            <span>
              You save
              <em>$68</em>
            </span>
          </div>
        </div>
      </div>
      <aside className={styles.savingsCard} aria-label="Savings summary">
        <p>Saved YTD</p>
        <strong>$1,247</strong>
        <span>across 47 purchases - averaging 5% return on tracked spend.</span>
        <div aria-hidden="true" />
      </aside>
    </section>
  );
}

function ViewIntro({
  icon,
  label,
  title,
  copy
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  copy: string;
}) {
  return (
    <div className={styles.viewIntro}>
      <p className={styles.kicker}>
        {icon}
        {label}
      </p>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
  );
}

function WalletStats({ selectedCardCount }: { selectedCardCount: number }) {
  const previewCards = cards.slice(0, 4);

  return (
    <section className={styles.walletStats} aria-label="Wallet summary">
      <div className={styles.walletStatCopy}>
        <span>In your wallet</span>
        <strong>
          {selectedCardCount}
          <em>cards</em>
        </strong>
        <p>
          The agent evaluates every card on every query - category bonuses, rotating calendars, portal multipliers, and
          active offers.
        </p>
      </div>
      <div className={styles.issuerCount}>
        <span>Issuers covered</span>
        <strong>{new Set(previewCards.map((card) => card.issuer)).size}</strong>
      </div>
      <div className={styles.walletPreview}>
        {previewCards.map((card) => (
          <div className={styles.walletMiniCard} key={card.id} style={{ background: card.art.background, color: card.art.foreground }}>
            <span>{card.issuer}</span>
            <strong>{card.displayName.replace(card.issuer, "").trim() || card.displayName}</strong>
            <em>{card.network.toUpperCase()}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardStats() {
  return (
    <section className={styles.dashboardStats} aria-label="Savings summary">
      <div>
        <span>Saved year to date</span>
        <strong>$1,247</strong>
        <p>on $24,800 in tracked spend</p>
      </div>
      <div>
        <span>Effective return rate</span>
        <strong>5.0%</strong>
        <p>vs. 1.2% before Rewardr</p>
      </div>
      <div>
        <span>This month</span>
        <strong>$184</strong>
        <p>across 9 recommendations</p>
      </div>
    </section>
  );
}

function Alerts({ apiState, recommendation }: { apiState: ApiState; recommendation: Recommendation | null }) {
  return (
    <>
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
    </>
  );
}

function WalletPanel({
  selectedCardIds,
  onToggleCard,
  expanded = false
}: {
  selectedCardIds: string[];
  onToggleCard: (cardId: string) => void;
  expanded?: boolean;
}) {
  return (
    <section className={`${styles.leftRail} ${expanded ? styles.walletExpanded : ""}`} aria-label="Wallet">
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
              onClick={() => onToggleCard(card.id)}
              type="button"
              aria-pressed={selected}
            >
              <span className={styles.cardArt} style={{ background: card.art.background, color: card.art.foreground }}>
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
  );
}

function RunPanel({
  apiState,
  loadingStepIndex,
  recommendation
}: {
  apiState: ApiState;
  loadingStepIndex: number;
  recommendation: Recommendation | null;
}) {
  return (
    <>
      <div className={styles.statusAndSummary}>
        <section className={styles.statusPanel} aria-label="Agent status">
          <div className={styles.sectionTitle}>
            <Loader2 className={apiState.status === "loading" ? styles.spin : ""} size={18} />
            <h2>Agent run</h2>
          </div>
          <StatusList
            activeIndex={apiState.status === "loading" ? loadingStepIndex : null}
            items={apiState.status === "loading" ? RUN_STEPS : recommendation?.statusLog ?? idleStatus()}
            mode={apiState.status === "loading" ? "loading" : recommendation ? "complete" : "idle"}
          />
        </section>

        <section className={styles.summaryPanel}>
          <p className={styles.kicker}>Recommendation</p>
          <h2>{recommendation?.product.title ?? "Ready for a product"}</h2>
          <p>{recommendation?.explanation ?? "Run the demo query to compare prices, rewards, and offers."}</p>
          {recommendation ? (
            <div className={styles.qualityLine}>
              <span>Source: {sourceLabel(recommendation.dataQuality.resultSource)}</span>
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
                  <p className={styles.resultProduct}>{result.productTitle}</p>
                </div>
                <div className={styles.priceBlock}>
                  <span>{formatCurrency(result.effectivePrice)}</span>
                  <small>{result.source === "estimated" ? "after rewards" : "effective"}</small>
                </div>
              </div>

              <div className={styles.mathRows}>
                <MathRow label={result.source === "estimated" ? "Benchmark spend" : "List price"} value={result.listPrice} tone="base" />
                {result.lineItems.map((lineItem) => (
                  <MathRow key={`${lineItem.kind}-${lineItem.label}`} label={lineItem.label} value={lineItem.amount} />
                ))}
              </div>

              <div className={styles.resultFooter}>
                <span className={`${styles.badge} ${styles[result.source]}`}>{sourceLabel(result.source)}</span>
                <span>{formatCurrency(result.savings)} {result.source === "estimated" ? "estimated value" : "value found"}</span>
                <a href={result.url} target="_blank" rel="noreferrer">
                  Open <ArrowUpRight size={15} />
                </a>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
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

function StatusList({
  activeIndex,
  items,
  mode
}: {
  activeIndex: number | null;
  items: string[];
  mode: "idle" | "loading" | "complete";
}) {
  return (
    <ol className={styles.statusList}>
      {items.map((item, index) => {
        const isActive = mode === "loading" && index === activeIndex;
        const isDone = mode === "complete" || (mode === "loading" && activeIndex != null && index < activeIndex);
        const className = isActive
          ? styles.statusActive
          : isDone
            ? styles.statusDone
            : mode === "loading"
              ? styles.statusPending
              : "";

        return (
          <li className={className} key={`${item}-${index}`}>
            <span className={styles.statusMarker}>
              {isActive ? (
                <Loader2 className={styles.spin} size={14} />
              ) : isDone ? (
                <Check size={14} />
              ) : (
                index + 1
              )}
            </span>
            <span>{item}</span>
          </li>
        );
      })}
    </ol>
  );
}

function idleStatus() {
  return ["Wallet loaded", "Hackathon fallback ready", "Deterministic scorer ready"];
}

function sourceLabel(source: string) {
  if (source === "fallback") {
    return "hackathon fallback";
  }
  if (source === "seeded") {
    return "fallback";
  }
  if (source === "estimated") {
    return "card estimate";
  }
  if (source === "mixed") {
    return "mixed";
  }
  if (source === "none") {
    return "none";
  }
  return source;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}
