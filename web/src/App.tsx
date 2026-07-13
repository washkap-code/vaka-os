import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { api, fmt, getToken, setToken } from "./api";
import { Landing } from "./landing";
import { appEnglish } from "./locales/app.en";
import { PlatformAdminGuide } from "./platform-admin-guide";

// ============================================================================
// VAKA PLATFORM — web client
// Auth → tenant-branded shell → Dashboard / CRM / Sales / Inventory /
// Accounting / Reports / Billing. Brand colours come from the tenant record
// (white-label): we set CSS variables at runtime.
// ============================================================================

type Me = {
  userId: string; permissions: string[]; accessLevel: string; mustChangePassword: boolean;
  isTenantOwner: boolean; sessionId: string | null;
  user: { id: string; email: string; fullName: string };
  tenant: {
    id: string; companyName: string; subdomain: string; status: string;
    baseCurrency: "USD" | "ZWG"; trialEndsAt: string;
    brandPrimaryColor: string; brandSecondaryColor: string; logoUrl: string | null;
    taxNumber: string | null; vatNumber: string | null;
    registrationNumber: string | null; physicalAddress: string | null;
  } | null;
};
type ArrearsStatus = {
  stage: "CLEAR" | "DUE_SOON" | "OVERDUE" | "SUSPENDED";
  overdueInvoiceCount: number;
  dueSoonInvoiceCount: number;
  oldestDueAt: string | null;
  daysOverdue: number;
  amounts: Array<{ currency: string; amount: string }>;
};

type VatTechnicalReportView = {
  filingReady: false;
  period: { from: string; to: string };
  currency: "USD" | "ZWG";
  totals: { outputVat: string; inputVat: string; netVat: string; position: "payable" | "credit" | "nil" };
  evidence: Array<{
    journalLineId: string; date: string; account: "VAT_OUTPUT" | "VAT_INPUT";
    sourceType: string; sourceId: string | null; debit: string; credit: string; impact: string; memo: string;
    invoice: null | { number: string | null; taxTreatment: string | null };
  }>;
};

type PlatformTenant = {
  id: string;
  company_name: string;
  subdomain: string;
  status: string;
  plan: string | null;
  user_count: number;
  trial_ends_at: string | null;
  created_at: string | null;
};

type PlatformAuditEvent = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

type PlatformCapabilityStatus = {
  id: string;
  group: "Frozen product" | "Platform Kernel service";
  name: string;
  definition: string;
  implementation: string;
  verification: string;
  verificationScope: string;
  availability: string;
  currentEvidence: string;
  nextGate: string;
};
type OperationsEvidenceGate = {
  id: string;
  category: string;
  name: string;
  state: "not-recorded" | "recorded" | "requires-review";
  evidence: string;
  owner: string;
  nextGate: string;
};
type BackupManifestField = {
  key: string;
  label: string;
  required: boolean;
  classification: string;
  rule: string;
};
type BackupManifestContract = {
  status: "defined-not-implemented";
  version: string;
  purpose: string;
  forbiddenContent: string[];
  fields: BackupManifestField[];
  acceptanceRules: string[];
};
type BackupJobAdapterStatus = {
  status: "adapter-ready-no-scheduler";
  scheduler: "not-configured";
  executor: "injected";
  storage: "external-not-bound";
  evidenceTarget: string;
  currentBoundary: string;
  nextGate: string;
};
type BackupManifestRecord = {
  id: string;
  manifestId: string;
  contractVersion: string;
  environment: string;
  startedAt: string;
  completedAt: string;
  status: "succeeded" | "failed" | "partial";
  databaseSnapshotRef: string;
  objectSnapshotRef: string | null;
  checksum: string;
  encryptionRef: string;
  retentionExpiresAt: string;
  operator: string;
  failureReason: string | null;
  createdAt: string;
};

type PlatformControlCenter = {
  generatedAt: string;
  architecture: { status: "ACTIVE"; effectiveOn: string; blueprintEdition: string; changeControl: string };
  runtime: {
    api: { status: "operational"; scope: string };
    database: { status: "operational"; observedAt: string };
  };
  signals: { activeSessions: number; auditEvents24h: number; pastDueTenants: number; suspendedTenants: number };
  catalogue: PlatformCapabilityStatus[];
  operationsEvidence: {
    summary: Record<OperationsEvidenceGate["state"], number>;
    gates: OperationsEvidenceGate[];
  };
  backupManifest: BackupManifestContract;
  backupJobAdapter: BackupJobAdapterStatus;
  limitations: string[];
};

type AgeingBucketKey = "current" | "d30" | "d60" | "d90" | "d90plus";
type CurrencyAgeingView = {
  currency: "USD" | "ZWG";
  outstanding: string;
  overdue: string;
  buckets: Record<AgeingBucketKey, string>;
};
type AgedReceivableView = {
  invoiceId: string;
  number: string | null;
  contact: string;
  currency: "USD" | "ZWG";
  outstanding: string;
  daysOverdue: number;
};
type AgedReceivablesView = {
  asAt: string;
  currencies: CurrencyAgeingView[];
  items: AgedReceivableView[];
};
type DashboardReceivablesView = Pick<AgedReceivablesView, "asAt" | "currencies"> & {
  attentionItems: AgedReceivableView[];
};
const AGEING_BUCKET_LABELS = Object.entries(appEnglish.dashboard.buckets) as Array<
  [AgeingBucketKey, string]
>;
const idempotencyKey = (scope: string): string => {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${randomId}`;
};

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [booted, setBooted] = useState(false);

  const refresh = async () => {
    if (!getToken()) { setMe(null); setBooted(true); return; }
    try { setMe(await api("/me")); } catch { setToken(null); setMe(null); }
    setBooted(true);
  };
  useEffect(() => { refresh(); }, []);

  // white-label: apply tenant brand to CSS variables
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--brand", me?.tenant?.brandPrimaryColor ?? "#14171F");
    r.setProperty("--accent", me?.tenant?.brandSecondaryColor ?? "#C9A227");
    document.title = me?.tenant ? `${me.tenant.companyName} — VAKA OS` : "VAKA OS";
  }, [me]);

  const logout = () => {
    void api("/auth/logout", { method: "POST" }).finally(() => {
      setToken(null); setMe(null); setGate("landing");
    });
  };
  const [gate, setGate] = useState<"landing" | "login" | "signup">("landing");

  if (!booted) return null;
  if (!me) {
    if (gate === "landing") return <Landing onLogin={() => setGate("login")} onSignup={() => setGate("signup")} />;
    return <Auth initialMode={gate} onBack={() => setGate("landing")} onDone={refresh} />;
  }
  if (me.mustChangePassword) return <PasswordChange onDone={refresh} onLogout={logout} />;
  if (!me.tenant) return <PlatformAdmin onLogout={logout} />;
  return <Shell me={me} onLogout={logout} onRefresh={refresh} />;
}

function PasswordChange({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (newPassword !== confirmPassword) {
      setErr(appEnglish.auth.passwordMismatch);
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      await onDone();
    } catch (error: any) {
      setErr(error.message);
    }
    setBusy(false);
  };

  return (
    <div className="auth"><div className="box">
      <div className="brandline">VAKA Operating System</div>
      <h1>{appEnglish.auth.changeTemporaryPassword}</h1>
      <p>{appEnglish.auth.changeTemporaryPasswordHelp}</p>
      <div className="field">
        <label>{appEnglish.auth.temporaryPassword}</label>
        <input type="password" autoComplete="current-password" value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)} />
      </div>
      <div className="field">
        <label>{appEnglish.auth.newPassword}</label>
        <input type="password" autoComplete="new-password" value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)} />
      </div>
      <div className="field">
        <label>{appEnglish.auth.confirmPassword}</label>
        <input type="password" autoComplete="new-password" value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)} />
      </div>
      <button className="btn accent" style={{ width: "100%" }} disabled={busy} onClick={submit}>
        {busy ? appEnglish.auth.changingPassword : appEnglish.auth.changePassword}
      </button>
      {err && <div className="err-text">{err}</div>}
      <div className="alt"><a onClick={onLogout}>{appEnglish.auth.signOut}</a></div>
    </div></div>
  );
}

// ---------------------------------------------------------------------------
// Platform admin (Jonomi staff — users with no tenant)
// ---------------------------------------------------------------------------
function PlatformAdmin({ onLogout }: { onLogout: () => void }) {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [controlCenter, setControlCenter] = useState<PlatformControlCenter | null>(null);
  const [backupManifests, setBackupManifests] = useState<BackupManifestRecord[]>([]);
  const [tab, setTab] = useState<"overview" | "tenants" | "operations" | "guide">("overview");
  const [catalogueGroup, setCatalogueGroup] = useState<"all" | PlatformCapabilityStatus["group"]>("all");
  const [selectedTenant, setSelectedTenant] = useState<PlatformTenant | null>(null);
  const [tenantAudit, setTenantAudit] = useState<PlatformAuditEvent[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = appEnglish.platformAdmin;
  const load = () => Promise.all([
    api("/platform/tenants"),
    api("/platform/analytics"),
    api("/platform/control-center"),
    api("/platform/backup-manifests"),
  ])
    .then(([tenantRows, summary, control, manifests]) => {
      setTenants(tenantRows as PlatformTenant[]);
      setAnalytics(summary);
      setControlCenter(control as PlatformControlCenter);
      setBackupManifests(manifests as BackupManifestRecord[]);
    })
    .catch((e: any) => setMsg(e.message));
  useEffect(() => { void load(); }, []);
  const runBilling = async () => {
    if (!window.confirm(copy.billingConfirm)) return;
    setBusy(true); setMsg("");
    try {
      const r = await api("/platform/billing/run", { method: "POST", body: {} });
      setMsg(copy.billingComplete.replace("{result}", JSON.stringify(r)).slice(0, 400));
      await load();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  const reviewTenant = async (tenant: PlatformTenant) => {
    setSelectedTenant(tenant);
    setTenantAudit(null);
    setMsg("");
    try {
      const events = await api(`/platform/audit/${encodeURIComponent(tenant.id)}`);
      setTenantAudit(events as PlatformAuditEvent[]);
    } catch (e: any) {
      setMsg(e.message);
      setTenantAudit([]);
    }
  };
  const visibleCapabilities = controlCenter?.catalogue.filter((entry) =>
    catalogueGroup === "all" || entry.group === catalogueGroup) ?? [];
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">VAKA OS<small>{copy.title}</small></div>
        <nav>
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>{copy.overview}</button>
          <button className={tab === "tenants" ? "active" : ""} onClick={() => setTab("tenants")}>{copy.tenants}</button>
          <button className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}>{copy.operations}</button>
          <button className={tab === "guide" ? "active" : ""} onClick={() => setTab("guide")}>{copy.userGuide}</button>
        </nav>
        <div className="foot">
          Jonomi Digital Studio<br />
          <a style={{ color: "rgba(255,255,255,.7)", cursor: "pointer" }} onClick={onLogout}>Sign out</a>
        </div>
      </aside>
      <main className="main">
        <h1>{copy.title}</h1>
        <div className="sub">{copy.subtitle}</div>
        {tab === "overview" && <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn accent" disabled={busy} onClick={runBilling}>{busy ? copy.running : copy.runBilling}</button>
        </div>}
        {msg && <div className="banner warn">{msg}</div>}
        {tab === "overview" && analytics && <>
          <div className="cards">
            {[[copy.totalTenants, analytics.summary.total_tenants], [copy.trialTenants, analytics.summary.trial_tenants], [copy.activeTenants, analytics.summary.active_tenants], [copy.pastDueTenants, analytics.summary.past_due_tenants], [copy.suspendedTenants, analytics.summary.suspended_tenants], [copy.totalUsers, analytics.summary.total_users], [copy.signedInUsers, analytics.summary.signed_in_users], [copy.invoicesIssued, analytics.summary.invoices_issued], [copy.invoicesOutstanding, analytics.summary.invoices_outstanding]].map(([label, value]) => <div className="card" key={String(label)}><div className="k">{label}</div><div className="v">{value ?? 0}</div></div>)}
          </div>
          <div className="grid2">
            <div className="panel"><h2>{copy.planMix}</h2><table><thead><tr><th>{copy.plan}</th><th className="num">{copy.tenantCount}</th></tr></thead><tbody>{(analytics.planMix ?? []).map((row: any) => <tr key={row.plan}><td>{row.plan}</td><td className="num">{row.tenants}</td></tr>)}{!analytics.planMix?.length && <tr><td colSpan={2}>{copy.noData}</td></tr>}</tbody></table></div>
            <div className="panel"><h2>{copy.tenantGrowth}</h2><table><thead><tr><th>{copy.month}</th><th className="num">{copy.tenantCount}</th></tr></thead><tbody>{(analytics.tenantGrowth ?? []).map((row: any) => <tr key={row.month}><td>{row.month}</td><td className="num">{row.tenants}</td></tr>)}{!analytics.tenantGrowth?.length && <tr><td colSpan={2}>{copy.noData}</td></tr>}</tbody></table></div>
          </div>
          <div className="panel"><h2>{copy.billing}</h2><div className="table-scroll"><table><thead><tr><th>{copy.status}</th><th>{copy.currency}</th><th className="num">{copy.invoiceCount}</th><th className="num">{copy.amount}</th></tr></thead><tbody>{(analytics.billing ?? []).map((row: any) => <tr key={`${row.status}-${row.currency}`}><td>{row.status}</td><td>{row.currency}</td><td className="num">{row.invoices}</td><td className="num">{fmt(row.amount, row.currency)}</td></tr>)}{!analytics.billing?.length && <tr><td colSpan={4}>{copy.noData}</td></tr>}</tbody></table></div></div>
          <div className="panel"><h2>{copy.activity}</h2><div className="table-scroll"><table><thead><tr><th>{copy.action}</th><th className="num">{copy.events}</th></tr></thead><tbody>{(analytics.activity ?? []).map((row: any) => <tr key={row.action}><td>{row.action}</td><td className="num">{row.events}</td></tr>)}{!analytics.activity?.length && <tr><td colSpan={2}>{copy.noData}</td></tr>}</tbody></table></div></div>
        </>}
        {tab === "tenants" && <>
        <div className="panel">
          <h2>{copy.tenantsHeading.replace("{count}", String(tenants.length))}</h2>
          <div className="table-scroll"><table>
            <thead><tr><th>{copy.company}</th><th>{copy.subdomain}</th><th>{copy.status}</th><th>{copy.plan}</th><th className="num">{copy.users}</th><th>{copy.trialEnds}</th><th>{copy.created}</th><th>{copy.review}</th></tr></thead>
            <tbody>{tenants.map((t) => <tr key={t.id}><td>{t.company_name}</td><td>{t.subdomain}</td><td><span className={`pill ${t.status}`}>{t.status}</span></td><td>{t.plan ?? "—"}</td><td className="num">{t.user_count}</td><td>{t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString() : "—"}</td><td>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td><td><button className="btn ghost sm" onClick={() => void reviewTenant(t)}>{copy.reviewAudit}</button></td></tr>)}{!tenants.length && <tr><td colSpan={8}>{copy.noTenants}</td></tr>}</tbody>
          </table></div>
        </div>
        {selectedTenant && <div className="panel">
          <div className="panel-heading">
            <div><h2>{copy.auditFor.replace("{company}", selectedTenant.company_name)}</h2><div className="sub">{selectedTenant.id}</div></div>
            <button className="btn ghost sm" onClick={() => { setSelectedTenant(null); setTenantAudit(null); }}>{copy.close}</button>
          </div>
          {tenantAudit === null ? <p>{copy.loadingAudit}</p> : <div className="table-scroll"><table>
            <thead><tr><th>{copy.action}</th><th>{copy.entity}</th><th>{copy.entityId}</th><th>{copy.time}</th></tr></thead>
            <tbody>{tenantAudit.map((event) => <tr key={event.id}><td>{event.action}</td><td>{event.entityType ?? "—"}</td><td>{event.entityId ?? "—"}</td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}{!tenantAudit.length && <tr><td colSpan={4}>{copy.noAudit}</td></tr>}</tbody>
          </table></div>}
        </div>}
        </>}
        {tab === "operations" && controlCenter && <>
          <div className="architecture-banner">
            <div><span>{copy.architectureFreeze}</span><strong>{controlCenter.architecture.status}</strong></div>
            <p>{copy.effective.replace("{date}", controlCenter.architecture.effectiveOn)} · {copy.blueprintEdition.replace("{edition}", controlCenter.architecture.blueprintEdition)}. {controlCenter.architecture.changeControl}</p>
          </div>
          <div className="cards">
            <div className="card"><div className="k">{copy.apiObservation}</div><div className="v ok">{controlCenter.runtime.api.status}</div><small>{controlCenter.runtime.api.scope}</small></div>
            <div className="card"><div className="k">{copy.databaseObservation}</div><div className="v ok">{controlCenter.runtime.database.status}</div><small>{new Date(controlCenter.runtime.database.observedAt).toLocaleString()}</small></div>
            <div className="card"><div className="k">{copy.activeSessions}</div><div className="v">{controlCenter.signals.activeSessions}</div></div>
            <div className="card"><div className="k">{copy.auditEvents24h}</div><div className="v">{controlCenter.signals.auditEvents24h}</div></div>
            <div className="card"><div className="k">{copy.pastDueTenants}</div><div className="v">{controlCenter.signals.pastDueTenants}</div></div>
            <div className="card"><div className="k">{copy.suspendedTenants}</div><div className="v">{controlCenter.signals.suspendedTenants}</div></div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div><h2>{copy.capabilityStatus}</h2><div className="sub">{copy.capabilityStatusHelp}</div></div>
              <div className="field compact-field"><label htmlFor="capability-group">{copy.scope}</label><select id="capability-group" value={catalogueGroup} onChange={(event) => setCatalogueGroup(event.target.value as typeof catalogueGroup)}><option value="all">{copy.all}</option><option value="Frozen product">{copy.frozenProducts}</option><option value="Platform Kernel service">{copy.kernelServices}</option></select></div>
            </div>
            <div className="table-scroll"><table className="capability-table">
              <thead><tr><th>{copy.capability}</th><th>{copy.implementation}</th><th>{copy.verification}</th><th>{copy.availability}</th><th>{copy.currentEvidence}</th><th>{copy.nextGate}</th></tr></thead>
              <tbody>{visibleCapabilities.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong><small>{entry.group}</small></td><td><span className={`status-chip state-${entry.implementation}`}>{entry.implementation}</span></td><td><span className={`status-chip state-${entry.verification}`}>{entry.verification}</span><small>{entry.verificationScope}</small></td><td><span className={`status-chip state-${entry.availability}`}>{entry.availability}</span></td><td>{entry.currentEvidence}</td><td>{entry.nextGate}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div><h2>{copy.operationsEvidence}</h2><div className="sub">{copy.operationsEvidenceHelp}</div></div>
              <div className="evidence-summary" aria-label={copy.operationsEvidenceSummary}>
                <span><b>{controlCenter.operationsEvidence.summary["not-recorded"]}</b>{copy.notRecorded}</span>
                <span><b>{controlCenter.operationsEvidence.summary["requires-review"]}</b>{copy.requiresReview}</span>
                <span><b>{controlCenter.operationsEvidence.summary.recorded}</b>{copy.recorded}</span>
              </div>
            </div>
            <div className="table-scroll"><table className="evidence-table">
              <thead><tr><th>{copy.gate}</th><th>{copy.status}</th><th>{copy.owner}</th><th>{copy.currentEvidence}</th><th>{copy.nextGate}</th></tr></thead>
              <tbody>{controlCenter.operationsEvidence.gates.map((gate) => <tr key={gate.id}><td><strong>{gate.name}</strong><small>{gate.category}</small></td><td><span className={`status-chip state-${gate.state}`}>{gate.state}</span></td><td>{gate.owner}</td><td>{gate.evidence}</td><td>{gate.nextGate}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div><h2>{copy.backupManifest}</h2><div className="sub">{controlCenter.backupManifest.purpose}</div></div>
              <span className={`status-chip state-${controlCenter.backupManifest.status}`}>{controlCenter.backupManifest.status}</span>
            </div>
            <div className="sub">{copy.contractVersion.replace("{version}", controlCenter.backupManifest.version)}</div>
            <div className="table-scroll"><table className="evidence-table">
              <thead><tr><th>{copy.field}</th><th>{copy.required}</th><th>{copy.classification}</th><th>{copy.rule}</th></tr></thead>
              <tbody>{controlCenter.backupManifest.fields.map((field) => <tr key={field.key}><td><strong>{field.label}</strong><small>{field.key}</small></td><td>{field.required ? copy.yes : copy.no}</td><td><span className={`status-chip state-${field.classification}`}>{field.classification}</span></td><td>{field.rule}</td></tr>)}</tbody>
            </table></div>
            <div className="manifest-rules">
              <div><h3>{copy.acceptanceRules}</h3><ul>{controlCenter.backupManifest.acceptanceRules.map((rule) => <li key={rule}>{rule}</li>)}</ul></div>
              <div><h3>{copy.forbiddenContent}</h3><ul>{controlCenter.backupManifest.forbiddenContent.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div><h2>{copy.backupJobAdapter}</h2><div className="sub">{controlCenter.backupJobAdapter.currentBoundary}</div></div>
              <span className={`status-chip state-${controlCenter.backupJobAdapter.status}`}>{controlCenter.backupJobAdapter.status}</span>
            </div>
            <div className="cards compact-cards">
              <div className="card"><div className="k">{copy.scheduler}</div><div className="v">{controlCenter.backupJobAdapter.scheduler}</div></div>
              <div className="card"><div className="k">{copy.executor}</div><div className="v">{controlCenter.backupJobAdapter.executor}</div></div>
              <div className="card"><div className="k">{copy.storage}</div><div className="v">{controlCenter.backupJobAdapter.storage}</div></div>
              <div className="card"><div className="k">{copy.evidenceTarget}</div><div className="v">{controlCenter.backupJobAdapter.evidenceTarget}</div></div>
            </div>
            <p className="operations-note">{controlCenter.backupJobAdapter.nextGate}</p>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div><h2>{copy.recentBackupManifests}</h2><div className="sub">{copy.recentBackupManifestsHelp}</div></div>
            </div>
            <div className="table-scroll"><table className="evidence-table">
              <thead><tr><th>{copy.manifest}</th><th>{copy.status}</th><th>{copy.environment}</th><th>{copy.completed}</th><th>{copy.retention}</th><th>{copy.operator}</th><th>{copy.snapshotReference}</th></tr></thead>
              <tbody>{backupManifests.map((manifest) => <tr key={manifest.id}><td><strong>{manifest.manifestId}</strong><small>{manifest.contractVersion}</small></td><td><span className={`status-chip state-${manifest.status}`}>{manifest.status}</span>{manifest.failureReason && <small>{manifest.failureReason}</small>}</td><td>{manifest.environment}</td><td>{new Date(manifest.completedAt).toLocaleString()}</td><td>{new Date(manifest.retentionExpiresAt).toLocaleDateString()}</td><td>{manifest.operator}</td><td>{manifest.databaseSnapshotRef}</td></tr>)}
              {!backupManifests.length && <tr><td colSpan={7}>{copy.noBackupManifests}</td></tr>}</tbody>
            </table></div>
          </div>
          <div className="panel"><h2>{copy.limitations}</h2><ul className="operations-limitations">{controlCenter.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </>}
        {tab === "operations" && !controlCenter && !msg && <div className="panel">{copy.loadingOperations}</div>}
        {tab === "guide" && <PlatformAdminGuide />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function Auth({ onDone, initialMode = "login", onBack }: { onDone: () => void; initialMode?: "login" | "signup"; onBack?: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [f, setF] = useState<any>({
    baseCurrency: "USD",
    planName: "Starter",
    referralCode: new URLSearchParams(window.location.search).get("ref") ?? "",
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const res = mode === "login"
        ? await api("/auth/login", { method: "POST", body: { email: f.email, password: f.password, subdomain: f.subdomain || undefined } })
        : await api("/auth/signup", { method: "POST", body: f });
      setToken(res.token); onDone();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="auth"><div className="box">
      <div className="brandline">VAKA Operating System — Build Your Business</div>
      <h1>{mode === "login" ? "Sign in" : "Create your company"}</h1>
      {mode === "signup" && <>
        <div className="field"><label>Company name</label><input value={f.companyName ?? ""} onChange={set("companyName")} placeholder="Harare Retail (Pvt) Ltd" /></div>
        <div className="grid2">
          <div className="field"><label>Subdomain</label><input value={f.subdomain ?? ""} onChange={set("subdomain")} placeholder="harare-retail" /></div>
          <div className="field"><label>Base currency</label>
            <select value={f.baseCurrency} onChange={set("baseCurrency")}><option>USD</option><option>ZWG</option></select></div>
        </div>
        <div className="field"><label>Your full name</label><input value={f.ownerName ?? ""} onChange={set("ownerName")} /></div>
      </>}
      {mode === "login" && <div className="field"><label>Company subdomain (optional)</label><input value={f.subdomain ?? ""} onChange={set("subdomain")} placeholder="harare-retail" /></div>}
      <div className="field"><label>Email</label><input type="email" value={(mode === "login" ? f.email : f.ownerEmail) ?? ""} onChange={set(mode === "login" ? "email" : "ownerEmail")} /></div>
      <div className="field"><label>Password</label><input type="password" value={(mode === "login" ? f.password : f.ownerPassword) ?? ""} onChange={set(mode === "login" ? "password" : "ownerPassword")} /></div>
      {mode === "signup" && <div className="field"><label>Plan (3 months free on all plans)</label>
        <select value={f.planName} onChange={set("planName")}>
          <option>Starter</option><option>Growth</option><option>Business</option><option>Enterprise</option>
        </select></div>}
      {mode === "signup" && <div className="field">
        <label>{appEnglish.auth.referralCode}</label>
        <input value={f.referralCode ?? ""} onChange={set("referralCode")} placeholder={appEnglish.auth.referralPlaceholder} />
        <small>{appEnglish.auth.referralHelp}</small>
      </div>}
      <button className="btn accent" style={{ width: "100%" }} disabled={busy} onClick={submit}>
        {busy ? "Working…" : mode === "login" ? "Sign in" : "Create company — start 3 months free"}
      </button>
      {err && <div className="err-text">{err}</div>}
      <div className="alt">
        {mode === "login"
          ? <>New here? <a onClick={() => setMode("signup")}>Create your company</a></>
          : <>Already registered? <a onClick={() => setMode("login")}>Sign in</a></>}
        {onBack && <> · <a onClick={onBack}>Back to home</a></>}
      </div>
    </div></div>
  );
}

// ---------------------------------------------------------------------------
// Shell + navigation
// ---------------------------------------------------------------------------
const NAV = [
  ["dashboard", "Dashboard"], ["contacts", "Contacts"], ["pipeline", "Sales Pipeline"],
  ["invoices", "Invoices"], ["products", "Products & Stock"], ["pos", "Purchase Orders"],
  ["reports", "Reports"], ["imports", "Imports"], ["usersActivity", appEnglish.activity.nav], ["billing", "Billing & Plan"],
  ["upgrade", "Upgrade"], ["settings", "Settings"],
] as const;
type Page = (typeof NAV)[number][0];

function Shell({ me, onLogout, onRefresh }: { me: Me; onLogout: () => void; onRefresh: () => void }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [arrears] = useLoad(() => api("/billing/arrears-status"));
  const t = me.tenant!;
  const suspended = me.accessLevel !== "full";
  const visibleNav = NAV.filter(([key]) =>
    (key !== "imports" || me.permissions.includes("imports.create"))
    && (key !== "usersActivity" || me.isTenantOwner));
  const trialDays = Math.max(0, Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 86400000));
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">
          {t.logoUrl && <img src={t.logoUrl} alt="" className="workspace-logo" />}
          {t.companyName}<small>VAKA OS</small>
        </div>
        <nav>
          {visibleNav.map(([k, label]) => (
            <button key={k} className={page === k ? "active" : ""} onClick={() => setPage(k)}>{label}</button>
          ))}
        </nav>
        <div className="foot">
          Workspace: {t.subdomain} · Powered by VAKA OS<br />
          <a style={{ color: "rgba(255,255,255,.7)", cursor: "pointer" }} onClick={onLogout}>Sign out</a>
        </div>
      </aside>
      <main className="main">
        {arrears && arrears.stage !== "CLEAR" && (
          <ArrearsBar status={arrears as ArrearsStatus} onBilling={() => setPage("billing")} />
        )}
        {t.status === "TRIAL" && <div className="banner warn">Free onboarding period — {trialDays} days remaining. Your first invoice arrives when the trial ends.</div>}
        {page === "dashboard" && <Dashboard ccy={t.baseCurrency} />}
        {page === "contacts" && <Contacts readonly={suspended} />}
        {page === "pipeline" && <Pipeline readonly={suspended} />}
        {page === "invoices" && <Invoices readonly={suspended} baseCcy={t.baseCurrency} />}
        {page === "products" && <Products readonly={suspended} />}
        {page === "pos" && <PurchaseOrders readonly={suspended} />}
        {page === "reports" && <Reports ccy={t.baseCurrency} />}
        {page === "usersActivity" && me.isTenantOwner && <UsersActivity />}
        {page === "imports" && <ImportCenter
          readonly={suspended}
          canApprove={me.permissions.includes("imports.approve")}
          canConfigureBanks={me.permissions.includes("bank_accounts.configure")}
          canPrepareReconciliation={me.permissions.includes("bank_reconciliation.prepare")}
          canApproveReconciliation={me.permissions.includes("bank_reconciliation.approve")}
          canPostBankFees={me.permissions.includes("bank_transactions.match") && me.permissions.includes("accounting.post")}
          canMatchBankTransfers={me.permissions.includes("bank_transactions.match") && me.permissions.includes("accounting.post")}
        />}
        {page === "billing" && <Billing />}
        {page === "upgrade" && <Upgrade />}
        {page === "settings" && <Settings me={me} readonly={suspended} onSaved={onRefresh} />}
      </main>
    </div>
  );
}

function ArrearsBar({ status, onBilling }: { status: ArrearsStatus; onBilling: () => void }) {
  const copy = appEnglish.arrears;
  const amounts = status.amounts.map((item) => fmt(item.amount, item.currency)).join(" + ");
  const isUrgent = status.stage === "OVERDUE" || status.stage === "SUSPENDED";
  const message = status.stage === "SUSPENDED"
    ? copy.suspended.replace("{amount}", amounts)
    : status.stage === "OVERDUE"
      ? copy.overdue
        .replace("{amount}", amounts)
        .replace("{days}", String(status.daysOverdue))
      : copy.dueSoon
        .replace("{amount}", amounts)
        .replace("{date}", status.oldestDueAt
          ? new Date(status.oldestDueAt).toLocaleDateString("en-ZW")
          : "");
  return (
    <div className={`arrears-bar ${isUrgent ? "urgent" : "notice"}`} role={isUrgent ? "alert" : "status"}>
      <span><b>{isUrgent ? copy.actionRequired : copy.reminder}</b> {message}</span>
      <button className="btn sm" onClick={onBilling}>{copy.openBilling}</button>
    </div>
  );
}

type ImportPreview = {
  batch: {
    id: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
  };
  rows: Array<{
    rowNumber: number;
    status: "VALID" | "INVALID" | "DUPLICATE";
    error: string | null;
    data: Record<string, unknown>;
  }>;
  baseCurrency?: "USD" | "ZWG";
};

function ImportCenter({
  readonly, canApprove, canConfigureBanks, canPrepareReconciliation, canApproveReconciliation, canPostBankFees,
  canMatchBankTransfers,
}: {
  readonly: boolean;
  canApprove: boolean;
  canConfigureBanks: boolean;
  canPrepareReconciliation: boolean;
  canApproveReconciliation: boolean;
  canPostBankFees: boolean;
  canMatchBankTransfers: boolean;
}) {
  type ImportKind = "contacts" | "products" | "opening-stock" | "bank-statement";
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [bankAccounts, setBankAccounts] = useState<Array<{
    id: string; name: string; bankName: string; accountNumber: string; currency: "USD" | "ZWG";
  }>>([]);
  const [bankTransactions, setBankTransactions] = useState<Array<{
    id: string;
    date: string;
    description: string;
    amount: string;
    reference: string | null;
    matchedJournalEntryId: string | null;
  }>>([]);
  const [bankSummary, setBankSummary] = useState<null | {
    account: { id: string; currency: "USD" | "ZWG" };
    totalLines: number;
    matchedLines: number;
    unreviewedLines: number;
    inflow: string;
    outflow: string;
    netMovement: string;
    matchedNet: string;
    unreviewedNet: string;
    firstTransactionDate: string | null;
    lastTransactionDate: string | null;
    oldestUnreviewedDate: string | null;
  }>(null);
  const [bankWorksheet, setBankWorksheet] = useState<null | {
    account: { id: string; currency: "USD" | "ZWG" };
    statementDate: string;
    statementClosingBalance: string;
    openingBalance: string;
    importedNetMovement: string;
    expectedBookBalance: string;
    difference: string;
    totalLines: number;
    matchedLines: number;
    unreviewedLines: number;
    unreviewedNet: string;
    inflow: string;
    outflow: string;
    firstTransactionDate: string | null;
    lastTransactionDate: string | null;
    status: "balanced" | "needs_review";
  }>(null);
  const [bankReconciliations, setBankReconciliations] = useState<Array<{
    id: string;
    statementDate: string;
    statementClosingBalance: string;
    expectedBookBalance: string;
    difference: string;
    unreviewedLines: number;
    status: "PREPARED" | "APPROVED";
    reconciliationStatus: "balanced" | "needs_review";
    preparedAt: string;
    approvedAt: string | null;
  }>>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [worksheetInput, setWorksheetInput] = useState({
    statementDate: new Date().toISOString().slice(0, 10),
    statementClosingBalance: "",
  });
  const [newBank, setNewBank] = useState({
    name: "", bankName: "", accountNumber: "", currency: "USD" as "USD" | "ZWG",
  });
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoData, setLogoData] = useState<string | null>(null);
  const copy = appEnglish.imports;
  const [captureType, setCaptureType] = useState<"INVOICE" | "RECEIPT" | "CONTACT" | "OTHER">("INVOICE");
  const [captures, reloadCaptures] = useLoad(() => api("/captures"));
  const [selectedCapture, setSelectedCapture] = useState<any>(null);
  const [captureNote, setCaptureNote] = useState("");
  const [captureReviewBusy, setCaptureReviewBusy] = useState(false);
  const captureTypeLabel = (type: string) => ({
    INVOICE: copy.captureInvoice,
    RECEIPT: copy.captureReceipt,
    CONTACT: copy.captureContact,
    OTHER: copy.captureOther,
  }[type] ?? type);
  const captureStatusLabel = (status: string) => ({
    CAPTURED: copy.captureCaptured,
    REVIEWED: copy.captureStatusReviewed,
    REJECTED: copy.captureStatusRejected,
  }[status] ?? copy.captureStatusUnknown);

  const loadBankAccounts = async () => {
    try {
      const accounts = await api("/bank-accounts");
      setBankAccounts(accounts);
      setBankAccountId((current) => current || accounts[0]?.id || "");
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const loadBankTransactions = async (accountId: string) => {
    try {
      setBankTransactions(await api(`/bank-transactions?bankAccountId=${accountId}`));
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const loadBankSummary = async (accountId: string) => {
    try {
      setBankSummary(await api(`/bank-accounts/${accountId}/reconciliation-summary`));
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const loadBankReconciliations = async (accountId: string) => {
    try {
      setBankReconciliations(await api(`/bank-accounts/${accountId}/reconciliations`));
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const previewBankWorksheet = async () => {
    if (!bankAccountId) return;
    setBusy(true);
    setMessage("");
    try {
      const query = new URLSearchParams({
        statementDate: worksheetInput.statementDate,
        statementClosingBalance: worksheetInput.statementClosingBalance,
      });
      setBankWorksheet(await api(`/bank-accounts/${bankAccountId}/reconciliation-worksheet?${query}`));
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const prepareBankReconciliation = async () => {
    if (!bankAccountId || !bankWorksheet) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/bank-accounts/${bankAccountId}/reconciliations`, {
        method: "POST",
        body: {
          statementDate: bankWorksheet.statementDate,
          statementClosingBalance: bankWorksheet.statementClosingBalance,
        },
      });
      setMessage(copy.reconciliationPrepared);
      await loadBankReconciliations(bankAccountId);
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const approveBankReconciliation = async (reportId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await api(`/bank-reconciliations/${reportId}/approve`, { method: "POST", body: {} });
      setMessage(copy.reconciliationApproved);
      if (bankAccountId) await loadBankReconciliations(bankAccountId);
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const downloadBankReconciliationReport = async (reportId: string) => {
    setBusy(true);
    setMessage("");
    try {
      const report = await api(`/bank-reconciliations/${reportId}/report`);
      const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const summaryRows = [
        [copy.reportCompany, report.companyName],
        [copy.bankAccount, `${report.account.bankName ?? ""} ${report.account.name}`.trim()],
        [copy.maskedAccount, report.account.accountNumber ?? ""],
        [copy.currency, report.account.currency],
        [copy.statementDate, report.reconciliation.statementDate],
        [copy.status, report.reconciliation.status],
        [copy.worksheetStatus, report.reconciliation.reconciliationStatus],
        [copy.openingBalance, report.reconciliation.openingBalance],
        [copy.importedMovement, report.reconciliation.importedNetMovement],
        [copy.expectedBookBalance, report.reconciliation.expectedBookBalance],
        [copy.statementClosingBalance, report.reconciliation.statementClosingBalance],
        [copy.difference, report.reconciliation.difference],
        [copy.unreviewedLines, report.reconciliation.unreviewedLines],
        [copy.preparedBy, report.reconciliation.preparedByName ?? ""],
        [copy.preparedAt, report.reconciliation.preparedAt],
        [copy.approvedBy, report.reconciliation.approvedByName ?? ""],
        [copy.approvedAt, report.reconciliation.approvedAt ?? ""],
        [copy.generatedAt, report.generatedAt],
      ];
      const lineRows = [
        [copy.date, copy.description, copy.reference, copy.amount, copy.status],
        ...report.lines.map((line: any) => [line.date, line.description, line.reference ?? "", line.amount, line.status]),
      ];
      const csv = [
        copy.reconciliationReportTitle,
        ...summaryRows.map((row) => row.map(escapeCsv).join(",")),
        "",
        copy.supportingBankLines,
        ...lineRows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vaka-bank-reconciliation-${report.reconciliation.statementDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(copy.reconciliationReportDownloaded);
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (kind === "bank-statement") void loadBankAccounts();
  }, [kind]);

  useEffect(() => {
    if (kind === "bank-statement" && bankAccountId) {
      setBankWorksheet(null);
      void loadBankTransactions(bankAccountId);
      void loadBankSummary(bankAccountId);
      void loadBankReconciliations(bankAccountId);
    }
    if (kind !== "bank-statement") {
      setBankTransactions([]);
      setBankSummary(null);
      setBankWorksheet(null);
      setBankReconciliations([]);
    }
  }, [kind, bankAccountId]);

  const selectedBankAccount = bankAccounts.find((account) => account.id === bankAccountId);

  const createBankAccount = async () => {
    setBusy(true);
    setMessage("");
    try {
      const account = await api("/bank-accounts", { method: "POST", body: newBank });
      setBankAccounts((current) => [...current, account]);
      setBankAccountId(account.id);
      setBankTransactions([]);
      setBankSummary(null);
      setBankWorksheet(null);
      setBankReconciliations([]);
      setNewBank({ name: "", bankName: "", accountNumber: "", currency: "USD" });
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const matchBankTransaction = async (transaction: {
    id: string; amount: string; reference: string | null; description: string;
  }) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/bank-transactions/${transaction.id}/match-candidates`);
      const candidate = result.candidates?.[0];
      if (!candidate) {
        setMessage(copy.noInvoiceMatch);
        setBusy(false);
        return;
      }
      const confirmed = window.confirm(copy.matchConfirm
        .replace("{invoice}", candidate.number ?? candidate.id)
        .replace("{customer}", candidate.contact_name)
        .replace("{bankAmount}", `${selectedBankAccount?.currency ?? candidate.currency} ${transaction.amount}`)
        .replace("{outstanding}", `${candidate.currency} ${candidate.outstanding}`));
      if (!confirmed) {
        setBusy(false);
        return;
      }
      await api(`/bank-transactions/${transaction.id}/match-invoice`, {
        method: "POST",
        body: { invoiceId: candidate.id },
      });
      setMessage(copy.matchedInvoice.replace("{invoice}", candidate.number ?? candidate.id));
      if (bankAccountId) {
        await loadBankTransactions(bankAccountId);
        await loadBankSummary(bankAccountId);
        setBankWorksheet(null);
      }
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const splitMatchBankTransaction = async (transaction: {
    id: string; amount: string; reference: string | null; description: string;
  }) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/bank-transactions/${transaction.id}/split-candidates`);
      const candidates = result.candidates ?? [];
      if (candidates.length < 2) {
        setMessage(copy.noSplitMatch);
        setBusy(false);
        return;
      }
      const candidateLines = candidates.slice(0, 8)
        .map((candidate: any) => `${candidate.number}: ${candidate.currency} ${candidate.outstanding} · ${candidate.contact_name}`)
        .join("\n");
      const input = window.prompt(copy.splitPrompt
        .replace("{bankAmount}", `${selectedBankAccount?.currency ?? ""} ${transaction.amount}`)
        .replace("{candidates}", candidateLines));
      if (!input) {
        setBusy(false);
        return;
      }
      const allocations = input.split(",").map((part) => {
        const [invoiceNumber, amount] = part.split("=").map((value) => value.trim());
        return { invoiceNumber, amount };
      }).filter((allocation) => allocation.invoiceNumber && allocation.amount);
      if (allocations.length < 2) {
        setMessage(copy.splitFormatHelp);
        setBusy(false);
        return;
      }
      await api(`/bank-transactions/${transaction.id}/match-invoices`, {
        method: "POST",
        body: { allocations },
      });
      setMessage(copy.splitMatched.replace("{count}", String(allocations.length)));
      if (bankAccountId) {
        await loadBankTransactions(bankAccountId);
        await loadBankSummary(bankAccountId);
        setBankWorksheet(null);
      }
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const postBankFee = async (transaction: {
    id: string; amount: string; reference: string | null; description: string;
  }) => {
    const confirmed = window.confirm(copy.bankFeeConfirm
      .replace("{amount}", `${selectedBankAccount?.currency ?? ""} ${transaction.amount}`)
      .replace("{description}", transaction.description));
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/bank-transactions/${transaction.id}/post-bank-fee`, { method: "POST", body: {} });
      setMessage(copy.bankFeePosted);
      if (bankAccountId) {
        await loadBankTransactions(bankAccountId);
        await loadBankSummary(bankAccountId);
        setBankWorksheet(null);
      }
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const matchBankTransfer = async (transaction: {
    id: string; amount: string; reference: string | null; description: string;
  }) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/bank-transactions/${transaction.id}/transfer-candidates`);
      const candidate = result.candidates?.[0];
      if (!candidate) {
        setMessage(copy.noTransferMatch);
        setBusy(false);
        return;
      }
      const confirmed = window.confirm(copy.transferConfirm
        .replace("{amount}", `${candidate.currency} ${Math.abs(Number(transaction.amount)).toFixed(2)}`)
        .replace("{from}", Number(transaction.amount) < 0
          ? `${selectedBankAccount?.bankName ?? ""} ${selectedBankAccount?.name ?? ""}`.trim()
          : `${candidate.bank_name ?? ""} ${candidate.bank_account_name ?? ""}`.trim())
        .replace("{to}", Number(transaction.amount) > 0
          ? `${selectedBankAccount?.bankName ?? ""} ${selectedBankAccount?.name ?? ""}`.trim()
          : `${candidate.bank_name ?? ""} ${candidate.bank_account_name ?? ""}`.trim()));
      if (!confirmed) {
        setBusy(false);
        return;
      }
      await api(`/bank-transactions/${transaction.id}/match-transfer`, {
        method: "POST",
        body: { counterpartyBankTransactionId: candidate.id },
      });
      setMessage(copy.transferMatched);
      if (bankAccountId) {
        await loadBankTransactions(bankAccountId);
        await loadBankSummary(bankAccountId);
        setBankWorksheet(null);
      }
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const readCaptureData = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(copy.captureFailed));
    reader.readAsDataURL(blob);
  });

  const prepareCapture = async (file: File) => {
    if (file.type.startsWith("image/") && file.size > 1_200_000 && "createImageBitmap" in window) {
      const bitmap = await createImageBitmap(file);
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const compressed = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error(copy.captureFailed)), "image/jpeg", 0.72);
      });
      return { dataUrl: await readCaptureData(compressed), fileName: `${file.name.replace(/\.[^.]+$/, "")}.jpg` };
    }
    return { dataUrl: await readCaptureData(file), fileName: file.name };
  };

  const captureFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const prepared = await prepareCapture(file);
      await api("/captures", { method: "POST", body: { documentType: captureType, ...prepared } });
      setMessage(copy.captureReady);
      reloadCaptures();
      event.target.value = "";
    } catch (error: any) { setMessage(error.message || copy.captureFailed); }
    setBusy(false);
  };

  const openCapture = async (captureId: string) => {
    setCaptureReviewBusy(true);
    try {
      const detail = await api(`/captures/${captureId}`);
      setSelectedCapture(detail);
      setCaptureNote(detail.reviewNote ?? "");
    } catch (error: any) { setMessage(error.message); }
    setCaptureReviewBusy(false);
  };

  const reviewCapture = async (status: "REVIEWED" | "REJECTED") => {
    if (!selectedCapture) return;
    setCaptureReviewBusy(true);
    try {
      await api(`/captures/${selectedCapture.id}/review`, { method: "POST", body: { status, note: captureNote || undefined } });
      setMessage(status === "REVIEWED" ? copy.captureReviewed : copy.captureRejected);
      setSelectedCapture(null);
      reloadCaptures();
    } catch (error: any) { setMessage(error.message || copy.captureReviewFailed); }
    setCaptureReviewBusy(false);
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setMessage("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setMessage(copy.csvOnly);
      return;
    }
    if (file.size > 1_000_000) {
      setMessage(copy.tooLarge);
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const csvText = await file.text();
      setPreview(await api(`/imports/${kind}/preview`, {
        method: "POST",
        body: kind === "bank-statement" ? { csvText, bankAccountId } : { csvText },
      }));
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/imports/${kind}/${preview.batch.id}/commit`, {
        method: "POST",
        body: {},
      });
      const completion = kind === "contacts"
        ? copy.contactsCompleted
        : kind === "products"
          ? copy.productsCompleted
          : kind === "opening-stock"
            ? copy.openingStockCompleted.replace("{value}", `${preview.baseCurrency} ${result.totalValue}`)
            : copy.bankStatementCompleted;
      setMessage(completion.replace("{count}", String(result.importedRows)));
      if (kind === "bank-statement" && bankAccountId) {
        void loadBankTransactions(bankAccountId);
        void loadBankSummary(bankAccountId);
        void loadBankReconciliations(bankAccountId);
        setBankWorksheet(null);
      }
      setPreview(null);
      setFileName("");
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  return (<>
    <h1>{copy.title}</h1><div className="sub">{copy.subtitle}</div>
    <div className="panel">
      <h2>{copy.captureTitle}</h2>
      <p className="sub">{copy.captureHelp}</p>
      <div className="grid2">
        <div className="field"><label htmlFor="capture-type">{copy.captureType}</label><select id="capture-type" value={captureType} disabled={busy || readonly} onChange={(event) => setCaptureType(event.target.value as typeof captureType)}>
          <option value="INVOICE">{copy.captureInvoice}</option><option value="RECEIPT">{copy.captureReceipt}</option><option value="CONTACT">{copy.captureContact}</option><option value="OTHER">{copy.captureOther}</option>
        </select></div>
        <div className="field"><label htmlFor="capture-file">{copy.captureFile}</label><input id="capture-file" type="file" accept="image/*,application/pdf" capture="environment" disabled={busy || readonly} onChange={captureFile} /></div>
      </div>
      <h3>{copy.captureListTitle}</h3>
      {!captures?.length ? <p className="sub">{copy.captureNone}</p> : <div className="table-scroll"><table><thead><tr><th>{copy.captureType}</th><th>{copy.fileName}</th><th>{copy.status}</th><th>{copy.createdAt}</th><th className="num">{copy.captureBytes}</th><th /></tr></thead><tbody>{captures.map((capture: any) => <tr key={capture.id}><td>{captureTypeLabel(capture.documentType)}</td><td>{capture.fileName}</td><td>{captureStatusLabel(capture.status)}</td><td>{new Date(capture.createdAt).toLocaleString()}</td><td className="num">{capture.byteSize}</td><td><button type="button" className="btn ghost sm" disabled={captureReviewBusy} onClick={() => openCapture(capture.id)}>{copy.captureOpen}</button></td></tr>)}</tbody></table></div>}
    </div>
    {selectedCapture && <div className="modalbg" role="presentation" onClick={() => setSelectedCapture(null)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="capture-review-title" onClick={(event) => event.stopPropagation()}>
      <h2 id="capture-review-title">{copy.captureReviewTitle}</h2>
      <p className="sub">{copy.captureReviewHelp}</p>
      {selectedCapture.mediaType.startsWith("image/") ? <img src={selectedCapture.dataUrl} alt={selectedCapture.fileName} style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain" }} /> : <iframe src={selectedCapture.dataUrl} title={copy.capturePreviewTitle} style={{ width: "100%", height: 420, border: "1px solid var(--line)" }} />}
      <div className="field"><label htmlFor="capture-review-note">{copy.captureReviewNote}</label><textarea id="capture-review-note" value={captureNote} onChange={(event) => setCaptureNote(event.target.value)} disabled={captureReviewBusy} /></div>
      <div className="row end"><button className="btn ghost" onClick={() => setSelectedCapture(null)}>{copy.captureClose}</button>{selectedCapture.status === "CAPTURED" && canApprove && !readonly && <><button className="btn ghost" disabled={captureReviewBusy} onClick={() => reviewCapture("REJECTED")}>{copy.captureReject}</button><button className="btn accent" disabled={captureReviewBusy} onClick={() => reviewCapture("REVIEWED")}>{copy.captureReview}</button></>}</div>
    </div></div>}
    <div className="panel">
      <div className="field">
        <label htmlFor="import-type">{copy.importType}</label>
        <select id="import-type" value={kind} disabled={busy} onChange={(event) => {
          setKind(event.target.value as ImportKind);
          setPreview(null);
          setFileName("");
          setMessage("");
        }}>
          <option value="contacts">{copy.contactsOption}</option>
          <option value="products">{copy.productsOption}</option>
          <option value="opening-stock">{copy.openingStockOption}</option>
          <option value="bank-statement">{copy.bankStatementOption}</option>
        </select>
      </div>
      <h2>{kind === "contacts"
        ? copy.contactsTitle
        : kind === "products"
          ? copy.productsTitle
          : kind === "opening-stock" ? copy.openingStockTitle : copy.bankStatementTitle}</h2>
      <p className="sub">{kind === "contacts"
        ? copy.contactsHelp
        : kind === "products"
          ? copy.productsHelp
          : kind === "opening-stock" ? copy.openingStockHelp : copy.bankStatementHelp}</p>
      {kind === "bank-statement" && <>
        {bankAccounts.length > 0 && <div className="field">
          <label htmlFor="bank-account">{copy.bankAccount}</label>
          <select id="bank-account" value={bankAccountId}
            onChange={(event) => setBankAccountId(event.target.value)}>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>
              {account.bankName} · {account.name} · {account.accountNumber} · {account.currency}
            </option>)}
          </select>
        </div>}
        {bankAccounts.length === 0 && canConfigureBanks && <div className="import-bank-setup">
          <h3>{copy.addBankAccount}</h3>
          <div className="grid2">
            <div className="field"><label>{copy.accountName}</label>
              <input value={newBank.name} onChange={(event) =>
                setNewBank({ ...newBank, name: event.target.value })} /></div>
            <div className="field"><label>{copy.bankName}</label>
              <input value={newBank.bankName} onChange={(event) =>
                setNewBank({ ...newBank, bankName: event.target.value })} /></div>
            <div className="field"><label>{copy.maskedAccount}</label>
              <input value={newBank.accountNumber} placeholder={copy.maskedAccountPlaceholder} onChange={(event) =>
                setNewBank({ ...newBank, accountNumber: event.target.value })} /></div>
            <div className="field"><label>{copy.currency}</label>
              <select value={newBank.currency} onChange={(event) =>
                setNewBank({ ...newBank, currency: event.target.value as "USD" | "ZWG" })}>
                <option value="USD">USD</option><option value="ZWG">ZWG</option>
              </select></div>
          </div>
          <button className="btn" disabled={readonly || busy} onClick={createBankAccount}>
            {copy.createBankAccount}</button>
        </div>}
      </>}
      <div className="import-template">
        <code>{kind === "contacts"
          ? "name,email,phone,type,is_customer,is_vendor,tax_number,tags"
          : kind === "products"
            ? "sku,name,description,unit,cost_price,sale_price,currency,tax_rate,reorder_level,track_stock,is_active"
            : kind === "opening-stock"
              ? "sku,warehouse,quantity,unit_cost"
              : "date,description,amount,reference"}</code>
      </div>
      {kind === "opening-stock" && <p className="sub">{copy.openingStockWarning}</p>}
      {kind === "bank-statement" && <p className="sub">{copy.bankStatementWarning}</p>}
      <div className="field">
        <label>{copy.chooseCsv}</label>
        <input type="file" accept=".csv,text/csv"
          disabled={readonly || busy || (kind === "bank-statement" && !bankAccountId)}
          onChange={selectFile} />
        {fileName && <small>{fileName}</small>}
      </div>
    </div>
    {preview && <div className="panel">
      <div className="import-summary">
        <span>{copy.total}: <b>{preview.batch.totalRows}</b></span>
        <span>{copy.valid}: <b>{preview.batch.validRows}</b></span>
        <span>{copy.duplicates}: <b>{preview.batch.duplicateRows}</b></span>
        <span>{copy.invalid}: <b>{preview.batch.invalidRows}</b></span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>{copy.row}</th>
            {kind !== "contacts" && kind !== "bank-statement" && <th>{copy.sku}</th>}
            {kind === "opening-stock"
              ? <><th>{copy.warehouse}</th><th>{copy.quantity}</th><th>{copy.unitCost}</th></>
              : kind === "bank-statement"
                ? <><th>{copy.date}</th><th>{copy.description}</th><th>{copy.amount}</th></>
              : <><th>{copy.name}</th><th>{kind === "contacts" ? copy.email : copy.salePrice}</th></>}
            <th>{copy.status}</th><th>{copy.issue}</th></tr></thead>
          <tbody>{preview.rows.map((row) => (
            <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              {kind !== "contacts" && kind !== "bank-statement" && <td>{String(row.data.sku ?? "—")}</td>}
              {kind === "opening-stock"
                ? <><td>{String(row.data.warehouse ?? "—")}</td>
                  <td>{String(row.data.quantity ?? "—")}</td>
                  <td>{String(row.data.unitCost ?? "—")}</td></>
                : kind === "bank-statement"
                  ? <><td>{row.data.date ? new Date(String(row.data.date)).toLocaleDateString("en-ZW") : "—"}</td>
                    <td>{String(row.data.description ?? "—")}</td>
                    <td>{String(row.data.amount ?? "—")}</td></>
                : <><td>{String(row.data.name ?? "—")}</td>
                  <td>{String((kind === "contacts" ? row.data.email : row.data.salePrice) ?? "—")}</td></>}
              <td><span className={`pill ${row.status}`}>{row.status}</span></td>
              <td>{row.error ?? "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="sub">{copy.previewNotice}</p>
      <button className="btn accent" disabled={!canApprove || readonly || busy || preview.batch.validRows === 0}
        onClick={commit}>{busy ? copy.importing : copy.approve}</button>
      {!canApprove && <p className="sub">{copy.approvalPermission}</p>}
    </div>}
    {kind === "bank-statement" && bankAccountId && <div className="panel">
      <h2>{copy.reconciliationSummaryTitle}</h2>
      <p className="sub">{copy.reconciliationSummaryHelp}</p>
      {bankSummary && <div className="import-summary">
        <span>{copy.totalLines}: <b>{bankSummary.totalLines}</b></span>
        <span>{copy.matchedLines}: <b>{bankSummary.matchedLines}</b></span>
        <span>{copy.unreviewedLines}: <b>{bankSummary.unreviewedLines}</b></span>
        <span>{copy.inflow}: <b>{fmt(bankSummary.inflow, bankSummary.account.currency)}</b></span>
        <span>{copy.outflow}: <b>{fmt(bankSummary.outflow, bankSummary.account.currency)}</b></span>
        <span>{copy.netMovement}: <b>{fmt(bankSummary.netMovement, bankSummary.account.currency)}</b></span>
        <span>{copy.unreviewedNet}: <b>{fmt(bankSummary.unreviewedNet, bankSummary.account.currency)}</b></span>
        <span>{copy.dateRange}: <b>{bankSummary.firstTransactionDate
          ? `${new Date(bankSummary.firstTransactionDate).toLocaleDateString("en-ZW")} – ${new Date(bankSummary.lastTransactionDate ?? bankSummary.firstTransactionDate).toLocaleDateString("en-ZW")}`
          : "—"}</b></span>
        <span>{copy.oldestUnreviewed}: <b>{bankSummary.oldestUnreviewedDate
          ? new Date(bankSummary.oldestUnreviewedDate).toLocaleDateString("en-ZW")
          : "—"}</b></span>
      </div>}
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="field">
          <label>{copy.statementDate}</label>
          <input type="date" value={worksheetInput.statementDate}
            onChange={(event) => setWorksheetInput({ ...worksheetInput, statementDate: event.target.value })} />
        </div>
        <div className="field">
          <label>{copy.statementClosingBalance}</label>
          <input inputMode="decimal" placeholder="0.00" value={worksheetInput.statementClosingBalance}
            onChange={(event) => setWorksheetInput({ ...worksheetInput, statementClosingBalance: event.target.value })} />
        </div>
      </div>
      <button className="btn sm" disabled={busy || !worksheetInput.statementDate || !worksheetInput.statementClosingBalance}
        onClick={previewBankWorksheet}>{copy.previewReconciliationWorksheet}</button>
      {bankWorksheet && <div className="import-summary" style={{ marginTop: 16 }}>
        <span>{copy.worksheetStatus}: <b>{bankWorksheet.status === "balanced" ? copy.balanced : copy.needsReview}</b></span>
        <span>{copy.openingBalance}: <b>{fmt(bankWorksheet.openingBalance, bankWorksheet.account.currency)}</b></span>
        <span>{copy.importedMovement}: <b>{fmt(bankWorksheet.importedNetMovement, bankWorksheet.account.currency)}</b></span>
        <span>{copy.expectedBookBalance}: <b>{fmt(bankWorksheet.expectedBookBalance, bankWorksheet.account.currency)}</b></span>
        <span>{copy.statementClosingBalance}: <b>{fmt(bankWorksheet.statementClosingBalance, bankWorksheet.account.currency)}</b></span>
        <span>{copy.difference}: <b className={Number(bankWorksheet.difference) === 0 ? "ok-text" : "bad-text"}>
          {fmt(bankWorksheet.difference, bankWorksheet.account.currency)}</b></span>
        <span>{copy.unreviewedLines}: <b>{bankWorksheet.unreviewedLines}</b></span>
        <span>{copy.unreviewedNet}: <b>{fmt(bankWorksheet.unreviewedNet, bankWorksheet.account.currency)}</b></span>
      </div>}
      {bankWorksheet && <p className="sub">{copy.reconciliationWorksheetNotice}</p>}
      {bankWorksheet && <button className="btn sm" disabled={readonly || busy || !canPrepareReconciliation}
        onClick={prepareBankReconciliation}>{copy.prepareReconciliationReport}</button>}
      {bankWorksheet && !canPrepareReconciliation && <p className="sub">{copy.preparePermission}</p>}
    </div>}
    {kind === "bank-statement" && bankAccountId && <div className="panel">
      <h2>{copy.savedReconciliationsTitle}</h2>
      <p className="sub">{copy.savedReconciliationsHelp}</p>
      {bankReconciliations.length === 0
        ? <p className="empty">{copy.noSavedReconciliations}</p>
        : <div className="table-scroll">
          <table>
            <thead><tr>
              <th>{copy.statementDate}</th>
              <th>{copy.status}</th>
              <th>{copy.statementClosingBalance}</th>
              <th>{copy.expectedBookBalance}</th>
              <th>{copy.difference}</th>
              <th>{copy.unreviewedLines}</th>
              <th>{copy.action}</th>
            </tr></thead>
            <tbody>{bankReconciliations.map((report) => (
              <tr key={report.id}>
                <td>{new Date(`${report.statementDate}T00:00:00`).toLocaleDateString("en-ZW")}</td>
                <td>{report.status === "APPROVED" ? copy.approved : copy.prepared}</td>
                <td>{fmt(report.statementClosingBalance, selectedBankAccount?.currency ?? "USD")}</td>
                <td>{fmt(report.expectedBookBalance, selectedBankAccount?.currency ?? "USD")}</td>
                <td><span className={Number(report.difference) === 0 ? "ok-text" : "bad-text"}>
                  {fmt(report.difference, selectedBankAccount?.currency ?? "USD")}</span></td>
                <td>{report.unreviewedLines}</td>
                <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn sm" disabled={busy}
                    onClick={() => downloadBankReconciliationReport(report.id)}>{copy.downloadReport}</button>
                  {report.status === "PREPARED" && <button className="btn sm"
                    disabled={readonly || busy || !canApproveReconciliation
                    || report.reconciliationStatus !== "balanced" || report.unreviewedLines > 0}
                    onClick={() => approveBankReconciliation(report.id)}>{copy.approveReconciliation}</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </div>}
    {kind === "bank-statement" && bankAccountId && <div className="panel">
      <h2>{copy.recentBankFeedTitle}</h2>
      <p className="sub">{copy.recentBankFeedHelp}</p>
      {bankTransactions.length === 0
        ? <p className="empty">{copy.noBankTransactions}</p>
        : <div className="table-scroll">
          <table>
            <thead><tr>
              <th>{copy.date}</th>
              <th>{copy.description}</th>
              <th>{copy.reference}</th>
              <th>{copy.amount}</th>
              <th>{copy.status}</th>
              <th>{copy.action}</th>
            </tr></thead>
            <tbody>{bankTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{new Date(transaction.date).toLocaleDateString("en-ZW")}</td>
                <td>{transaction.description}</td>
                <td>{transaction.reference ?? "—"}</td>
                <td>{selectedBankAccount?.currency ?? ""} {transaction.amount}</td>
                <td>{transaction.matchedJournalEntryId ? copy.reconciled : copy.unreviewed}</td>
                <td>{!transaction.matchedJournalEntryId && Number(transaction.amount) > 0
                  ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn sm" disabled={busy || readonly}
                      onClick={() => matchBankTransaction(transaction)}>{copy.findInvoiceMatch}</button>
                    <button className="btn sm" disabled={busy || readonly}
                      onClick={() => splitMatchBankTransaction(transaction)}>{copy.splitInvoiceMatch}</button>
                    <button className="btn sm" disabled={busy || readonly || !canMatchBankTransfers}
                      onClick={() => matchBankTransfer(transaction)}>{copy.matchTransfer}</button>
                  </div>
                  : !transaction.matchedJournalEntryId && Number(transaction.amount) < 0
                    ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn sm" disabled={busy || readonly || !canPostBankFees}
                        onClick={() => postBankFee(transaction)}>{copy.postBankFee}</button>
                      <button className="btn sm" disabled={busy || readonly || !canMatchBankTransfers}
                        onClick={() => matchBankTransfer(transaction)}>{copy.matchTransfer}</button>
                    </div>
                    : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </div>}
    {message && <div className="banner warn">{message}</div>}
  </>);
}

function Settings({ me, readonly, onSaved }: {
  me: Me;
  readonly: boolean;
  onSaved: () => void;
}) {
  const t = me.tenant!;
  const [profileName, setProfileName] = useState(me.user.fullName);
  const [company, setCompany] = useState({
    companyName: t.companyName,
    logoUrl: t.logoUrl ?? "",
    brandPrimaryColor: t.brandPrimaryColor,
    brandSecondaryColor: t.brandSecondaryColor,
    taxNumber: t.taxNumber ?? "",
    vatNumber: t.vatNumber ?? "",
    registrationNumber: t.registrationNumber ?? "",
    physicalAddress: t.physicalAddress ?? "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoData, setLogoData] = useState<string | null>(null);
  const canManageCompany = me.permissions.includes("settings.manage") && !readonly;
  const setCompanyField = (key: keyof typeof company) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setCompany({ ...company, [key]: event.target.value });

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api("/profile", { method: "PATCH", body: { fullName: profileName } });
      if (canManageCompany) {
        let logoUrl = company.logoUrl;
        if (logoData) {
          const uploaded = await api("/settings/logo", { method: "POST", body: { dataUrl: logoData } });
          logoUrl = uploaded.logoUrl;
          setLogoData(null);
        }
        const { logoUrl: storedLogo, ...branding } = company;
        await api("/settings/branding", { method: "PATCH", body: {
          ...branding,
          ...(logoUrl && !logoUrl.startsWith("data:") ? { logoUrl } : {}),
        } });
      }
      setMessage(appEnglish.settings.saved);
      onSaved();
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  return (
    <>
      <div><h1>{appEnglish.settings.title}</h1><div className="sub">{appEnglish.settings.subtitle}</div></div>
      <div className="grid2 settings-grid">
        <div className="panel">
          <h2>{appEnglish.settings.profile}</h2>
          <div className="field"><label>{appEnglish.settings.name}</label>
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></div>
          <div className="field"><label>{appEnglish.settings.email}</label>
            <input value={me.user.email} disabled /></div>
        </div>
        <div className="panel brand-preview" style={{
          borderTopColor: company.brandSecondaryColor,
          background: company.brandPrimaryColor,
        }}>
          {company.logoUrl && <img src={company.logoUrl} alt="" />}
          <strong>{company.companyName || t.companyName}</strong>
          <span>{appEnglish.settings.preview}</span>
        </div>
      </div>
      <div className="panel">
        <h2>{appEnglish.settings.company}</h2>
        {!canManageCompany && <div className="banner warn">{appEnglish.settings.companyPermission}</div>}
        <div className="grid2">
          <div className="field"><label>{appEnglish.settings.companyName}</label>
            <input disabled={!canManageCompany} value={company.companyName} onChange={setCompanyField("companyName")} /></div>
          <div className="field"><label>{appEnglish.settings.logoUrl}</label>
            <input type="url" disabled={!canManageCompany} value={company.logoUrl}
              onChange={setCompanyField("logoUrl")} placeholder="https://example.com/logo.png" />
            <small>{appEnglish.settings.logoHelp}</small></div>
          <div className="field"><label>{appEnglish.settings.logoUpload}</label>
            <input type="file" accept="image/png,image/jpeg" disabled={!canManageCompany}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 512_000) { setMessage(appEnglish.settings.logoUploadHelp); return; }
                const reader = new FileReader();
                reader.onload = () => setLogoData(typeof reader.result === "string" ? reader.result : null);
                reader.readAsDataURL(file);
              }} />
            {logoData && <small>{appEnglish.settings.logoSelected}</small>}
            <small>{appEnglish.settings.logoUploadHelp}</small></div>
          <div className="field"><label>{appEnglish.settings.primaryColour}</label>
            <input type="color" disabled={!canManageCompany} value={company.brandPrimaryColor}
              onChange={setCompanyField("brandPrimaryColor")} /></div>
          <div className="field"><label>{appEnglish.settings.accentColour}</label>
            <input type="color" disabled={!canManageCompany} value={company.brandSecondaryColor}
              onChange={setCompanyField("brandSecondaryColor")} /></div>
          <div className="field"><label>{appEnglish.settings.registrationNumber}</label>
            <input disabled={!canManageCompany} value={company.registrationNumber}
              onChange={setCompanyField("registrationNumber")} /></div>
          <div className="field"><label>{appEnglish.settings.taxNumber}</label>
            <input disabled={!canManageCompany} value={company.taxNumber}
              onChange={setCompanyField("taxNumber")} /></div>
          <div className="field"><label>{appEnglish.settings.vatNumber}</label>
            <input disabled={!canManageCompany} value={company.vatNumber}
              onChange={setCompanyField("vatNumber")} /></div>
        </div>
        <div className="field"><label>{appEnglish.settings.address}</label>
          <textarea disabled={!canManageCompany} value={company.physicalAddress}
            onChange={setCompanyField("physicalAddress")} /></div>
        <small>{appEnglish.settings.invoiceHelp}</small>
      </div>
      <button className="btn accent" disabled={busy || readonly} onClick={save}>
        {busy ? appEnglish.settings.saving : appEnglish.settings.save}
      </button>
      {message && <div className="banner warn" style={{ marginTop: 12 }}>{message}</div>}
    </>
  );
}

const useLoad = (fn: () => Promise<any>, deps: any[] = []) => {
  const [data, setData] = useState<any>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { fn().then(setData).catch(() => setData(null)); }, [...deps, tick]);
  return [data, () => setTick((x) => x + 1)] as const;
};

function UsersActivity() {
  const [data, reload] = useLoad(() => api("/security/activity"));
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [createdPassword, setCreatedPassword] = useState("");
  const [newUser, setNewUser] = useState({ fullName: "", email: "", roleId: "", initialPassword: "" });
  const copy = appEnglish.activity;
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : "—";
  const sessionState = (session: any) => {
    if (session.revoked_at) return copy.revoked;
    if (new Date(session.idle_expires_at).getTime() <= Date.now() || new Date(session.absolute_expires_at).getTime() <= Date.now()) return copy.expired;
    if (new Date(session.last_seen_at).getTime() >= Date.now() - 5 * 60_000) return copy.activeNow;
    return copy.signedIn;
  };
  const revoke = async (sessionId: string) => {
    if (!window.confirm(copy.revokePrompt)) return;
    setBusy(true);
    try { await api(`/security/sessions/${sessionId}/revoke`, { method: "POST", body: { reason: "owner_revoked" } }); reload(); }
    catch (error: any) { alert(error.message || copy.revokeFailed); }
    finally { setBusy(false); }
  };
  const openAdd = () => {
    const defaultRole = (data?.roles ?? []).find((role: any) => role.name !== "Owner");
    setCreatedPassword("");
    setNewUser({ fullName: "", email: "", roleId: defaultRole?.id ?? "", initialPassword: "" });
    setShowAdd(true);
  };
  const createUser = async () => {
    setBusy(true);
    try {
      const result = await api("/security/users", { method: "POST", body: {
        ...newUser, initialPassword: newUser.initialPassword || undefined,
      } });
      setCreatedPassword(result.temporaryPassword);
      setNewUser({ fullName: "", email: "", roleId: "", initialPassword: "" });
      reload();
    } catch (error: any) { alert(error.message || copy.createUserFailed); }
    finally { setBusy(false); }
  };
  const updateUserStatus = async (user: any) => {
    if (!window.confirm(copy.statusUpdatePrompt)) return;
    setBusy(true);
    try { await api(`/security/users/${user.id}/${user.status === "disabled" ? "active" : "disabled"}`, { method: "POST" }); reload(); }
    catch (error: any) { alert(error.message || copy.statusUpdateFailed); }
    finally { setBusy(false); }
  };
  if (!data) return <p className="sub">{appEnglish.dashboard.loading}</p>;
  const summary = data.summary ?? {};
  const users = data.users ?? [];
  const sessions = data.sessions ?? [];
  const events = data.events ?? [];
  return (<>
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h1>{copy.title}</h1><div className="sub">{copy.subtitle}</div></div>
      <span className="pill">{copy.ownerOnly}</span>
    </div>
    <div className="cards">
      <div className="card"><div className="k">{copy.registeredUsers}</div><div className="v">{summary.registered_users ?? 0}</div></div>
      <div className="card"><div className="k">{copy.activeUsers}</div><div className="v ok">{summary.active_now_users ?? 0}</div></div>
      <div className="card"><div className="k">{copy.signedInUsers}</div><div className="v">{summary.signed_in_users ?? 0}</div></div>
      <div className="card"><div className="k">{copy.validSessions}</div><div className="v">{summary.valid_sessions ?? 0}</div></div>
    </div>
    <div className="panel">
      <div className="panel-heading"><h2>{copy.usersTitle}</h2><button className="btn sm" onClick={openAdd}>{copy.addUser}</button></div>
      <div className="table-scroll"><table><thead><tr><th>{copy.name}</th><th>{copy.email}</th><th>{copy.role}</th><th>{copy.status}</th><th>{copy.sessions}</th><th>{copy.lastLogin}</th><th>{copy.lastSeen}</th><th /></tr></thead>
        <tbody>{users.map((user: any) => <tr key={user.id}>
          <td><b>{user.full_name}</b></td><td>{user.email}</td><td>{user.role_name ?? "—"}</td><td>{user.status}</td><td>{user.valid_sessions ?? 0}</td>
          <td>{formatDate(user.last_login_at)}</td><td>{formatDate(user.last_seen_at)}</td>
          <td>{user.role_name !== "Owner" && ["active", "disabled"].includes(user.status) && <button className="btn ghost sm" disabled={busy} onClick={() => updateUserStatus(user)}>{user.status === "disabled" ? copy.enable : copy.disable}</button>}</td>
        </tr>)}{!users.length && <tr><td colSpan={8}>{copy.noUsers}</td></tr>}</tbody>
      </table></div>
    </div>
    <div className="panel">
      <h2>{copy.sessionsTitle}</h2>
      <div className="table-scroll"><table><thead><tr><th>{copy.name}</th><th>{copy.client}</th><th>{copy.device}</th><th>{copy.created}</th><th>{copy.lastSeen}</th><th>{copy.status}</th><th /></tr></thead>
        <tbody>{sessions.map((session: any) => <tr key={session.id}>
          <td><b>{session.full_name}</b><div className="sub">{session.email}</div></td><td>{session.client_type}{session.app_version ? ` · ${session.app_version}` : ""}</td>
          <td>{session.device_description ?? "—"}</td><td>{formatDate(session.created_at)}</td><td>{formatDate(session.last_seen_at)}</td>
          <td>{sessionState(session)}</td><td>{!session.revoked_at && sessionState(session) !== copy.expired && <button className="btn ghost sm" disabled={busy} onClick={() => revoke(session.id)}>{copy.revoke}</button>}</td>
        </tr>)}{!sessions.length && <tr><td colSpan={7}>{copy.noSessions}</td></tr>}</tbody>
      </table></div>
    </div>
    <div className="panel">
      <h2>{copy.eventsTitle}</h2>
      <div className="table-scroll"><table><thead><tr><th>{copy.time}</th><th>{copy.actor}</th><th>{copy.action}</th><th>{copy.evidence}</th></tr></thead>
        <tbody>{events.map((event: any) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td>{users.find((user: any) => user.id === event.userId)?.full_name ?? "—"}</td><td>{event.action}</td><td className="sub">{event.metadata ? JSON.stringify(event.metadata).slice(0, 280) : "—"}</td></tr>)}{!events.length && <tr><td colSpan={4}>{copy.noEvents}</td></tr>}</tbody>
      </table></div>
    </div>
    {showAdd && <div className="modalbg" onClick={() => setShowAdd(false)}><div className="modal" onClick={(event) => event.stopPropagation()}>
      <h2>{copy.addUserTitle}</h2>
      <p className="sub">{copy.addUserHelp}</p>
      <div className="field"><label>{copy.fullName}</label><input value={newUser.fullName} onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })} /></div>
      <div className="field"><label>{copy.email}</label><input type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} /></div>
      <div className="field"><label>{copy.role}</label><select value={newUser.roleId} onChange={(event) => setNewUser({ ...newUser, roleId: event.target.value })}>
        <option value="">{copy.role}</option>{(data.roles ?? []).filter((role: any) => role.name !== "Owner").map((role: any) => <option key={role.id} value={role.id}>{role.name}</option>)}
      </select></div>
      <div className="field"><label>{copy.initialPassword}</label><input type="password" value={newUser.initialPassword} onChange={(event) => setNewUser({ ...newUser, initialPassword: event.target.value })} /><small>{copy.initialPasswordHelp}</small></div>
      {createdPassword && <div className="banner warn">{copy.userCreated.replace("{password}", createdPassword)}</div>}
      <div className="row end"><button className="btn ghost" onClick={() => setShowAdd(false)}>{copy.cancel}</button><button className="btn accent" disabled={busy || !newUser.roleId} onClick={createUser}>{copy.createUser}</button></div>
    </div></div>}
  </>);
}

// ---------------------------------------------------------------------------
// Dashboard — cross-module live view
// ---------------------------------------------------------------------------
function Dashboard({ ccy }: { ccy: string }) {
  const [d] = useLoad(() => api("/reports/dashboard"));
  const copy = appEnglish.dashboard;
  if (!d) return <p className="sub">{copy.loading}</p>;
  const receivables = d.receivables as DashboardReceivablesView;
  return (<>
    <h1>{copy.title}</h1><div className="sub">{copy.subtitle}</div>
    <div className="cards">
      <div className="card"><div className="k">{copy.income}</div><div className="v ok">{fmt(d.monthToDate.income, ccy)}</div></div>
      <div className="card"><div className="k">{copy.expenses}</div><div className="v">{fmt(d.monthToDate.expenses, ccy)}</div></div>
      <div className="card"><div className="k">{copy.netProfit}</div><div className={`v ${Number(d.monthToDate.netProfit) >= 0 ? "ok" : "bad"}`}>{fmt(d.monthToDate.netProfit, ccy)}</div></div>
    </div>
    <div className="panel">
      <div className="panel-heading">
        <h2>{copy.receivablesTitle}</h2>
        <span className="sub">{copy.receivablesAsAt} {new Date(receivables.asAt).toLocaleDateString("en-ZW")}</span>
      </div>
      {receivables.currencies.length === 0 ? <p className="sub">{copy.noReceivables}</p> : (
        <div className="receivables-currencies">
          {receivables.currencies.map((currency) => (
            <section className="receivables-currency" key={currency.currency} aria-labelledby={`ageing-${currency.currency}`}>
              <div className="row receivables-summary">
                <h3 id={`ageing-${currency.currency}`}>{currency.currency}</h3>
                <span>{copy.outstanding}: <b>{fmt(currency.outstanding, currency.currency)}</b></span>
                <span>{copy.overdue}: <b className={Number(currency.overdue) > 0 ? "bad-text" : "ok-text"}>{fmt(currency.overdue, currency.currency)}</b></span>
              </div>
              <div className="ageing-grid">
                {AGEING_BUCKET_LABELS.map(([key, label]) => (
                  <div className="ageing-bucket" key={key}>
                    <span>{label}</span>
                    <b>{fmt(currency.buckets[key], currency.currency)}</b>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <h3 className="attention-heading">{copy.attentionTitle}</h3>
      {receivables.attentionItems.length === 0 ? <p className="sub">{copy.noAttention}</p> : (
        <div className="table-scroll">
          <table><thead><tr><th>{copy.invoice}</th><th>{copy.customer}</th><th className="num">{copy.amount}</th><th className="num">{copy.daysOverdue}</th></tr></thead>
            <tbody>{receivables.attentionItems.map((item) => (
              <tr key={item.invoiceId}>
                <td><b>{item.number}</b></td>
                <td>{item.contact}</td>
                <td className="num">{fmt(item.outstanding, item.currency)}</td>
                <td className="num bad-text">{item.daysOverdue}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
    <div className="panel"><h2>Low / out-of-stock items</h2>
      {d.lowStock.length === 0 ? <p className="sub">All stock above reorder levels.</p> :
        <table><thead><tr><th>SKU</th><th>Product</th><th className="num">On hand</th><th className="num">Reorder level</th></tr></thead>
          <tbody>{d.lowStock.map((r: any) => (
            <tr key={r.id}><td>{r.sku}</td><td>{r.name}</td><td className="num" style={{ color: "var(--danger)", fontWeight: 700 }}>{Number(r.on_hand)}</td><td className="num">{r.reorder_level}</td></tr>
          ))}</tbody></table>}
    </div>
    <div className="panel"><h2>Open pipeline</h2>
      {d.pipeline.length === 0 ? <p className="sub">No open deals.</p> :
        <table><thead><tr><th>Stage</th><th className="num">Deals</th><th className="num">Value</th></tr></thead>
          <tbody>{d.pipeline.map((r: any) => (
            <tr key={r.stage}><td><span className={`pill ${r.stage}`}>{r.stage}</span></td><td className="num">{r.n}</td><td className="num">{fmt(r.value, ccy)}</td></tr>
          ))}</tbody></table>}
    </div>
  </>);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
function Contacts({ readonly }: { readonly: boolean }) {
  const [rows, reload] = useLoad(() => api("/contacts"));
  const [show, setShow] = useState(false);
  const [f, setF] = useState<any>({ type: "COMPANY", isCustomer: true, isVendor: false });
  const [err, setErr] = useState("");
  const save = async () => {
    try { await api("/contacts", { method: "POST", body: f }); setShow(false); setF({ type: "COMPANY", isCustomer: true, isVendor: false }); reload(); }
    catch (e: any) { setErr(e.message); }
  };
  return (<>
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h1>Contacts</h1><div className="sub">Customers and vendors — shared by CRM, invoicing and purchasing</div></div>
      {!readonly && <button className="btn" onClick={() => setShow(true)}>+ New contact</button>}
    </div>
    <div className="panel">
      <table><thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Phone</th><th>Tax / BP No.</th><th>Roles</th></tr></thead>
        <tbody>{(rows ?? []).map((c: any) => (
          <tr key={c.id}><td><b>{c.name}</b></td><td>{c.type}</td><td>{c.email ?? "—"}</td><td>{c.phone ?? "—"}</td><td>{c.taxNumber ?? "—"}</td>
            <td>{[c.isCustomer && "Customer", c.isVendor && "Vendor"].filter(Boolean).join(", ")}</td></tr>
        ))}</tbody></table>
      {rows && rows.length === 0 && <p className="sub" style={{ marginTop: 10 }}>No contacts yet — add your first customer or vendor.</p>}
    </div>
    {show && <div className="modalbg" onClick={() => setShow(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2>New contact</h2>
      <div className="grid2">
        <div className="field"><label>Name</label><input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>COMPANY</option><option>INDIVIDUAL</option></select></div>
        <div className="field"><label>Email</label><input value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value || null })} /></div>
        <div className="field"><label>Phone</label><input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value || null })} /></div>
        <div className="field"><label>ZIMRA BP / VAT number</label><input value={f.taxNumber ?? ""} onChange={(e) => setF({ ...f, taxNumber: e.target.value || null })} /></div>
        <div className="field"><label>Roles</label><div className="row" style={{ paddingTop: 8 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={!!f.isCustomer} onChange={(e) => setF({ ...f, isCustomer: e.target.checked })} />Customer</label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={!!f.isVendor} onChange={(e) => setF({ ...f, isVendor: e.target.checked })} />Vendor</label>
        </div></div>
      </div>
      {err && <div className="err-text">{err}</div>}
      <div className="row end" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
        <button className="btn" onClick={save}>Save contact</button>
      </div>
    </div></div>}
  </>);
}

// ---------------------------------------------------------------------------
// Pipeline (kanban)
// ---------------------------------------------------------------------------
const STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "WON"] as const;
function Pipeline({ readonly }: { readonly: boolean }) {
  const [deals, reload] = useLoad(() => api("/deals"));
  const [contacts] = useLoad(() => api("/contacts"));
  const [show, setShow] = useState(false);
  const [f, setF] = useState<any>({ valueCurrency: "USD", valueAmount: "0" });
  const [err, setErr] = useState("");
  const save = async () => {
    try { await api("/deals", { method: "POST", body: f }); setShow(false); setF({ valueCurrency: "USD", valueAmount: "0" }); reload(); }
    catch (e: any) { setErr(e.message); }
  };
  const move = async (id: string, stage: string) => { await api(`/deals/${id}/stage`, { method: "PATCH", body: { stage } }); reload(); };
  return (<>
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h1>Sales Pipeline</h1><div className="sub">Won deals convert into invoices in Accounting</div></div>
      {!readonly && <button className="btn" onClick={() => setShow(true)}>+ New deal</button>}
    </div>
    <div className="kanban">
      {STAGES.map((s) => (
        <div className="col" key={s}><h3>{s}</h3>
          {(deals ?? []).filter((d: any) => d.stage === s).map((d: any) => (
            <div className="dealcard" key={d.id}>
              <b>{d.title}</b>
              <span>{fmt(d.valueAmount, d.valueCurrency)}</span>
              {!readonly && <div className="row" style={{ marginTop: 8 }}>
                {STAGES.filter((x) => x !== s).slice(0, 2).map((x) => (
                  <button key={x} className="btn ghost sm" onClick={() => move(d.id, x)}>→ {x}</button>
                ))}
              </div>}
            </div>
          ))}
        </div>
      ))}
    </div>
    {show && <div className="modalbg" onClick={() => setShow(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2>New deal</h2>
      <div className="field"><label>Title</label><input value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="grid3">
        <div className="field"><label>Contact</label><select value={f.contactId ?? ""} onChange={(e) => setF({ ...f, contactId: e.target.value })}>
          <option value="">Select…</option>{(contacts ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Value</label><input value={f.valueAmount} onChange={(e) => setF({ ...f, valueAmount: e.target.value })} /></div>
        <div className="field"><label>Currency</label><select value={f.valueCurrency} onChange={(e) => setF({ ...f, valueCurrency: e.target.value })}><option>USD</option><option>ZWG</option></select></div>
      </div>
      {err && <div className="err-text">{err}</div>}
      <div className="row end"><button className="btn ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn" onClick={save}>Save deal</button></div>
    </div></div>}
  </>);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
function Invoices({ readonly, baseCcy }: { readonly: boolean; baseCcy: string }) {
  const [rows, reload] = useLoad(() => api("/invoices"));
  const [contacts] = useLoad(() => api("/contacts"));
  const [products] = useLoad(() => api("/products"));
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [linkInvoice, setLinkInvoice] = useState<{ id: string; number: string | null } | null>(null);
  const [linkRows, setLinkRows] = useState<any[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const empty = { description: "", quantity: "1", unitPrice: "0", taxTreatment: "standard", productId: "" };
  const [f, setF] = useState<any>({ currency: baseCcy, rateToBase: "1", lines: [{ ...empty }] });

  const setLine = (i: number, k: string, v: string) => {
    const lines = [...f.lines]; lines[i] = { ...lines[i], [k]: v };
    if (k === "productId" && v) {
      const p = (products ?? []).find((x: any) => x.id === v);
      if (p) lines[i] = {
        ...lines[i],
        description: p.name,
        unitPrice: p.salePrice,
        taxTreatment: p.tax_treatment ?? p.taxTreatment ?? "standard",
      };
    }
    setF({ ...f, lines });
  };
  const save = async () => {
    setErr("");
    try {
      const body = { ...f, lines: f.lines.map((l: any) => ({ ...l, productId: l.productId || undefined })) };
      await api("/invoices", { method: "POST", body }); setShow(false);
      setF({ currency: baseCcy, rateToBase: "1", lines: [{ ...empty }] }); reload();
    } catch (e: any) { setErr(e.message); }
  };
  const act = async (path: string, body: any = {}) => {
    try { await api(path, { method: "POST", body }); reload(); } catch (e: any) { alert(e.message); }
  };
  const downloadPdf = async (invoice: { id: string; number: string | null }) => {
    try {
      const response = await fetch(`/api/v1/invoices/${invoice.id}/pdf`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || appEnglish.invoices.pdfDownloadFailed);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice-${invoice.number ?? invoice.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) { alert(error.message || appEnglish.invoices.pdfDownloadFailed); }
  };
  const getShareLink = async (invoice: { id: string }) => {
    const result = await api(`/invoices/${invoice.id}/share-links`, { method: "POST", body: { expiresInDays: 14 } });
    return new URL(result.publicPath, window.location.origin).toString();
  };
  const createShareLink = async (invoice: { id: string }) => {
    try {
      window.prompt(appEnglish.invoices.shareLinkPrompt, await getShareLink(invoice));
    } catch (error: any) { alert(error.message || appEnglish.invoices.shareLinkFailed); }
  };
  const manageShareLinks = async (invoice: { id: string; number: string | null }) => {
    setLinkInvoice(invoice);
    setLinkBusy(true);
    try {
      setLinkRows(await api(`/invoices/${invoice.id}/share-links`));
    } catch (error: any) {
      setLinkInvoice(null);
      alert(error.message || appEnglish.invoices.shareLinkFailed);
    } finally { setLinkBusy(false); }
  };
  const revokeShareLink = async (linkId: string) => {
    if (!linkInvoice || !window.confirm(appEnglish.invoices.revokeShareLinkPrompt)) return;
    try {
      await api(`/invoices/${linkInvoice.id}/share-links/${linkId}`, { method: "DELETE" });
      setLinkRows(await api(`/invoices/${linkInvoice.id}/share-links`));
    } catch (error: any) { alert(error.message || appEnglish.invoices.revokeShareLinkFailed); }
  };
  const formatLinkDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";
  const linkState = (link: any) => {
    if (link.revokedAt) return appEnglish.invoices.shareLinkRevoked;
    if (new Date(link.expiresAt).getTime() <= Date.now()) return appEnglish.invoices.shareLinkExpired;
    return appEnglish.invoices.shareLinkActive;
  };
  const openEmailComposer = async (invoice: { id: string; number: string | null; contact_email: string | null }) => {
    if (!invoice.contact_email) { alert(appEnglish.invoices.emailUnavailable); return; }
    try {
      const link = await getShareLink(invoice);
      const number = invoice.number ?? "VAKA";
      const subject = appEnglish.invoices.emailSubject.replace("{number}", number);
      const body = appEnglish.invoices.emailBody.replace("{number}", number).replace("{link}", link);
      window.location.href = `mailto:${encodeURIComponent(invoice.contact_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (error: any) { alert(error.message || appEnglish.invoices.shareLinkFailed); }
  };
  const openWhatsAppShare = async (invoice: { id: string; number: string | null }) => {
    try {
      const link = await getShareLink(invoice);
      const text = appEnglish.invoices.whatsappBody.replace("{number}", invoice.number ?? "VAKA").replace("{link}", link);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } catch (error: any) { alert(error.message || appEnglish.invoices.shareLinkFailed); }
  };
  return (<>
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h1>Invoices</h1><div className="sub">Issuing posts revenue &amp; VAT to the ledger and moves stock — in one step</div></div>
      {!readonly && <button className="btn" onClick={() => setShow(true)}>+ New invoice</button>}
    </div>
    <div className="panel">
      <table><thead><tr><th>Number</th><th>Customer</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th>Actions</th></tr></thead>
        <tbody>{(rows ?? []).map((i: any) => (
          <tr key={i.id}>
            <td><b>{i.number ?? "(draft)"}</b></td><td>{i.contact_name}</td>
            <td><span className={`pill ${i.status}`}>{i.status}</span></td>
            <td className="num">{fmt(i.total, i.currency)}</td><td className="num">{fmt(i.amount_paid, i.currency)}</td>
            <td><div className="row">
              {i.status !== "DRAFT" && <button className="btn ghost sm" onClick={() => downloadPdf(i)}>{appEnglish.invoices.downloadPdf}</button>}
              {!readonly && <>
              {["ISSUED", "PARTIAL", "PAID"].includes(i.status) && <button className="btn ghost sm" onClick={() => createShareLink(i)}>{appEnglish.invoices.createShareLink}</button>}
              {["ISSUED", "PARTIAL", "PAID"].includes(i.status) && <button className="btn ghost sm" onClick={() => manageShareLinks(i)}>{appEnglish.invoices.manageShareLinks}</button>}
              {["ISSUED", "PARTIAL", "PAID"].includes(i.status) && <button className="btn ghost sm" onClick={() => openEmailComposer(i)}>{appEnglish.invoices.emailInvoice}</button>}
              {["ISSUED", "PARTIAL", "PAID"].includes(i.status) && <button className="btn ghost sm" onClick={() => openWhatsAppShare(i)}>{appEnglish.invoices.whatsappInvoice}</button>}
              {i.status === "DRAFT" && <button className="btn sm" onClick={() => act(`/invoices/${i.id}/issue`)}>Issue</button>}
              {(i.status === "ISSUED" || i.status === "PARTIAL") && <button className="btn accent sm" onClick={() => {
                const amount = prompt("Payment amount:", String(Number(i.total) - Number(i.amount_paid)));
                if (amount) act(`/invoices/${i.id}/payments`, { amount, idempotencyKey: idempotencyKey(`payment:${i.id}`) });
              }}>Record payment</button>}
              {i.status !== "VOID" && i.status !== "PAID" && <button className="btn ghost sm" onClick={() => {
                const reason = prompt("Reason for voiding:"); if (reason) act(`/invoices/${i.id}/void`, { reason });
              }}>Void</button>}
              </>}
            </div></td>
          </tr>
        ))}</tbody></table>
      {rows && rows.length === 0 && <p className="sub" style={{ marginTop: 10 }}>No invoices yet.</p>}
    </div>
    {linkInvoice && <div className="modalbg" onClick={() => setLinkInvoice(null)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>{appEnglish.invoices.shareLinksTitle}</h2>
        <button className="btn ghost sm" onClick={() => setLinkInvoice(null)}>{appEnglish.invoices.closeShareLinks}</button>
      </div>
      <p className="sub">{appEnglish.invoices.shareLinksDescription}</p>
      {linkBusy ? <p className="sub">{appEnglish.dashboard.loading}</p> : linkRows.length === 0 ? <p className="sub">{appEnglish.invoices.noShareLinks}</p> : <div className="panel">
        {linkRows.map((link) => <div className="row" key={link.id} style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
          <div>
            <b>{linkState(link)}</b>
            <div className="sub">{appEnglish.invoices.shareLinkCreated}: {formatLinkDate(link.createdAt)} · {appEnglish.invoices.shareLinkExpires}: {formatLinkDate(link.expiresAt)}</div>
            <div className="sub">{link.viewedAt ? `${appEnglish.invoices.shareLinkViewed}: ${formatLinkDate(link.viewedAt)}` : appEnglish.invoices.shareLinkNotViewed}</div>
          </div>
          {!readonly && !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now() && <button className="btn ghost sm" onClick={() => revokeShareLink(link.id)}>{appEnglish.invoices.revokeShareLink}</button>}
        </div>)}
      </div>}
    </div></div>}
    {show && <div className="modalbg" onClick={() => setShow(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2>New invoice</h2>
      <div className="grid3">
        <div className="field"><label>Customer</label><select value={f.contactId ?? ""} onChange={(e) => setF({ ...f, contactId: e.target.value })}>
          <option value="">Select…</option>{(contacts ?? []).filter((c: any) => c.isCustomer).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Currency</label><select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>USD</option><option>ZWG</option></select></div>
        {f.currency !== baseCcy && <div className="field"><label>Rate to {baseCcy} (1 {f.currency} = ? {baseCcy})</label>
          <input value={f.rateToBase} onChange={(e) => setF({ ...f, rateToBase: e.target.value })} /></div>}
      </div>
      <h2 style={{ fontSize: 14 }}>Lines</h2>
      {f.lines.map((l: any, i: number) => (
        <div className="row" key={i} style={{ marginBottom: 8 }}>
          <select style={{ flex: 2 }} value={l.productId} onChange={(e) => setLine(i, "productId", e.target.value)}>
            <option value="">Service / free-text line</option>
            {(products ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.name} ({Number(p.on_hand)} on hand)</option>)}
          </select>
          <input style={{ flex: 3 }} placeholder="Description" value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
          <input style={{ flex: 1 }} placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
          <input style={{ flex: 1 }} placeholder="Price" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} />
          <select
            style={{ flex: 1 }}
            aria-label={appEnglish.invoices.taxTreatment}
            value={l.taxTreatment}
            onChange={(e) => setLine(i, "taxTreatment", e.target.value)}
          >
            <option value="standard">{appEnglish.invoices.taxTreatmentStandard}</option>
            <option value="zero-rated">{appEnglish.invoices.taxTreatmentZeroRated}</option>
            <option value="exempt">{appEnglish.invoices.taxTreatmentExempt}</option>
          </select>
        </div>
      ))}
      <p className="sub">{appEnglish.invoices.taxTreatmentHelp}</p>
      <button className="btn ghost sm" onClick={() => setF({ ...f, lines: [...f.lines, { ...empty }] })}>+ Add line</button>
      {err && <div className="err-text">{err}</div>}
      <div className="row end" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
        <button className="btn" onClick={save}>Save draft</button>
      </div>
    </div></div>}
  </>);
}

// ---------------------------------------------------------------------------
// Products & stock
// ---------------------------------------------------------------------------
function Products({ readonly }: { readonly: boolean }) {
  const [rows, reload] = useLoad(() => api("/products"));
  const [warehouses] = useLoad(() => api("/warehouses"));
  const [show, setShow] = useState(false);
  const [f, setF] = useState<any>({ currency: "USD", taxTreatment: "standard", costPrice: "0", salePrice: "0", reorderLevel: 0, trackStock: true, unitOfMeasure: "unit" });
  const [err, setErr] = useState("");
  const save = async () => {
    try { await api("/products", { method: "POST", body: { ...f, reorderLevel: Number(f.reorderLevel) } }); setShow(false); reload(); }
    catch (e: any) { setErr(e.message); }
  };
  const opening = async (p: any) => {
    const quantity = prompt(`Opening stock quantity for ${p.name}:`); if (!quantity) return;
    const unitCost = prompt("Unit cost:", p.cost_price ?? p.costPrice ?? "0"); if (!unitCost) return;
    try { await api("/stock/opening", { method: "POST", body: { productId: p.id, warehouseId: warehouses[0].id, quantity, unitCost } }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  const adjust = async (p: any) => {
    const quantityDelta = prompt(`Adjustment for ${p.name} (e.g. -2 for damage, +5 for count correction):`); if (!quantityDelta) return;
    const note = prompt("Reason (mandatory, kept in the audit trail):"); if (!note) return;
    try {
      await api("/stock/adjust", {
        method: "POST",
        body: {
          productId: p.id,
          warehouseId: warehouses[0].id,
          quantityDelta,
          note,
          idempotencyKey: idempotencyKey(`stock-adjustment:${p.id}`),
        },
      });
      reload();
    }
    catch (e: any) { alert(e.message); }
  };
  return (<>
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h1>Products &amp; Stock</h1><div className="sub">Stock only moves through the ledger — sales, purchases and audited adjustments</div></div>
      {!readonly && <button className="btn" onClick={() => setShow(true)}>+ New product</button>}
    </div>
    <div className="panel">
      <table><thead><tr><th>SKU</th><th>Name</th><th className="num">Cost</th><th className="num">Sale price</th><th className="num">VAT %</th><th className="num">On hand</th><th>Actions</th></tr></thead>
        <tbody>{(rows ?? []).map((p: any) => (
          <tr key={p.id}>
            <td>{p.sku}</td><td><b>{p.name}</b></td>
            <td className="num">{fmt(p.cost_price, p.currency)}</td><td className="num">{fmt(p.sale_price, p.currency)}</td>
            <td className="num">{Number(p.tax_rate)}%</td>
            <td className="num" style={Number(p.on_hand) <= p.reorder_level ? { color: "var(--danger)", fontWeight: 700 } : {}}>{Number(p.on_hand)}</td>
            <td>{!readonly && <div className="row">
              <button className="btn ghost sm" onClick={() => opening(p)}>Opening stock</button>
              <button className="btn ghost sm" onClick={() => adjust(p)}>Adjust</button>
            </div>}</td>
          </tr>
        ))}</tbody></table>
      {rows && rows.length === 0 && <p className="sub" style={{ marginTop: 10 }}>No products yet.</p>}
    </div>
    {show && <div className="modalbg" onClick={() => setShow(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2>New product</h2>
      <div className="grid2">
        <div className="field"><label>SKU</label><input value={f.sku ?? ""} onChange={(e) => setF({ ...f, sku: e.target.value })} /></div>
        <div className="field"><label>Name</label><input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>Cost price</label><input value={f.costPrice} onChange={(e) => setF({ ...f, costPrice: e.target.value })} /></div>
        <div className="field"><label>Sale price</label><input value={f.salePrice} onChange={(e) => setF({ ...f, salePrice: e.target.value })} /></div>
        <div className="field"><label>Currency</label><select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>USD</option><option>ZWG</option></select></div>
        <div className="field"><label>{appEnglish.invoices.taxTreatment}</label><select value={f.taxTreatment} onChange={(e) => setF({ ...f, taxTreatment: e.target.value })}>
          <option value="standard">{appEnglish.invoices.taxTreatmentStandard}</option>
          <option value="zero-rated">{appEnglish.invoices.taxTreatmentZeroRated}</option>
          <option value="exempt">{appEnglish.invoices.taxTreatmentExempt}</option>
        </select></div>
        <div className="field"><label>Reorder level</label><input type="number" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: e.target.value })} /></div>
        <div className="field"><label>Track stock?</label><select value={String(f.trackStock)} onChange={(e) => setF({ ...f, trackStock: e.target.value === "true" })}>
          <option value="true">Yes — physical stock</option><option value="false">No — service item</option></select></div>
      </div>
      {err && <div className="err-text">{err}</div>}
      <div className="row end"><button className="btn ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn" onClick={save}>Save product</button></div>
    </div></div>}
  </>);
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------
function PurchaseOrders({ readonly }: { readonly: boolean }) {
  const [rows, reload] = useLoad(() => api("/purchase-orders"));
  const [contacts] = useLoad(() => api("/contacts"));
  const [products] = useLoad(() => api("/products"));
  const [warehouses] = useLoad(() => api("/warehouses"));
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const emptyLine = { productId: "", quantity: "1", unitCost: "0" };
  const [f, setF] = useState<any>({ currency: "USD", rateToBase: "1", lines: [{ ...emptyLine }] });
  const setLine = (i: number, k: string, v: string) => {
    const lines = [...f.lines]; lines[i] = { ...lines[i], [k]: v };
    if (k === "productId" && v) {
      const p = (products ?? []).find((x: any) => x.id === v);
      if (p) lines[i].unitCost = p.cost_price;
    }
    setF({ ...f, lines });
  };
  const save = async () => {
    try {
      const body = { ...f, lines: f.lines.map((l: any) => ({ ...l, warehouseId: warehouses[0].id })) };
      await api("/purchase-orders", { method: "POST", body }); setShow(false);
      setF({ currency: "USD", rateToBase: "1", lines: [{ ...emptyLine }] }); reload();
    } catch (e: any) { setErr(e.message); }
  };
  const receive = async (id: string) => {
    try { await api(`/purchase-orders/${id}/receive`, { method: "POST", body: {} }); reload(); } catch (e: any) { alert(e.message); }
  };
  return (<>
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h1>Purchase Orders</h1><div className="sub">Receiving a PO takes stock in and posts to the ledger in one step</div></div>
      {!readonly && <button className="btn" onClick={() => setShow(true)}>+ New PO</button>}
    </div>
    <div className="panel">
      <table><thead><tr><th>Number</th><th>Vendor</th><th>Status</th><th className="num">Total</th><th>Actions</th></tr></thead>
        <tbody>{(rows ?? []).map((po: any) => {
          const vendor = (contacts ?? []).find((c: any) => c.id === po.vendorContactId);
          return (<tr key={po.id}>
            <td><b>{po.number}</b></td><td>{vendor?.name ?? "—"}</td>
            <td><span className={`pill ${po.status}`}>{po.status}</span></td>
            <td className="num">{fmt(po.total, po.currency)}</td>
            <td>{!readonly && po.status === "ORDERED" && <button className="btn accent sm" onClick={() => receive(po.id)}>Receive goods</button>}</td>
          </tr>);
        })}</tbody></table>
      {rows && rows.length === 0 && <p className="sub" style={{ marginTop: 10 }}>No purchase orders yet.</p>}
    </div>
    {show && <div className="modalbg" onClick={() => setShow(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2>New purchase order</h2>
      <div className="field"><label>Vendor</label><select value={f.vendorContactId ?? ""} onChange={(e) => setF({ ...f, vendorContactId: e.target.value })}>
        <option value="">Select…</option>{(contacts ?? []).filter((c: any) => c.isVendor).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {f.lines.map((l: any, i: number) => (
        <div className="row" key={i} style={{ marginBottom: 8 }}>
          <select style={{ flex: 3 }} value={l.productId} onChange={(e) => setLine(i, "productId", e.target.value)}>
            <option value="">Select product…</option>
            {(products ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </select>
          <input style={{ flex: 1 }} placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
          <input style={{ flex: 1 }} placeholder="Unit cost" value={l.unitCost} onChange={(e) => setLine(i, "unitCost", e.target.value)} />
        </div>
      ))}
      <button className="btn ghost sm" onClick={() => setF({ ...f, lines: [...f.lines, { ...emptyLine }] })}>+ Add line</button>
      {err && <div className="err-text">{err}</div>}
      <div className="row end" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
        <button className="btn" onClick={save}>Create PO</button>
      </div>
    </div></div>}
  </>);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
function Reports({ ccy }: { ccy: string }) {
  const today = new Date();
  const localDate = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const defaultTo = localDate(today);
  const defaultFrom = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const [tab, setTab] = useState<"pl" | "bs" | "ar" | "journal" | "vat">("pl");
  const [pl] = useLoad(() => api("/reports/profit-loss"), [tab]);
  const [bs] = useLoad(() => api("/reports/balance-sheet"), [tab]);
  const [ar] = useLoad(() => api("/reports/aged-receivables"), [tab]);
  const [journal] = useLoad(() => api("/journal"), [tab]);
  const [vatPeriod, setVatPeriod] = useState({ from: defaultFrom, to: defaultTo });
  const [vatApplied, setVatApplied] = useState(vatPeriod);
  const [vat, setVat] = useState<VatTechnicalReportView | null>(null);
  const [vatLoading, setVatLoading] = useState(false);
  const [vatError, setVatError] = useState("");
  const copy = appEnglish.reports.vat;
  useEffect(() => {
    if (tab !== "vat") return;
    let active = true;
    setVatLoading(true);
    setVatError("");
    api(`/reports/vat?from=${encodeURIComponent(vatApplied.from)}&to=${encodeURIComponent(vatApplied.to)}`)
      .then((result) => { if (active) setVat(result as VatTechnicalReportView); })
      .catch((error: Error) => { if (active) { setVat(null); setVatError(error.message); } })
      .finally(() => { if (active) setVatLoading(false); });
    return () => { active = false; };
  }, [tab, vatApplied]);
  const downloadVat = async (format: "csv" | "pdf") => {
    setVatError("");
    try {
      const response = await fetch(`/api/v1/reports/vat.${format}?from=${encodeURIComponent(vatApplied.from)}&to=${encodeURIComponent(vatApplied.to)}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || copy.downloadFailed);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `vat-technical-preview-${vatApplied.from}-${vatApplied.to}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) { setVatError(error instanceof Error ? error.message : copy.downloadFailed); }
  };
  return (<>
    <h1>Reports</h1><div className="sub">Every figure computed live from the double-entry ledger — in {ccy}</div>
    <div className="row" style={{ marginBottom: 16 }}>
      {(["pl", "bs", "ar", "journal", "vat"] as const).map((t) => (
        <button key={t} className={`btn ${tab === t ? "" : "ghost"} sm`} onClick={() => setTab(t)}>
          {{ pl: "Profit & Loss", bs: "Balance Sheet", ar: "Aged Receivables", journal: "Journal", vat: copy.tab }[t]}
        </button>
      ))}
    </div>
    {tab === "pl" && pl && <div className="panel">
      <h2>Profit &amp; Loss — year to date</h2>
      <table><tbody>
        {pl.income.map((r: any) => <tr key={r.code}><td>{r.code} {r.name}</td><td className="num">{fmt(r.amount, ccy)}</td></tr>)}
        <tr><td><b>Total income</b></td><td className="num"><b>{fmt(pl.totalIncome, ccy)}</b></td></tr>
        {pl.expenses.map((r: any) => <tr key={r.code}><td>{r.code} {r.name}</td><td className="num">({fmt(r.amount, ccy)})</td></tr>)}
        <tr><td><b>Total expenses</b></td><td className="num"><b>({fmt(pl.totalExpenses, ccy)})</b></td></tr>
        <tr><td><b>Net profit</b></td><td className="num" style={{ color: Number(pl.netProfit) >= 0 ? "var(--ok)" : "var(--danger)" }}><b>{fmt(pl.netProfit, ccy)}</b></td></tr>
      </tbody></table>
    </div>}
    {tab === "bs" && bs && <div className="panel">
      <h2>Balance Sheet — as at today {bs.balances ? "✓ balances" : "⚠ DOES NOT BALANCE"}</h2>
      <table><tbody>
        <tr><td colSpan={2}><b>Assets</b></td></tr>
        {bs.assets.map((r: any) => <tr key={r.code}><td style={{ paddingLeft: 24 }}>{r.code} {r.name}</td><td className="num">{fmt(r.amount, ccy)}</td></tr>)}
        <tr><td><b>Total assets</b></td><td className="num"><b>{fmt(bs.totalAssets, ccy)}</b></td></tr>
        <tr><td colSpan={2}><b>Liabilities</b></td></tr>
        {bs.liabilities.map((r: any) => <tr key={r.code}><td style={{ paddingLeft: 24 }}>{r.code} {r.name}</td><td className="num">{fmt(r.amount, ccy)}</td></tr>)}
        <tr><td colSpan={2}><b>Equity</b></td></tr>
        {bs.equity.map((r: any) => <tr key={r.code}><td style={{ paddingLeft: 24 }}>{r.code} {r.name}</td><td className="num">{fmt(r.amount, ccy)}</td></tr>)}
        <tr><td style={{ paddingLeft: 24 }}>Current earnings</td><td className="num">{fmt(bs.currentEarnings, ccy)}</td></tr>
        <tr><td><b>Total liabilities &amp; equity</b></td><td className="num"><b>{fmt(bs.totalLiabilitiesAndEquity, ccy)}</b></td></tr>
      </tbody></table>
    </div>}
    {tab === "ar" && ar && <div className="panel">
      <h2>Aged Receivables</h2>
      {(ar as AgedReceivablesView).currencies.map((currency) => (
        <div key={currency.currency}>
          <h3>{currency.currency}</h3>
          <div className="cards">
            {AGEING_BUCKET_LABELS.map(([k, label]) => (
              <div className="card" key={k}><div className="k">{label}</div><div className={`v ${k === "current" ? "" : "bad"}`}>{fmt(currency.buckets[k], currency.currency)}</div></div>
            ))}
          </div>
        </div>
      ))}
      <table><thead><tr><th>Invoice</th><th>Customer</th><th className="num">Outstanding</th><th className="num">Days overdue</th></tr></thead>
        <tbody>{(ar as AgedReceivablesView).items.map((r) => (
          <tr key={r.invoiceId}><td>{r.number}</td><td>{r.contact}</td><td className="num">{fmt(r.outstanding, r.currency)}</td><td className="num">{r.daysOverdue}</td></tr>
        ))}</tbody></table>
    </div>}
    {tab === "journal" && journal && <div className="panel">
      <h2>Journal (read-only audit view)</h2>
      {journal.map((e: any) => (
        <div key={e.id} style={{ marginBottom: 14, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
          <b>{new Date(e.date).toLocaleDateString()} — {e.memo}</b> <span className="sub" style={{ display: "inline" }}>({e.source_type})</span>
          <table><tbody>{e.lines.map((l: any, i: number) => (
            <tr key={i}><td style={{ paddingLeft: Number(l.credit) > 0 ? 40 : 10 }}>{l.accountCode} {l.accountName}</td>
              <td className="num">{Number(l.debit) > 0 ? fmt(l.debit, ccy) : ""}</td>
              <td className="num">{Number(l.credit) > 0 ? fmt(l.credit, ccy) : ""}</td></tr>
          ))}</tbody></table>
        </div>
      ))}
    </div>}
    {tab === "vat" && <div className="panel">
      <h2>{copy.title}</h2>
      <div className="banner warn">{copy.notFilingReady}</div>
      <div className="grid3" style={{ marginTop: 14 }}>
        <div className="field"><label htmlFor="vat-from">{copy.from}</label><input id="vat-from" type="date" value={vatPeriod.from}
          onChange={(event) => setVatPeriod({ ...vatPeriod, from: event.target.value })} /></div>
        <div className="field"><label htmlFor="vat-to">{copy.to}</label><input id="vat-to" type="date" value={vatPeriod.to}
          onChange={(event) => setVatPeriod({ ...vatPeriod, to: event.target.value })} /></div>
        <div className="field"><label>{copy.actions}</label><div className="row">
          <button className="btn sm" onClick={() => setVatApplied(vatPeriod)}>{copy.apply}</button>
          <button className="btn ghost sm" disabled={!vat} onClick={() => downloadVat("csv")}>{copy.csv}</button>
          <button className="btn ghost sm" disabled={!vat} onClick={() => downloadVat("pdf")}>{copy.pdf}</button>
        </div></div>
      </div>
      {vatLoading && <p className="sub">{copy.loading}</p>}
      {vatError && <div className="err-text">{vatError}</div>}
      {vat && !vatLoading && <>
        <div className="cards">
          <div className="card"><div className="k">{copy.outputVat}</div><div className="v">{fmt(vat.totals.outputVat, vat.currency)}</div></div>
          <div className="card"><div className="k">{copy.inputVat}</div><div className="v">{fmt(vat.totals.inputVat, vat.currency)}</div></div>
          <div className="card"><div className="k">{copy.netVat}</div><div className="v">{fmt(vat.totals.netVat, vat.currency)}</div><div className="sub">{copy.positions[vat.totals.position]}</div></div>
        </div>
        <p className="sub">{copy.inputCoverage}</p>
        {vat.evidence.length === 0 ? <p className="sub">{copy.empty}</p> : <div style={{ overflowX: "auto" }}>
          <table><thead><tr><th>{copy.date}</th><th>{copy.account}</th><th>{copy.source}</th><th className="num">{copy.debit}</th><th className="num">{copy.credit}</th><th className="num">{copy.impact}</th></tr></thead>
            <tbody>{vat.evidence.map((row) => <tr key={row.journalLineId}>
              <td>{new Date(row.date).toLocaleDateString()}</td><td>{row.account}</td><td>{row.invoice?.number ?? row.sourceType}</td>
              <td className="num">{fmt(row.debit, vat.currency)}</td><td className="num">{fmt(row.credit, vat.currency)}</td><td className="num">{fmt(row.impact, vat.currency)}</td>
            </tr>)}</tbody></table>
        </div>}
      </>}
    </div>}
  </>);
}

// ---------------------------------------------------------------------------
// Upgrade and billing
// ---------------------------------------------------------------------------
function Upgrade() {
  const [sub] = useLoad(() => api("/billing/subscription"));
  const [message, setMessage] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const copy = appEnglish.upgrade;
  const currentPlan = sub?.plan?.name as string | undefined;
  const order = copy.plans.map((plan) => plan.name);

  const requestUpgrade = async (requestedPlan: string) => {
    setBusyPlan(requestedPlan);
    setMessage("");
    try {
      await api("/billing/upgrade-interest", {
        method: "POST",
        body: { requestedPlan },
      });
      setMessage(copy.recorded.replace("{plan}", requestedPlan));
    } catch (error: any) {
      setMessage(error.message);
    }
    setBusyPlan("");
  };

  return (<>
    <h1>{copy.title}</h1>
    <div className="sub">{copy.subtitle}</div>
    <div className="upgrade-grid">
      {copy.plans.map((plan) => {
        const isCurrent = plan.name === currentPlan;
        const isUpgrade = currentPlan
          ? order.indexOf(plan.name) > order.indexOf(currentPlan as typeof plan.name)
          : false;
        return (
          <section className={`panel upgrade-plan ${isCurrent ? "current" : ""}`} key={plan.name}>
            {isCurrent && <span className="pill ACTIVE">{copy.current}</span>}
            <h2>{plan.name}</h2>
            <div className="upgrade-price">{plan.price}</div>
            <div className="sub">{plan.audience}</div>
            <div className="upgrade-capacity">{plan.users} · {plan.locations}</div>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {isCurrent ? (
              <button className="btn ghost" disabled>{copy.current}</button>
            ) : isUpgrade ? (
              <button className="btn accent" disabled={Boolean(busyPlan)}
                onClick={() => requestUpgrade(plan.name)}>
                {busyPlan === plan.name ? copy.recording : copy.request}
              </button>
            ) : (
              <button className="btn ghost" disabled>{copy.includedBelow}</button>
            )}
          </section>
        );
      })}
    </div>
    <div className="panel upgrade-notice">
      <h2>{copy.notesTitle}</h2>
      <p>{copy.notes}</p>
      <p>{copy.planned}</p>
    </div>
    {message && <div className="banner warn">{message}</div>}
  </>);
}

function Billing() {
  const [sub] = useLoad(() => api("/billing/subscription"));
  const [invs] = useLoad(() => api("/billing/invoices"));
  return (<>
    <h1>Billing &amp; Plan</h1><div className="sub">Your platform subscription with monthly usage summaries</div>
    {sub && <div className="cards">
      <div className="card"><div className="k">Plan</div><div className="v">{sub.plan.name}</div></div>
      <div className="card"><div className="k">Status</div><div className="v"><span className={`pill ${sub.status}`}>{sub.status}</span></div></div>
      <div className="card"><div className="k">Monthly fee</div><div className="v">{fmt(sub.plan.priceAmount)}</div></div>
      <div className="card"><div className="k">Active users</div><div className="v">{sub.currentUsage.activeUsers} / {sub.plan.userLimit}</div></div>
    </div>}
    <div className="panel"><h2>Platform invoices</h2>
      {(!invs || invs.length === 0) ? <p className="sub">No invoices yet — your first invoice arrives when your free onboarding period ends.</p> :
        <table><thead><tr><th>Period</th><th className="num">Amount</th><th>Status</th><th>Usage summary</th></tr></thead>
          <tbody>{invs.map((i: any) => (
            <tr key={i.id}>
              <td>{new Date(i.periodStart).toLocaleDateString()} – {new Date(i.periodEnd).toLocaleDateString()}</td>
              <td className="num">{fmt(i.amount)}</td>
              <td><span className={`pill ${i.status}`}>{i.status}</span></td>
              <td className="sub" style={{ margin: 0 }}>{i.usageSummary ? `${i.usageSummary.activeUsers} users · ${i.usageSummary.invoicesIssued} invoices · ${i.usageSummary.contacts} contacts · ${i.usageSummary.products} products` : "—"}</td>
            </tr>
          ))}</tbody></table>}
      <p className="sub" style={{ marginTop: 12 }}>
        Missed payments: reminders → read-only access after ~2–3 months. <b>Your data is never deleted for non-payment</b> — it is retained in escrow and full access is restored when the balance and a reactivation fee are settled. You can export your data at any time, in any account state.
      </p>
    </div>
  </>);
}
