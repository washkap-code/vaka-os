import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { api, fmt, getToken, setToken } from "./api";
import { Landing } from "./landing";
import { appEnglish } from "./locales/app.en";

// ============================================================================
// VAKA PLATFORM — web client
// Auth → tenant-branded shell → Dashboard / CRM / Sales / Inventory /
// Accounting / Reports / Billing. Brand colours come from the tenant record
// (white-label): we set CSS variables at runtime.
// ============================================================================

type Me = {
  userId: string; permissions: string[]; accessLevel: string; mustChangePassword: boolean;
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

  const logout = () => { setToken(null); setMe(null); setGate("landing"); };
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
  const [tenants, setTenants] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api("/platform/tenants").then(setTenants).catch((e: any) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  const runBilling = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api("/platform/billing/run", { method: "POST", body: {} });
      setMsg(`Billing run complete: ${JSON.stringify(r)}`.slice(0, 400));
      load();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">VAKA OS<small>Platform Admin</small></div>
        <nav><button className="active">Tenants</button></nav>
        <div className="foot">
          Jonomi Digital Studio<br />
          <a style={{ color: "rgba(255,255,255,.7)", cursor: "pointer" }} onClick={onLogout}>Sign out</a>
        </div>
      </aside>
      <main className="main">
        <h1>Platform administration</h1>
        <div className="sub">All client tenants running on VAKA OS.</div>
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn accent" disabled={busy} onClick={runBilling}>{busy ? "Running…" : "Run monthly billing now"}</button>
        </div>
        {msg && <div className="banner warn">{msg}</div>}
        <div className="panel">
          <h2>Tenants ({tenants.length})</h2>
          <table>
            <thead><tr><th>Company</th><th>Subdomain</th><th>Status</th><th>Plan</th><th className="num">Users</th><th>Trial ends</th><th>Created</th></tr></thead>
            <tbody>
              {tenants.map((t: any) => (
                <tr key={t.id}>
                  <td>{t.company_name}</td><td>{t.subdomain}</td><td>{t.status}</td><td>{t.plan ?? "—"}</td>
                  <td className="num">{t.user_count}</td>
                  <td>{t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString() : "—"}</td>
                  <td>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {!tenants.length && <tr><td colSpan={7} style={{ color: "var(--muted)" }}>No tenants yet — clients appear here when they sign up.</td></tr>}
            </tbody>
          </table>
        </div>
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
  ["reports", "Reports"], ["imports", "Imports"], ["billing", "Billing & Plan"],
  ["upgrade", "Upgrade"], ["settings", "Settings"],
] as const;
type Page = (typeof NAV)[number][0];

function Shell({ me, onLogout, onRefresh }: { me: Me; onLogout: () => void; onRefresh: () => void }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [arrears] = useLoad(() => api("/billing/arrears-status"));
  const t = me.tenant!;
  const suspended = me.accessLevel !== "full";
  const visibleNav = NAV.filter(([key]) =>
    key !== "imports" || me.permissions.includes("imports.create"));
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
        {page === "imports" && <ImportCenter readonly={suspended} canApprove={me.permissions.includes("imports.approve")} />}
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

function ImportCenter({ readonly, canApprove }: { readonly: boolean; canApprove: boolean }) {
  type ImportKind = "contacts" | "products" | "opening-stock";
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = appEnglish.imports;

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
        body: { csvText },
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
          : copy.openingStockCompleted
            .replace("{value}", `${preview.baseCurrency} ${result.totalValue}`);
      setMessage(completion.replace("{count}", String(result.importedRows)));
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
        </select>
      </div>
      <h2>{kind === "contacts"
        ? copy.contactsTitle
        : kind === "products" ? copy.productsTitle : copy.openingStockTitle}</h2>
      <p className="sub">{kind === "contacts"
        ? copy.contactsHelp
        : kind === "products" ? copy.productsHelp : copy.openingStockHelp}</p>
      <div className="import-template">
        <code>{kind === "contacts"
          ? "name,email,phone,type,is_customer,is_vendor,tax_number,tags"
          : kind === "products"
            ? "sku,name,description,unit,cost_price,sale_price,currency,tax_rate,reorder_level,track_stock,is_active"
            : "sku,warehouse,quantity,unit_cost"}</code>
      </div>
      {kind === "opening-stock" && <p className="sub">{copy.openingStockWarning}</p>}
      <div className="field">
        <label>{copy.chooseCsv}</label>
        <input type="file" accept=".csv,text/csv" disabled={readonly || busy} onChange={selectFile} />
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
            {kind !== "contacts" && <th>{copy.sku}</th>}
            {kind === "opening-stock"
              ? <><th>{copy.warehouse}</th><th>{copy.quantity}</th><th>{copy.unitCost}</th></>
              : <><th>{copy.name}</th><th>{kind === "contacts" ? copy.email : copy.salePrice}</th></>}
            <th>{copy.status}</th><th>{copy.issue}</th></tr></thead>
          <tbody>{preview.rows.map((row) => (
            <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              {kind !== "contacts" && <td>{String(row.data.sku ?? "—")}</td>}
              {kind === "opening-stock"
                ? <><td>{String(row.data.warehouse ?? "—")}</td>
                  <td>{String(row.data.quantity ?? "—")}</td>
                  <td>{String(row.data.unitCost ?? "—")}</td></>
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
        await api("/settings/branding", { method: "PATCH", body: company });
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
      <div className="card"><div className="k">{copy.netProfit}</div><div className={`v ${d.monthToDate.netProfit >= 0 ? "ok" : "bad"}`}>{fmt(d.monthToDate.netProfit, ccy)}</div></div>
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
  const empty = { description: "", quantity: "1", unitPrice: "0", taxRate: "15", productId: "" };
  const [f, setF] = useState<any>({ currency: baseCcy, rateToBase: "1", lines: [{ ...empty }] });

  const setLine = (i: number, k: string, v: string) => {
    const lines = [...f.lines]; lines[i] = { ...lines[i], [k]: v };
    if (k === "productId" && v) {
      const p = (products ?? []).find((x: any) => x.id === v);
      if (p) lines[i] = { ...lines[i], description: p.name, unitPrice: p.salePrice, taxRate: p.taxRate };
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
            <td>{!readonly && <div className="row">
              {i.status === "DRAFT" && <button className="btn sm" onClick={() => act(`/invoices/${i.id}/issue`)}>Issue</button>}
              {(i.status === "ISSUED" || i.status === "PARTIAL") && <button className="btn accent sm" onClick={() => {
                const amount = prompt("Payment amount:", String(Number(i.total) - Number(i.amount_paid)));
                if (amount) act(`/invoices/${i.id}/payments`, { amount });
              }}>Record payment</button>}
              {i.status !== "VOID" && i.status !== "PAID" && <button className="btn ghost sm" onClick={() => {
                const reason = prompt("Reason for voiding:"); if (reason) act(`/invoices/${i.id}/void`, { reason });
              }}>Void</button>}
            </div>}</td>
          </tr>
        ))}</tbody></table>
      {rows && rows.length === 0 && <p className="sub" style={{ marginTop: 10 }}>No invoices yet.</p>}
    </div>
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
          <input style={{ flex: 1 }} placeholder="VAT %" value={l.taxRate} onChange={(e) => setLine(i, "taxRate", e.target.value)} />
        </div>
      ))}
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
  const [f, setF] = useState<any>({ currency: "USD", taxRate: "15", costPrice: "0", salePrice: "0", reorderLevel: 0, trackStock: true, unitOfMeasure: "unit" });
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
    try { await api("/stock/adjust", { method: "POST", body: { productId: p.id, warehouseId: warehouses[0].id, quantityDelta, note } }); reload(); }
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
        <div className="field"><label>VAT rate %</label><input value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} /></div>
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
  const [tab, setTab] = useState<"pl" | "bs" | "ar" | "journal">("pl");
  const [pl] = useLoad(() => api("/reports/profit-loss"), [tab]);
  const [bs] = useLoad(() => api("/reports/balance-sheet"), [tab]);
  const [ar] = useLoad(() => api("/reports/aged-receivables"), [tab]);
  const [journal] = useLoad(() => api("/journal"), [tab]);
  return (<>
    <h1>Reports</h1><div className="sub">Every figure computed live from the double-entry ledger — in {ccy}</div>
    <div className="row" style={{ marginBottom: 16 }}>
      {(["pl", "bs", "ar", "journal"] as const).map((t) => (
        <button key={t} className={`btn ${tab === t ? "" : "ghost"} sm`} onClick={() => setTab(t)}>
          {{ pl: "Profit & Loss", bs: "Balance Sheet", ar: "Aged Receivables", journal: "Journal" }[t]}
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
        <tr><td><b>Net profit</b></td><td className="num" style={{ color: pl.netProfit >= 0 ? "var(--ok)" : "var(--danger)" }}><b>{fmt(pl.netProfit, ccy)}</b></td></tr>
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
        <tr><td><b>Total liabilities &amp; equity</b></td><td className="num"><b>{fmt(bs.totalLiabilities + bs.totalEquity, ccy)}</b></td></tr>
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
