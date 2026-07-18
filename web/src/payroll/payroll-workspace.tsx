// ============================================================================
// P2-009 — Payroll workspace (TECHNICAL PREVIEW).
// Every screen carries the accountant-gate banner served by /payroll/config.
// Draft runs are editable (taxable allowances only); posted runs are
// immutable; corrections are full reversals. The UI is not a security
// boundary — every action is permission-checked server-side.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { api, fmt } from "../api";
import { appStrings as appEnglish } from "../locales";

type Currency = "USD" | "ZWG";
type Employee = {
  id: string; employeeNumber: string; firstName: string; lastName: string;
  nationalId: string | null; nssaNumber: string | null; email: string | null; phone: string | null;
  currency: Currency; basicSalary: string; status: "ACTIVE" | "ENDED";
  startDate: string | null; endDate: string | null;
};
type PayrollRun = {
  id: string; periodMonth: string; currency: Currency;
  status: "DRAFT" | "POSTED" | "REVERSED"; employeeCount: number;
  grossTotal: string; payeTotal: string; taxLevyTotal: string;
  ssEmployeeTotal: string; ssEmployerTotal: string; netTotal: string;
  verificationStatus: string; verificationNote: string;
};
type Payslip = {
  id: string; employeeNumber: string; employeeName: string; currency: Currency;
  basicSalary: string; allowances: string; grossPay: string;
  ssEmployee: string; ssEmployer: string; taxablePay: string;
  paye: string; taxLevy: string; netPay: string;
};
type RunDetail = PayrollRun & { payslips: Payslip[] };
type PayrollConfig = {
  baseCurrency: Currency;
  verification: { status: string; note: string };
};

const copy = appEnglish.payroll;

export function PayrollWorkspace({ readonly: suspended, permissions, baseCurrency }: {
  readonly: boolean;
  permissions: readonly string[];
  baseCurrency: Currency;
}) {
  const canManage = !suspended && permissions.includes("payroll.manage");
  const canPost = !suspended && permissions.includes("payroll.post");
  const [tab, setTab] = useState<"employees" | "runs">("employees");
  const [config, setConfig] = useState<PayrollConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/payroll/config").then((c) => setConfig(c as PayrollConfig)).catch((e: Error) => setError(e.message));
  }, []);

  const banner = config?.verification.note ?? copy.previewBanner;

  return (
    <div>
      <h1>{copy.title}</h1>
      <p className="muted">{copy.subtitle}</p>
      <div className="banner warn" role="note">{banner}</div>
      {error && <div className="banner error" role="alert">{error}</div>}
      <div className="tabs" role="tablist">
        {(["employees", "runs"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={tab === key ? "tab active" : "tab"} onClick={() => setTab(key)}>
            {copy.tabs[key]}
          </button>
        ))}
      </div>
      {tab === "employees" && <EmployeesPanel canManage={canManage} baseCurrency={baseCurrency} onError={setError} />}
      {tab === "runs" && <RunsPanel canManage={canManage} canPost={canPost} baseCurrency={baseCurrency} onError={setError} />}
    </div>
  );
}

function EmployeesPanel({ canManage, baseCurrency, onError }: {
  canManage: boolean; baseCurrency: Currency; onError: (message: string) => void;
}) {
  const ec = copy.employees;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    employeeNumber: "", firstName: "", lastName: "", nationalId: "", nssaNumber: "",
    basicSalary: "", startDate: "",
  });
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    api("/payroll/employees").then((rows) => setEmployees(rows as Employee[]))
      .catch((e: Error) => onError(e.message));
  }, [onError]);
  useEffect(refresh, [refresh]);

  const save = async () => {
    setSaving(true); onError("");
    try {
      await api("/payroll/employees", {
        method: "POST",
        body: {
          employeeNumber: form.employeeNumber.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          ...(form.nationalId.trim() && { nationalId: form.nationalId.trim() }),
          ...(form.nssaNumber.trim() && { nssaNumber: form.nssaNumber.trim() }),
          currency: baseCurrency,
          basicSalary: form.basicSalary.trim(),
          ...(form.startDate && { startDate: form.startDate }),
        },
      });
      setForm({ employeeNumber: "", firstName: "", lastName: "", nationalId: "", nssaNumber: "", basicSalary: "", startDate: "" });
      setShowForm(false);
      refresh();
    } catch (e) { onError((e as Error).message); } finally { setSaving(false); }
  };

  const endEmployment = async (employee: Employee) => {
    const endDate = window.prompt(`${ec.endDate} (YYYY-MM-DD)`, new Date().toISOString().slice(0, 10));
    if (!endDate) return;
    onError("");
    try {
      await api(`/payroll/employees/${employee.id}`, {
        method: "PATCH", body: { status: "ENDED", endDate },
      });
      refresh();
    } catch (e) { onError((e as Error).message); }
  };

  return (
    <div className="panel">
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn" onClick={() => setShowForm((v) => !v)}>{ec.add}</button>
        </div>
      )}
      {showForm && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="grid two">
            <label>{ec.number}<input value={form.employeeNumber}
              onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} /></label>
            <label>{ec.basicSalary} ({baseCurrency})<input inputMode="decimal" value={form.basicSalary}
              onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} /></label>
            <label>{ec.firstName}<input value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
            <label>{ec.lastName}<input value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
            <label>{ec.nationalId}<input value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></label>
            <label>{ec.nssaNumber}<input value={form.nssaNumber}
              onChange={(e) => setForm({ ...form, nssaNumber: e.target.value })} /></label>
            <label>{ec.startDate}<input type="date" value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          </div>
          <button type="button" className="btn primary" disabled={saving
            || !form.employeeNumber.trim() || !form.firstName.trim() || !form.lastName.trim()
            || !/^\d{1,10}(\.\d{1,2})?$/.test(form.basicSalary.trim())}
            onClick={save}>{ec.save}</button>
        </div>
      )}
      {!employees.length ? <p className="muted">{ec.empty}</p> : (
        <table className="table">
          <thead><tr>
            <th>{ec.number}</th><th>{ec.name}</th><th>{ec.nssaNumber}</th>
            <th style={{ textAlign: "right" }}>{ec.basicSalary}</th><th>{ec.status}</th><th />
          </tr></thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.employeeNumber}</td>
                <td>{employee.firstName} {employee.lastName}</td>
                <td>{employee.nssaNumber ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{fmt(employee.basicSalary, employee.currency)}</td>
                <td>{employee.status}</td>
                <td>
                  {canManage && employee.status === "ACTIVE" && (
                    <button type="button" className="btn small" onClick={() => endEmployment(employee)}>
                      {ec.endEmployment}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RunsPanel({ canManage, canPost, baseCurrency, onError }: {
  canManage: boolean; canPost: boolean; baseCurrency: Currency; onError: (message: string) => void;
}) {
  const rc = copy.runs;
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selected, setSelected] = useState<RunDetail | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api("/payroll/runs").then((rows) => setRuns(rows as PayrollRun[]))
      .catch((e: Error) => onError(e.message));
  }, [onError]);
  useEffect(refresh, [refresh]);

  const openRun = async (id: string) => {
    onError("");
    try { setSelected(await api(`/payroll/runs/${id}`) as RunDetail); }
    catch (e) { onError((e as Error).message); }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); onError("");
    try { await fn(); refresh(); }
    catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };

  const createRun = () => act(async () => {
    const run = await api("/payroll/runs", { method: "POST", body: { month } }) as PayrollRun;
    await openRun(run.id);
  });
  const postRun = (run: RunDetail) => {
    if (!window.confirm(rc.postConfirm)) return;
    act(async () => { await api(`/payroll/runs/${run.id}/post`, { method: "POST" }); await openRun(run.id); });
  };
  const reverseRun = (run: RunDetail) => {
    const reason = window.prompt(rc.reversePrompt);
    if (!reason || reason.trim().length < 3) return;
    act(async () => {
      await api(`/payroll/runs/${run.id}/reverse`, { method: "POST", body: { reason: reason.trim() } });
      await openRun(run.id);
    });
  };
  const deleteRun = (run: RunDetail) => {
    if (!window.confirm(rc.deleteConfirm)) return;
    act(async () => { await api(`/payroll/runs/${run.id}`, { method: "DELETE" }); setSelected(null); });
  };
  const updateAllowance = (run: RunDetail, slip: Payslip, value: string) =>
    act(async () => {
      await api(`/payroll/runs/${run.id}/payslips/${slip.id}`, { method: "PATCH", body: { allowances: value } });
      await openRun(run.id);
    });

  if (selected) {
    return <RunDetailPanel run={selected} canManage={canManage} canPost={canPost} busy={busy}
      onBack={() => { setSelected(null); refresh(); }}
      onPost={postRun} onReverse={reverseRun} onDelete={deleteRun} onAllowance={updateAllowance} />;
  }

  return (
    <div className="panel">
      {canManage && (
        <div style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 12 }}>
          <label>{rc.month}<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <button type="button" className="btn primary" disabled={busy || !/^\d{4}-\d{2}$/.test(month)}
            onClick={createRun}>{rc.create}</button>
        </div>
      )}
      {!runs.length ? <p className="muted">{rc.empty}</p> : (
        <table className="table">
          <thead><tr>
            <th>{rc.period}</th><th>{rc.statusLabel}</th><th>{rc.employeesLabel}</th>
            <th style={{ textAlign: "right" }}>{rc.gross}</th>
            <th style={{ textAlign: "right" }}>{rc.net}</th><th />
          </tr></thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.periodMonth.slice(0, 7)}</td>
                <td>{run.status}</td>
                <td>{run.employeeCount}</td>
                <td style={{ textAlign: "right" }}>{fmt(run.grossTotal, run.currency)}</td>
                <td style={{ textAlign: "right" }}>{fmt(run.netTotal, run.currency)}</td>
                <td><button type="button" className="btn small" onClick={() => openRun(run.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RunDetailPanel({ run, canManage, canPost, busy, onBack, onPost, onReverse, onDelete, onAllowance }: {
  run: RunDetail; canManage: boolean; canPost: boolean; busy: boolean;
  onBack: () => void;
  onPost: (run: RunDetail) => void;
  onReverse: (run: RunDetail) => void;
  onDelete: (run: RunDetail) => void;
  onAllowance: (run: RunDetail, slip: Payslip, value: string) => void;
}) {
  const rc = copy.runs;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const hint = run.status === "DRAFT" ? rc.draftHint : run.status === "POSTED" ? rc.postedHint : rc.reversedHint;

  return (
    <div className="panel">
      <button type="button" className="btn small" onClick={onBack}>{rc.back}</button>
      <h2>{rc.period}: {run.periodMonth.slice(0, 7)} — {run.status}</h2>
      <p className="muted">{hint}</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {canPost && run.status === "DRAFT" && (
          <button type="button" className="btn primary" disabled={busy} onClick={() => onPost(run)}>{rc.post}</button>
        )}
        {canManage && run.status === "DRAFT" && (
          <button type="button" className="btn" disabled={busy} onClick={() => onDelete(run)}>{rc.deleteDraft}</button>
        )}
        {canPost && run.status === "POSTED" && (
          <button type="button" className="btn" disabled={busy} onClick={() => onReverse(run)}>{rc.reverse}</button>
        )}
      </div>
      <table className="table">
        <thead><tr>
          <th>{copy.employees.number}</th><th>{copy.employees.name}</th>
          <th style={{ textAlign: "right" }}>{copy.employees.basicSalary}</th>
          <th style={{ textAlign: "right" }}>{rc.allowances}</th>
          <th style={{ textAlign: "right" }}>{rc.gross}</th>
          <th style={{ textAlign: "right" }}>{rc.nssaEmployee}</th>
          <th style={{ textAlign: "right" }}>{rc.taxable}</th>
          <th style={{ textAlign: "right" }}>{rc.paye}</th>
          <th style={{ textAlign: "right" }}>{rc.aidsLevy}</th>
          <th style={{ textAlign: "right" }}>{rc.net}</th>
        </tr></thead>
        <tbody>
          {run.payslips.map((slip) => (
            <tr key={slip.id}>
              <td>{slip.employeeNumber}</td>
              <td>{slip.employeeName}</td>
              <td style={{ textAlign: "right" }}>{fmt(slip.basicSalary, slip.currency)}</td>
              <td style={{ textAlign: "right" }}>
                {canManage && run.status === "DRAFT" ? (
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <input style={{ width: 90, textAlign: "right" }} inputMode="decimal"
                      aria-label={`${rc.allowances} — ${slip.employeeName}`}
                      value={drafts[slip.id] ?? slip.allowances}
                      onChange={(e) => setDrafts({ ...drafts, [slip.id]: e.target.value })} />
                    <button type="button" className="btn small" disabled={busy
                      || !/^\d{1,10}(\.\d{1,2})?$/.test((drafts[slip.id] ?? slip.allowances).trim())}
                      onClick={() => onAllowance(run, slip, (drafts[slip.id] ?? slip.allowances).trim())}>
                      {rc.updateAllowance}
                    </button>
                  </span>
                ) : fmt(slip.allowances, slip.currency)}
              </td>
              <td style={{ textAlign: "right" }}>{fmt(slip.grossPay, slip.currency)}</td>
              <td style={{ textAlign: "right" }}>{fmt(slip.ssEmployee, slip.currency)}</td>
              <td style={{ textAlign: "right" }}>{fmt(slip.taxablePay, slip.currency)}</td>
              <td style={{ textAlign: "right" }}>{fmt(slip.paye, slip.currency)}</td>
              <td style={{ textAlign: "right" }}>{fmt(slip.taxLevy, slip.currency)}</td>
              <td style={{ textAlign: "right" }}><strong>{fmt(slip.netPay, slip.currency)}</strong></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}><strong>{rc.gross}: {fmt(run.grossTotal, run.currency)}</strong></td>
            <td colSpan={2}><strong>{rc.paye} + {rc.aidsLevy}: {fmt(
              (Number(run.payeTotal) + Number(run.taxLevyTotal)).toFixed(2), run.currency)}</strong></td>
            <td colSpan={2}><strong>{rc.nssaEmployer}: {fmt(run.ssEmployerTotal, run.currency)}</strong></td>
            <td colSpan={2}><strong>{rc.net}: {fmt(run.netTotal, run.currency)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
