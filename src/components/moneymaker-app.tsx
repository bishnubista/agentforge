"use client";

import { ArrowLeft, ArrowRight, BarChart3, Check, CreditCard, Loader2, Search, WalletCards } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cards } from "@/lib/data";
import { logger } from "@/lib/logger";
import type { Recommendation } from "@/lib/types";
import styles from "./moneymaker-app.module.css";

const STORAGE_KEY = "moneymaker:selected-cards";
const DEFAULT_QUERY = "";
const RUN_STEPS = [
  "Identifying product and specifications",
  "Scanning retailers across the web for live pricing",
  "Reading your wallet",
  "Cross-referencing active offers and portal bonuses",
  "Evaluating cashback and points value per retailer",
  "Scoring all options to find best effective price"
];
const PRIMARY_SUGGESTIONS = ["Patagonia Neo Puff Jacket", "AirPods Pro", "Flight SF to NYC", "Whole Foods"];
const EXTRA_SUGGESTIONS = [
  "Best card for dining",
  "Best card for gas",
  "Costco",
  "Best Buy",
  "Hotel in Miami",
  "Nike Air Max",
  "Dyson V15",
  "Amazon Prime subscription"
];
const RECENT_RECOMMENDATIONS = [
  { purchase: "AirPods Pro", pick: "Amazon · Prime Visa", saved: "$9.50", when: "Just now" },
  { purchase: "Patagonia Neo Puff Jacket", pick: "REI · American Express Gold", saved: "$45.19", when: "Just now" },
  { purchase: "Best card for gas", pick: "Chevron · Discover it Cash Back", saved: "$3.10", when: "Just now" },
  { purchase: "on cloudtech shoes", pick: "On Official Website · Gold Card (American Express)", saved: "$18.42", when: "Just now" },
  { purchase: "Garmin Fenix 8", pick: "Amazon · Prime Visa", saved: "$34.00", when: "Just now" }
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
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const requestSequence = useRef(0);

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

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    if (
      lastSubmittedQuery &&
      nextQuery.trim().toLowerCase() !== lastSubmittedQuery.toLowerCase() &&
      apiState.status !== "loading" &&
      apiState.data
    ) {
      setApiState({ status: "idle", data: null, error: null });
    }
  }

  async function runRecommendation(searchQuery: string) {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }

    const sequenceId = requestSequence.current + 1;
    requestSequence.current = sequenceId;
    setLastSubmittedQuery(trimmed);
    setLoadingStepIndex(0);
    setApiState({ status: "loading", data: null, error: null });

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          selectedCardIds
        })
      });

      const browserRequestId = response.headers.get("x-request-id");
      const payload = await response.json().catch((error) => {
        appLogger.warn("Recommendation API response was not valid JSON", {
          error,
          status: response.status,
          requestId: browserRequestId
        });
        return null;
      });
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Recommendation failed.";
        throw new Error(browserRequestId ? `${message} Request id: ${browserRequestId}` : message);
      }
      if (!payload) {
        throw new Error(
          browserRequestId ? `Recommendation failed. Request id: ${browserRequestId}` : "Recommendation failed."
        );
      }

      if (requestSequence.current !== sequenceId) {
        return;
      }
      setApiState({ status: "success", data: payload as Recommendation, error: null });
    } catch (error) {
      if (requestSequence.current !== sequenceId) {
        return;
      }
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

  async function submitRecommendation(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await runRecommendation(query);
  }

  function chooseSuggestion(suggestion: string) {
    setQuery(suggestion);
    void runRecommendation(suggestion);
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
            <section className={`${styles.hero} ${apiState.status !== "idle" || recommendation ? styles.heroCompact : ""}`}>
              <div className={styles.heroCopy}>
                <div className={styles.heroKicker}>Rewardr Agent</div>
                <h1>
                  Stop leaving money <em>on the table.</em>
                </h1>
                <p>Shopping for something or paying somewhere? Rewardr AI agents find the best deal and right card for you.</p>

                <form className={styles.searchPanel} onSubmit={submitRecommendation}>
                  <label htmlFor="product-query">Product search</label>
                  <div className={styles.searchRow}>
                    <Search className={styles.searchIcon} size={22} />
                    <input
                      id="product-query"
                      value={query}
                      onChange={(event) => handleQueryChange(event.target.value)}
                      placeholder="Search a product, brand, or store..."
                    />
                    <button disabled={apiState.status === "loading"} type="submit">
                      {apiState.status === "loading" ? (
                        <span>Thinking</span>
                      ) : (
                        <>
                          <span>Ask</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className={styles.suggestionStack} aria-label="Suggested searches">
                  <div className={styles.suggested}>
                    <span>Try:</span>
                    {PRIMARY_SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => chooseSuggestion(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={styles.moreButton}
                      onClick={() => setSuggestionsExpanded((current) => !current)}
                    >
                      {suggestionsExpanded ? "Less ↑" : "More ↓"}
                    </button>
                  </div>
                  {suggestionsExpanded ? (
                    <div className={styles.moreSuggestions}>
                      {EXTRA_SUGGESTIONS.map((suggestion) => (
                        <button key={suggestion} type="button" onClick={() => chooseSuggestion(suggestion)}>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className={styles.walletPill} type="button" onClick={() => setActiveView("wallet")}>
                  <span aria-hidden="true" />
                  {selectedCards.length} cards in your wallet
                  <em>add more →</em>
                </button>
              </div>
            </section>

            <Alerts apiState={apiState} recommendation={recommendation} />

            {apiState.status !== "idle" || recommendation ? (
              <SearchResultPanel
                apiState={apiState}
                loadingStepIndex={loadingStepIndex}
                recommendation={recommendation}
                selectedCardCount={selectedCards.length}
                onSearchAgain={() => setApiState({ status: "idle", data: null, error: null })}
              />
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
            <WalletStats selectedCards={selectedCards} />
            <div className={styles.dividerTitle}>Edit your wallet</div>
            <WalletPanel selectedCardIds={selectedCardIds} onToggleCard={toggleCard} expanded />
            <div className={styles.walletAction}>
              <strong>{selectedCards.length} cards selected</strong>
              <button type="button" onClick={() => setActiveView("search")}>
                Continue to search
                <ArrowRight size={15} />
              </button>
            </div>
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
            <RecentRecommendations recommendation={recommendation} />
          </>
        ) : null}

        <footer className={styles.footer}>
          <span>Rewardr Agent · AI-powered savings agent</span>
          <span>No PII · No card numbers · Honest math</span>
        </footer>
      </section>
    </main>
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

function WalletStats({ selectedCards }: { selectedCards: typeof cards }) {
  const previewCards = selectedCards.slice(0, 4);
  const issuerCount = new Set(selectedCards.map((card) => card.issuer)).size;

  return (
    <section className={styles.walletStats} aria-label="Wallet summary">
      <div className={styles.walletStatHeader}>
        <div className={styles.walletStatCopy}>
          <span>In your wallet</span>
          <strong>
            {selectedCards.length}
            <em>cards</em>
          </strong>
          <p>
            The agent evaluates every card on every query - category bonuses, rotating calendars, portal multipliers, and
            active offers.
          </p>
        </div>
        <div className={styles.issuerCount}>
          <span>Issuers covered</span>
          <strong>{issuerCount}</strong>
        </div>
      </div>
      <div className={styles.walletPreview}>
        {previewCards.map((card, index) => (
          <div
            className={styles.walletMiniCard}
            key={card.id}
            style={{
              background: card.art.background,
              color: card.art.foreground,
              "--card-angle": `${(index - 1.5) * 5}deg`,
              "--card-shift": `${index * -14}px`
            } as React.CSSProperties}
          >
            <span>{card.issuer}</span>
            <strong>{shortCardName(card)}</strong>
            <em>{rewardSummary(card)}</em>
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
                <span>{card.issuer}</span>
                <strong>{shortCardName(card)}</strong>
              </span>
              <span className={styles.cardText}>
                <strong>{shortCardName(card)}</strong>
                <span>{card.issuer}</span>
                <em>{rewardSummary(card)}</em>
              </span>
              <span className={styles.check}>{selected ? <Check size={16} /> : null}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SearchResultPanel({
  apiState,
  loadingStepIndex,
  recommendation,
  selectedCardCount,
  onSearchAgain
}: {
  apiState: ApiState;
  loadingStepIndex: number;
  recommendation: Recommendation | null;
  selectedCardCount: number;
  onSearchAgain: () => void;
}) {
  if (apiState.status === "loading") {
    const steps = RUN_STEPS.map((step) => (step === "Reading your wallet" ? `${step} (${selectedCardCount} cards)...` : step));
    return (
      <section className={styles.thinkingPanel} aria-label="Agent thinking">
        <div className={styles.agentTitle}>
          <Loader2 className={styles.spin} size={17} />
          <span>Agent thinking</span>
        </div>
        <StatusList activeIndex={loadingStepIndex} items={steps} mode="loading" />
      </section>
    );
  }

  const result = recommendation?.results[0];
  if (!result) {
    return null;
  }

  return (
    <section className={styles.bestOptionWrap} aria-label="Best option">
      <article className={styles.bestOptionCard}>
        <p className={styles.kicker}>Best option</p>
        <div className={styles.bestRows}>
          <div>
            <span>{result.source === "estimated" ? "Benchmark spend" : "Buy at"}</span>
            <strong>{result.retailerName}</strong>
            <em>{formatCurrency(result.listPrice)}</em>
          </div>
          <div>
            <span>Use this card</span>
            <strong>{result.cardName}</strong>
            <em>{rewardPercent(result)}%</em>
          </div>
          <div className={styles.effectiveRow}>
            <span>{result.source === "estimated" ? "After rewards benchmark" : "Effective price after cashback"}</span>
            <strong>{formatCurrency(result.effectivePrice)}</strong>
          </div>
        </div>
        <p>{recommendation.explanation}</p>
      </article>
      <button className={styles.searchAgain} type="button" onClick={onSearchAgain}>
        <ArrowLeft size={15} />
        Search again
      </button>
    </section>
  );
}

function RecentRecommendations({ recommendation }: { recommendation: Recommendation | null }) {
  const latest = recommendation?.results[0]
    ? {
        purchase: recommendation.product.title,
        pick: `${recommendation.results[0].retailerName} · ${recommendation.results[0].cardName}`,
        saved: formatCurrency(recommendation.results[0].savings),
        when: "Just now"
      }
    : null;
  const rows = latest ? [latest, ...RECENT_RECOMMENDATIONS.slice(0, 4)] : RECENT_RECOMMENDATIONS;

  return (
    <section className={styles.recentSection} aria-label="Recent recommendations">
      <div className={styles.recentHeader}>
        <h2>Recent recommendations</h2>
        <button type="button">See all →</button>
      </div>
      <div className={styles.recentTable}>
        <div className={styles.recentHead}>
          <span>Purchase</span>
          <span>Agent&apos;s pick</span>
          <span>Saved</span>
          <span>When</span>
        </div>
        {rows.map((row) => (
          <div className={styles.recentRow} key={`${row.purchase}-${row.pick}`}>
            <strong>{row.purchase}</strong>
            <span>{row.pick}</span>
            <em>{row.saved}</em>
            <span>{row.when}</span>
          </div>
        ))}
      </div>
    </section>
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

function shortCardName(card: (typeof cards)[number]) {
  return card.displayName.replace(card.issuer, "").trim().replace("Cash Back", "").trim() || card.displayName;
}

function rewardSummary(card: (typeof cards)[number]) {
  const firstReward = card.rewards[0];
  if (firstReward) {
    return firstReward.label;
  }
  return `${card.baseRewardRate}% on everything`;
}

function rewardPercent(result: Recommendation["results"][number]) {
  if (result.listPrice <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((result.savings / result.listPrice) * 100));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}
