import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { HOME_EN, type HomeCopy } from "./locales/home.en";
import { VakaLogo } from "./design-system/Logo";
import { HOME_NAVIGATION_IDS, nextHomepageTabIndex, resolveHomeLocale, type HomeLocale } from "./landing-model";

type LandingProps = {
  onLogin: () => void;
  onSignup: () => void;
};

type PreviewTab = HomeCopy["preview"]["tabs"][number];
type ModuleTab = HomeCopy["modules"]["tabs"][number];

const LANGUAGE_KEY = "vaka_home_language";

function icon(name: string) {
  const paths: Record<string, string> = {
    currency: "M4 7h16M4 17h16M8 3v18m8-18v18",
    market: "M4 21V10l8-7 8 7v11M9 21v-6h6v6",
    visibility: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    connected: "M8 12h8M6 8a4 4 0 1 0 0 8M18 8a4 4 0 1 1 0 8",
    language: "M4 5h10M9 3v2m-4 4c2 3 5 5 9 6m-1-8c-1 4-4 7-8 9m11-2 3 7m-6 0 3-7m-2 4h4",
    growth: "m4 17 5-5 4 3 7-8M15 7h5v5",
    crm: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 1-3-3.87",
    finance: "M3 3v18h18M7 16l4-4 3 2 5-7",
    inventory: "m3 6 9-4 9 4-9 4-9-4Zm0 0v12l9 4 9-4V6m-9 4v12",
    insights: "M4 19V9m6 10V5m6 14v-7m4 7V3",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] ?? paths.insights} />
    </svg>
  );
}

function ProductPreview({ copy, onInteraction }: { copy: HomeCopy; onInteraction: (name: string) => void }) {
  const [activeId, setActiveId] = useState<PreviewTab["id"]>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = copy.preview.tabs.find((tab) => tab.id === activeId) ?? copy.preview.tabs[0];

  const choose = (tab: PreviewTab, index: number) => {
    setActiveId(tab.id);
    tabRefs.current[index]?.focus();
    onInteraction(`preview_${tab.id}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextHomepageTabIndex(event.key, index, copy.preview.tabs.length);
    if (next === null) return;
    event.preventDefault();
    choose(copy.preview.tabs[next], next);
  };

  return (
    <div className="v-product" aria-label={copy.accessibility.productPreview}>
      <div className="v-product-bar">
        <span className="v-product-mark" aria-hidden="true">V</span>
        <span>{copy.preview.workspace}</span>
        <span className="v-preview-label">{copy.preview.sample}</span>
        <span className="v-product-period">{copy.preview.period}</span>
      </div>
      <div className="v-product-body">
        <div className="v-product-nav" role="tablist" aria-label={copy.accessibility.productViews}>
          {copy.preview.tabs.map((tab, index) => (
            <button
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`preview-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={tab.id === active.id}
              aria-controls={`preview-${tab.id}-panel`}
              tabIndex={tab.id === active.id ? 0 : -1}
              className={tab.id === active.id ? "active" : ""}
              key={tab.id}
              onClick={() => choose(tab, index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="v-product-main"
          id={`preview-${active.id}-panel`}
          role="tabpanel"
          aria-labelledby={`preview-${active.id}-tab`}
          key={active.id}
        >
          <div className="v-product-heading"><span>{active.heading}</span><span className="v-live">{copy.preview.live}</span></div>
          <div className="v-product-grid">
            <div className="v-product-overview">
              <div className="v-metrics">
                {active.metrics.map((metric) => (
                  <div key={metric.label}>
                    <small>{metric.label}</small>
                    <strong>{metric.value}</strong>
                    <em className={metric.tone === "warning" ? "warn" : ""}>{metric.note}</em>
                  </div>
                ))}
              </div>
              <div className="v-product-lower">
                <div className="v-chart">
                  <div className="v-chart-title"><span>{copy.preview.chartTitle}</span><b>{copy.preview.chartValue}</b></div>
                  <svg viewBox="0 0 420 130" role="img" aria-label={copy.accessibility.chart}>
                    <defs>
                      <linearGradient id="vaka-preview-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="currentColor" stopOpacity=".3" />
                        <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 110 C45 100 55 80 92 88 S150 65 180 73 S230 42 270 54 S340 35 420 18 V130 H0Z" fill="url(#vaka-preview-area)" />
                    <path d="M0 110 C45 100 55 80 92 88 S150 65 180 73 S230 42 270 54 S340 35 420 18" fill="none" stroke="currentColor" strokeWidth="3" />
                  </svg>
                </div>
              </div>
            </div>
            <aside className="v-priority-rail" aria-label={copy.accessibility.productPriorities}>
              <h3>{copy.preview.prioritiesTitle}</h3>
              {copy.preview.priorities.map((priority) => (
                <div className={`v-priority v-priority-${priority.tone}`} key={priority.label}>
                  <span>{priority.label}</span><strong>{priority.value}</strong><small>{priority.note}</small>
                </div>
              ))}
              <div className="v-ai-card">
                <span className="v-ai-tag">{copy.preview.aiLabel}</span>
                <p>{copy.preview.aiTextBefore}<b>{copy.preview.aiAmount}</b>.</p>
                <span className="v-ai-link">{copy.preview.aiAction}</span>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductMenu({ copy, go }: { copy: HomeCopy; go: (id: string) => void }) {
  const disclosureRef = useRef<HTMLDetailsElement | null>(null);

  const choose = (id: string) => {
    disclosureRef.current?.removeAttribute("open");
    go(id === "ai" ? "ai" : "product");
  };

  return (
    <details
      className="v-product-menu"
      ref={disclosureRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !disclosureRef.current?.open) return;
        event.preventDefault();
        disclosureRef.current.open = false;
        disclosureRef.current.querySelector("summary")?.focus();
      }}
    >
      <summary>{copy.nav.product}<span aria-hidden="true">⌄</span></summary>
      <div className="v-product-menu-panel" role="group" aria-label={copy.accessibility.productMenu}>
        {copy.nav.productItems.map((item) => (
          <button type="button" onClick={() => choose(item.id)} key={item.id}>
            <span>{item.label}</span><small className={`v-status v-status-${item.tone}`}>{item.status}</small>
          </button>
        ))}
      </div>
    </details>
  );
}

function ModuleExplorer({ copy, onInteraction }: { copy: HomeCopy; onInteraction: (name: string) => void }) {
  const [activeId, setActiveId] = useState<ModuleTab["id"]>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = copy.modules.tabs.find((tab) => tab.id === activeId) ?? copy.modules.tabs[0];

  const choose = (tab: ModuleTab, index: number) => {
    setActiveId(tab.id);
    tabRefs.current[index]?.focus();
    onInteraction(`module_${tab.id}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextHomepageTabIndex(event.key, index, copy.modules.tabs.length);
    if (next === null) return;
    event.preventDefault();
    choose(copy.modules.tabs[next], next);
  };

  return (
    <>
      <div className="v-tabs" role="tablist" aria-label={copy.accessibility.productViews}>
        {copy.modules.tabs.map((tab, index) => (
          <button
            ref={(node) => { tabRefs.current[index] = node; }}
            id={`module-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={active.id === tab.id}
            aria-controls={`module-${tab.id}-panel`}
            tabIndex={active.id === tab.id ? 0 : -1}
            key={tab.id}
            onClick={() => choose(tab, index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="v-tab-panel"
        id={`module-${active.id}-panel`}
        role="tabpanel"
        aria-labelledby={`module-${active.id}-tab`}
        tabIndex={0}
        key={active.id}
      >
        <div>
          <span className="v-product-label">{active.label}</span>
          <h3>{active.outcome}</h3>
          <ul>{active.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>
        <div className="v-tab-metric">
          <small>{active.metric}</small>
          <strong>{active.value}</strong>
          <div className="v-bars" aria-hidden="true">{[42, 61, 54, 76, 68, 88, 82].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div>
        </div>
      </div>
    </>
  );
}

export function Landing({ onLogin, onSignup }: LandingProps) {
  const browserLocale = typeof navigator === "undefined" ? "en" : navigator.language.toLowerCase();
  const storedLocale = typeof window === "undefined" ? null : localStorage.getItem(LANGUAGE_KEY);
  const [locale, setLocale] = useState<HomeLocale>(() => resolveHomeLocale(storedLocale, browserLocale));
  const [menuOpen, setMenuOpen] = useState(false);
  const copy = useMemo(() => HOME_EN, []);
  const languageNotice = locale !== "en";

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, locale);
    document.documentElement.lang = "en";
    document.documentElement.dataset.preferredLanguage = locale;
  }, [locale]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = copy.meta.title;
    return () => { document.title = previousTitle; };
  }, [copy.meta.title]);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    setMenuOpen(false);
  };

  const track = (name: string) => window.dispatchEvent(new CustomEvent("vaka:conversion", { detail: { name } }));
  const signup = () => {
    track("signup_start");
    onSignup();
  };

  const navigation = HOME_NAVIGATION_IDS
    .filter((id) => id !== "product")
    .map((id) => [id, copy.nav[id === "faq" ? "resources" : id]] as const);

  return (
    <div className="v-home">
      <a className="v-skip" href="#main">{copy.accessibility.skip}</a>
      <header className="v-nav">
        <button className="v-logo" onClick={() => go("top")} aria-label={copy.meta.title}>
          <VakaLogo size={30} />
        </button>
        <nav className="v-nav-links" aria-label={copy.accessibility.primaryNavigation}>
          <ProductMenu copy={copy} go={go} />
          {navigation.map(([id, label]) => <button key={id} onClick={() => go(id)}>{label}</button>)}
        </nav>
        <div className="v-nav-actions">
          <button className="v-text-button" onClick={onLogin}>{copy.nav.signIn}</button>
          <button className="v-button v-button-gold v-button-sm" onClick={signup}>{copy.nav.start}</button>
          <button
            className="v-menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">{menuOpen ? copy.accessibility.closeMenu : copy.accessibility.openMenu}</span>
            <span /><span />
          </button>
        </div>
        {menuOpen && (
          <nav id="mobile-navigation" className="v-mobile-nav" aria-label={copy.accessibility.mobileNavigation}>
            <div className="v-mobile-availability" role="group" aria-label={copy.accessibility.productMenu}>
              {copy.nav.productItems.map((item) => <span key={item.id}>{item.label}<small>{item.status}</small></span>)}
            </div>
            {navigation.map(([id, label]) => <button key={id} onClick={() => go(id)}>{label}</button>)}
            <button onClick={onLogin}>{copy.nav.signIn}</button>
            <button className="v-button v-button-gold" onClick={signup}>{copy.hero.primary}</button>
          </nav>
        )}
      </header>

      <main id="main">
        <section className="v-hero" id="top">
          <div className="v-hero-copy">
            <span className="v-eyebrow">{copy.hero.eyebrow}</span>
            <h1>{copy.hero.title}</h1>
            <p className="v-lead">{copy.hero.description}</p>
            <div className="v-hero-context">
              <span>{copy.hero.origin}</span>
              <span aria-hidden="true">·</span>
              <span>{copy.hero.position}</span>
            </div>
            <div className="v-availability-rail" role="group" aria-label={copy.accessibility.heroAvailability}>
              {copy.hero.availability.map((item) => (
                <span className={`v-availability v-status-${item.tone}`} key={item.label}>
                  <b>{item.label}</b><small>{item.status}</small>
                </span>
              ))}
            </div>
            <div className="v-cta-row">
              <button className="v-button v-button-gold" onClick={signup}>{copy.hero.primary}</button>
              <button className="v-button v-button-outline" onClick={() => go("product")}>{copy.hero.secondary} <span aria-hidden="true">↓</span></button>
            </div>
            <p className="v-trust-line"><span aria-hidden="true">✓</span>{copy.hero.trust}</p>
          </div>
          <div className="v-hero-product">
            <ProductPreview copy={copy} onInteraction={track} />
          </div>
        </section>

        <div className="v-credibility" aria-label={copy.accessibility.productCapabilities}>{copy.capabilityLine}</div>

        <section className="v-section v-story" id="why">
          <div className="v-story-mark" aria-hidden="true">V</div>
          <div>
            <span className="v-eyebrow v-eyebrow-dark">{copy.story.eyebrow}</span>
            <h2>{copy.story.title}</h2>
            <p className="v-story-lead">{copy.story.lead}</p>
            <p>{copy.story.list}</p>
            <p>{copy.story.body}</p>
            <strong>{copy.story.position}</strong>
            <blockquote>{copy.story.closing}</blockquote>
          </div>
        </section>

        <section className="v-section v-section-light" id="zimbabwe">
          <div className="v-section-heading">
            <span className="v-eyebrow v-eyebrow-dark">{copy.zimbabwe.eyebrow}</span>
            <h2>{copy.zimbabwe.title}</h2>
            <p>{copy.zimbabwe.description}</p>
          </div>
          <div className="v-capability-grid">
            {copy.zimbabwe.capabilities.map((capability) => (
              <article className="v-capability" key={capability.title}>
                <span className="v-icon">{icon(capability.icon)}</span>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="v-section v-problem" id="outcomes">
          <div className="v-problem-copy">
            <span className="v-eyebrow v-eyebrow-dark">{copy.problem.eyebrow}</span>
            <h2>{copy.problem.title}</h2>
            <p>{copy.problem.description}</p>
            <strong>{copy.problem.resolution}</strong>
          </div>
          <div className="v-fragment-diagram" aria-label={copy.accessibility.disconnectedWorkflow}>
            <div className="v-fragments">
              {copy.problem.fragments.map((item) => <span key={item}>{item}</span>)}
            </div>
            <span className="v-diagram-arrow" aria-hidden="true">→</span>
            <div className="v-one-system"><b>VAKA</b><small>{copy.problem.system}</small></div>
          </div>
        </section>

        <section className="v-section v-section-light v-outcomes-section">
          <div className="v-section-heading">
            <span className="v-eyebrow v-eyebrow-dark">{copy.outcomes.eyebrow}</span>
            <h2>{copy.outcomes.title}</h2>
          </div>
          <div className="v-outcome-grid">
            {copy.outcomes.items.map((outcome) => (
              <article className="v-outcome" key={outcome.title}>
                <span className="v-icon">{icon(outcome.icon)}</span>
                <span className="v-product-label">{outcome.label}</span>
                <h3>{outcome.title}</h3>
                <p>{outcome.description}</p>
                <div className={`v-mini-ui v-mini-${outcome.icon}`} aria-hidden="true"><span /><span /><span /></div>
              </article>
            ))}
          </div>
        </section>

        <section className="v-section v-experience" id="product">
          <div className="v-section-heading v-heading-centre">
            <span className="v-eyebrow v-eyebrow-dark">{copy.modules.eyebrow}</span>
            <h2>{copy.modules.title}</h2>
          </div>
          <ModuleExplorer copy={copy} onInteraction={track} />
        </section>

        <section className="v-section v-roadmap" id="roadmap">
          <div className="v-section-heading">
            <span className="v-eyebrow v-eyebrow-dark">{copy.enhanced.eyebrow}</span>
            <h2>{copy.enhanced.title}</h2>
            <p>{copy.enhanced.description}</p>
          </div>
          <div className="v-roadmap-grid">
            {copy.enhanced.items.map((item) => (
              <article className="v-roadmap-card" key={item.title}>
                <span className="v-planned">{copy.enhanced.status}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="v-section v-ai" id="ai">
          <div className="v-ai-copy">
            <span className="v-eyebrow">{copy.ai.eyebrow}</span>
            <h2>{copy.ai.title}</h2>
            <p>{copy.ai.description}</p>
            <strong>{copy.ai.progression}</strong>
            <small>{copy.ai.notice}</small>
          </div>
          <div className="v-ai-conversation">
            <div className="v-ai-question"><span>{copy.ai.userLabel}</span><p>{copy.ai.user}</p></div>
            <div className="v-ai-response"><span>{copy.ai.responseLabel}</span><p>{copy.ai.answer}</p></div>
          </div>
        </section>

        <section className="v-section v-connected" id="workflow">
          <div className="v-section-heading v-heading-centre">
            <span className="v-eyebrow">{copy.workflow.eyebrow}</span>
            <h2>{copy.workflow.title}</h2>
            <p>{copy.workflow.description}</p>
          </div>
          <div className="v-workflow" aria-label={copy.accessibility.connectedWorkflow}>
            {copy.workflow.steps.map((step, index) => (
              <div className="v-workflow-step" key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span><b>{step}</b>
                {index < copy.workflow.steps.length - 1 && <i aria-hidden="true">→</i>}
              </div>
            ))}
          </div>
        </section>

        <section className="v-section v-trust" id="trust">
          <div className="v-section-heading">
            <span className="v-eyebrow">{copy.trust.eyebrow}</span>
            <h2>{copy.trust.title}</h2>
            <p>{copy.trust.description}</p>
          </div>
          <div className="v-trust-grid">
            {copy.trust.items.map((item) => (
              <article key={item.title}>
                <span aria-hidden="true">✓</span><h3>{item.title}</h3><p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="v-section v-proof">
          <div>
            <span className="v-eyebrow v-eyebrow-dark">{copy.proof.eyebrow}</span>
            <h2>{copy.proof.title}</h2>
            <p>{copy.proof.description}</p>
          </div>
          <button className="v-button v-button-dark" onClick={() => go("product")}>{copy.proof.cta}</button>
        </section>

        <section className="v-section v-partners" id="partners">
          <div className="v-partner-copy">
            <span className="v-eyebrow">{copy.partners.eyebrow}</span>
            <h2>{copy.partners.title}</h2>
            <p>{copy.partners.description}</p>
            <ul>{copy.partners.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
            <div className="v-referral-note"><b>{copy.partners.referralTitle}</b><p>{copy.partners.referralDescription}</p></div>
            <small>{copy.partners.notice}</small>
            <button className="v-button v-button-gold" type="button" disabled>{copy.partners.cta}</button>
          </div>
          <div className="v-partner-model">
            <h3>{copy.partners.commissionTitle}</h3>
            <div className="v-commission-grid">
              {copy.partners.commission.map((item) => <span key={item}>{item}</span>)}
            </div>
            <h3>{copy.partners.tiersTitle}</h3>
            <div className="v-partner-tiers">
              {copy.partners.tiers.map((tier) => (
                <article key={tier.name}>
                  <b>{tier.name}</b>
                  <strong>{tier.price}<small>/month</small></strong>
                  <p>{tier.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="v-section v-pricing" id="pricing">
          <div className="v-section-heading v-heading-centre">
            <span className="v-eyebrow v-eyebrow-dark">{copy.pricing.eyebrow}</span>
            <h2>{copy.pricing.title}</h2>
            <p>{copy.pricing.description}</p>
          </div>
          <div className="v-plan-grid">
            {copy.pricing.plans.map((plan, index) => (
              <article className={`v-plan ${index === 1 ? "featured" : ""}`} key={plan.name}>
                {index === 1 && <span className="v-plan-badge">{copy.pricing.featured}</span>}
                <h3>{plan.name}</h3>
                <p>{plan.audience}</p>
                <div className="v-price"><strong>{plan.price}</strong><span>{copy.pricing.period}</span></div>
                <small>{plan.includes}</small>
                <em>{plan.note}</em>
                <button className={`v-button ${index === 1 ? "v-button-gold" : "v-button-dark"}`} onClick={signup}>{copy.pricing.cta}</button>
              </article>
            ))}
          </div>
        </section>

        <section className="v-section v-faq" id="faq">
          <div className="v-section-heading">
            <span className="v-eyebrow v-eyebrow-dark">{copy.faq.eyebrow}</span>
            <h2>{copy.faq.title}</h2>
          </div>
          <div className="v-faq-list">
            {copy.faq.items.map((item) => (
              <details key={item.question} onToggle={(event) => event.currentTarget.open && track("faq_open")}>
                <summary>{item.question}<span aria-hidden="true">+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="v-final">
          <span className="v-eyebrow">{copy.final.eyebrow}</span>
          <h2>{copy.final.title}</h2>
          <p>{copy.final.description}</p>
          <div className="v-cta-row">
            <button className="v-button v-button-gold" onClick={signup}>{copy.hero.primary}</button>
            <button className="v-button v-button-outline" onClick={() => go("product")}>{copy.hero.secondary}</button>
          </div>
          <small>{copy.final.closing}</small>
        </section>
      </main>

      <footer className="v-footer">
        <div className="v-footer-brand">
          <div className="v-logo"><VakaLogo size={30} /></div>
          <p>{copy.footer.position}</p>
          <label htmlFor="v-language">{copy.footer.language}</label>
          <select id="v-language" value={locale} onChange={(event) => { setLocale(resolveHomeLocale(event.target.value, "en")); track("language_change"); }}>
            <option value="en">{copy.footer.languages.english}</option>
            <option value="sn">{copy.footer.languages.shona}</option>
            <option value="nd">{copy.footer.languages.ndebele}</option>
          </select>
          {languageNotice && <p className="v-language-notice" role="status">{copy.footer.languageNotice}</p>}
        </div>
        <div className="v-footer-links">
          <div>
            <h3>{copy.footer.product}</h3>
            <button onClick={() => go("product")}>{copy.footer.crm}</button>
            <button onClick={() => go("product")}>{copy.footer.finance}</button>
            <button onClick={() => go("product")}>{copy.footer.inventory}</button>
            <button onClick={() => go("ai")}>{copy.footer.ai}</button>
          </div>
          <div>
            <h3>{copy.footer.company}</h3>
            <button onClick={() => go("why")}>{copy.footer.about}</button>
            <a href="mailto:hello@jonomi.digital">{copy.footer.contact}</a>
          </div>
          <div>
            <h3>{copy.footer.legal}</h3>
            <button onClick={() => go("trust")}>{copy.footer.security}</button>
            <span className="v-footer-pending">{copy.footer.privacy}</span>
            <span className="v-footer-pending">{copy.footer.terms}</span>
          </div>
        </div>
        <div className="v-footer-bottom">
          <span>{copy.footer.copyright}</span>
          <a href="https://jonomi.digital">{copy.footer.parent}</a>
        </div>
      </footer>
    </div>
  );
}
