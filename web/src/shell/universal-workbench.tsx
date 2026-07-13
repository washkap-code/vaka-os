import { fmt } from "../api";
import { appEnglish } from "../locales/app.en";
import type { WorkspaceNavigationItem, WorkspacePage } from "./navigation";
import { openPipelineDeals, safeChartPercent, visibleWorkbenchActions } from "./workbench-model";

type AgeingBucketKey = "current" | "d30" | "d60" | "d90" | "d90plus";

type ReceivableItem = {
  invoiceId: string;
  number: string | null;
  contact: string;
  currency: "USD" | "ZWG";
  outstanding: string;
  daysOverdue: number;
};

type CurrencyAgeing = {
  currency: "USD" | "ZWG";
  outstanding: string;
  overdue: string;
  buckets: Record<AgeingBucketKey, string>;
};

export type WorkbenchData = {
  monthToDate: { income: string; expenses: string; netProfit: string };
  receivables: {
    asAt: string;
    currencies: CurrencyAgeing[];
    attentionItems: ReceivableItem[];
  };
  lowStock: Array<{
    id: string;
    sku: string;
    name: string;
    on_hand: string;
    reorder_level: string;
  }>;
  pipeline: Array<{ stage: string; n: string; value: string }>;
};

type UniversalWorkbenchProps = {
  data: WorkbenchData;
  currency: string;
  navigation: readonly WorkspaceNavigationItem[];
  onNavigate: (page: WorkspacePage) => void;
};

const AGEING_BUCKETS: readonly AgeingBucketKey[] = ["current", "d30", "d60", "d90", "d90plus"];

function ModuleLink({ page, onNavigate, children }: {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
  children: string;
}) {
  return <button className="workbench-link" type="button" onClick={() => onNavigate(page)}>{children}<span aria-hidden="true"> →</span></button>;
}

function BarChart({ rows, label }: {
  rows: readonly { key: string; label: string; value: number; display: string; tone?: "positive" | "negative" | "accent" }[];
  label: string;
}) {
  const values = rows.map((row) => row.value);
  return <div className="workbench-chart" role="group" aria-label={label}>
    {rows.map((row) => <div className="workbench-chart-row" key={row.key}>
      <div className="workbench-chart-label"><span>{row.label}</span><b>{row.display}</b></div>
      <div className="workbench-chart-track" aria-hidden="true">
        <span className={`workbench-chart-bar ${row.tone ?? "accent"}`}
          style={{ width: `${safeChartPercent(row.value, values)}%` }} />
      </div>
    </div>)}
  </div>;
}

export function UniversalWorkbench({ data, currency, navigation, onNavigate }: UniversalWorkbenchProps) {
  const copy = appEnglish.dashboard;
  const actions = visibleWorkbenchActions(navigation);
  const visiblePages = new Set(navigation.map((item) => item.key));
  const pipelineDeals = openPipelineDeals(data.pipeline);
  const financialRows = [
    { key: "income", label: copy.income, value: Number(data.monthToDate.income), display: fmt(data.monthToDate.income, currency), tone: "positive" as const },
    { key: "expenses", label: copy.expenses, value: Number(data.monthToDate.expenses), display: fmt(data.monthToDate.expenses, currency), tone: "accent" as const },
    { key: "net", label: copy.netProfit, value: Number(data.monthToDate.netProfit), display: fmt(data.monthToDate.netProfit, currency), tone: Number(data.monthToDate.netProfit) < 0 ? "negative" as const : "positive" as const },
  ];

  return <div className="workbench">
    <header className="workbench-hero">
      <div><span className="workbench-eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
      {actions.length > 0 && <nav className="workbench-actions" aria-label={copy.quickActions}>
        {actions.map((action) => <button className="workbench-action" type="button" key={action.page}
          onClick={() => onNavigate(action.page)}>{copy.actions[action.labelKey]}<span aria-hidden="true">↗</span></button>)}
      </nav>}
    </header>

    <section aria-labelledby="workbench-priorities">
      <div className="workbench-section-heading"><div><span>{copy.focus}</span><h2 id="workbench-priorities">{copy.prioritiesTitle}</h2></div><small>{copy.liveEvidence}</small></div>
      <div className="workbench-priorities">
        <article className="workbench-priority"><span className="workbench-priority-icon danger" aria-hidden="true">!</span><div><b>{data.receivables.attentionItems.length}</b><span>{copy.overdueShown}</span></div></article>
        <article className="workbench-priority"><span className="workbench-priority-icon warning" aria-hidden="true">↓</span><div><b>{data.lowStock.length}</b><span>{copy.lowStockItems}</span></div></article>
        <article className="workbench-priority"><span className="workbench-priority-icon info" aria-hidden="true">↗</span><div><b>{pipelineDeals}</b><span>{copy.openDeals}</span></div></article>
      </div>
    </section>

    <div className="workbench-layout">
      <section className="workbench-panel workbench-performance" aria-labelledby="workbench-performance">
        <div className="workbench-panel-heading"><div><span>{copy.performance}</span><h2 id="workbench-performance">{copy.monthToDateTitle}</h2></div><small>{copy.baseCurrency.replace("{currency}", currency)}</small></div>
        <BarChart rows={financialRows} label={copy.performanceChartLabel.replace("{currency}", currency)} />
      </section>

      <section className="workbench-panel" aria-labelledby="workbench-pipeline">
        <div className="workbench-panel-heading"><div><span>{copy.sales}</span><h2 id="workbench-pipeline">{copy.pipelineTitle}</h2></div>
          {visiblePages.has("pipeline") && <ModuleLink page="pipeline" onNavigate={onNavigate}>{copy.viewPipeline}</ModuleLink>}</div>
        {data.pipeline.length === 0 ? <p className="workbench-empty">{copy.noPipeline}</p> : <>
          <BarChart label={copy.pipelineChartLabel} rows={data.pipeline.map((row) => ({
            key: row.stage, label: row.stage, value: Number(row.value), display: fmt(row.value, currency), tone: "accent" as const,
          }))} />
          <div className="table-scroll" role="region" aria-label={copy.pipelineTableLabel} tabIndex={0}><table className="dense-data-table"><thead><tr><th>{copy.stage}</th><th className="num">{copy.deals}</th><th className="num">{copy.value}</th></tr></thead>
            <tbody>{data.pipeline.map((row) => <tr key={row.stage}><td><span className={`pill ${row.stage}`}>{row.stage}</span></td><td className="num">{row.n}</td><td className="num">{fmt(row.value, currency)}</td></tr>)}</tbody></table></div>
        </>}
      </section>
    </div>

    <section className="workbench-panel" aria-labelledby="workbench-receivables">
      <div className="workbench-panel-heading"><div><span>{copy.cashFlow}</span><h2 id="workbench-receivables">{copy.receivablesTitle}</h2></div><div className="workbench-panel-meta"><small>{copy.receivablesAsAt} {new Date(data.receivables.asAt).toLocaleDateString("en-ZW")}</small>
        {visiblePages.has("invoices") && <ModuleLink page="invoices" onNavigate={onNavigate}>{copy.viewInvoices}</ModuleLink>}</div></div>
      {data.receivables.currencies.length === 0 ? <p className="workbench-empty">{copy.noReceivables}</p> : <div className="receivables-currencies">
        {data.receivables.currencies.map((ageing) => <article className="receivables-currency" key={ageing.currency} aria-labelledby={`ageing-${ageing.currency}`}>
          <div className="row receivables-summary"><h3 id={`ageing-${ageing.currency}`}>{ageing.currency}</h3><span>{copy.outstanding}: <b>{fmt(ageing.outstanding, ageing.currency)}</b></span><span>{copy.overdue}: <b className={Number(ageing.overdue) > 0 ? "bad-text" : "ok-text"}>{fmt(ageing.overdue, ageing.currency)}</b></span></div>
          <BarChart label={copy.ageingChartLabel.replace("{currency}", ageing.currency)} rows={AGEING_BUCKETS.map((key) => ({ key, label: copy.buckets[key], value: Number(ageing.buckets[key]), display: fmt(ageing.buckets[key], ageing.currency), tone: key === "current" ? "positive" as const : "negative" as const }))} />
        </article>)}
      </div>}
      <h3 className="attention-heading">{copy.attentionTitle}</h3>
      {data.receivables.attentionItems.length === 0 ? <p className="workbench-empty">{copy.noAttention}</p> : <div className="table-scroll" role="region" aria-label={copy.overdueTableLabel} tabIndex={0}><table className="dense-data-table"><thead><tr><th>{copy.invoice}</th><th>{copy.customer}</th><th className="num">{copy.amount}</th><th className="num">{copy.daysOverdue}</th></tr></thead>
        <tbody>{data.receivables.attentionItems.map((item) => <tr key={item.invoiceId}><td><b>{item.number}</b></td><td>{item.contact}</td><td className="num">{fmt(item.outstanding, item.currency)}</td><td className="num bad-text">{item.daysOverdue}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="workbench-panel" aria-labelledby="workbench-stock">
      <div className="workbench-panel-heading"><div><span>{copy.inventory}</span><h2 id="workbench-stock">{copy.lowStockTitle}</h2></div>
        {visiblePages.has("products") && <ModuleLink page="products" onNavigate={onNavigate}>{copy.viewStock}</ModuleLink>}</div>
      {data.lowStock.length === 0 ? <p className="workbench-empty">{copy.stockHealthy}</p> : <div className="table-scroll" role="region" aria-label={copy.lowStockTableLabel} tabIndex={0}><table className="dense-data-table"><thead><tr><th>{copy.sku}</th><th>{copy.product}</th><th className="num">{copy.onHand}</th><th className="num">{copy.reorderLevel}</th></tr></thead>
        <tbody>{data.lowStock.map((row) => <tr key={row.id}><td>{row.sku}</td><td>{row.name}</td><td className="num bad-text"><b>{Number(row.on_hand)}</b></td><td className="num">{row.reorder_level}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
