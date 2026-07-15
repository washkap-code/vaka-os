// ============================================================================
// PW-004 — Task centre surface. Visible only when the tenant's
// `workflow.centre` feature flag is enabled (nav + page are hidden otherwise;
// the API fails closed regardless — the UI is never the security boundary).
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { appEnglish } from "../locales/app.en";

type TaskStatus = "OPEN" | "DONE" | "DISMISSED";
type TenantTask = {
  id: string;
  title: string;
  detail: string | null;
  status: TaskStatus;
  sourceType: "automation" | "manual";
  sourceKey: string | null;
  subjectType: string | null;
  createdAt: string;
  closedAt: string | null;
};

const copy = appEnglish.tasks;
const tabs = [
  { key: "OPEN" as const, label: copy.tabs.open },
  { key: "DONE" as const, label: copy.tabs.done },
  { key: "DISMISSED" as const, label: copy.tabs.dismissed },
];

export function TasksWorkspace({ readonly: suspended }: { readonly: boolean }) {
  const [tab, setTab] = useState<TaskStatus>("OPEN");
  const [tasks, setTasks] = useState<TenantTask[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", detail: "" });

  const refresh = useCallback(() => {
    api(`/tasks?status=${tab}`).then((rows) => setTasks(rows as TenantTask[]))
      .catch((e: Error) => setError(e.message));
  }, [tab]);
  useEffect(refresh, [refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const createTask = () => act(async () => {
    await api("/tasks", {
      method: "POST",
      body: { title: form.title.trim(), ...(form.detail.trim() && { detail: form.detail.trim() }) },
    });
    setForm({ title: "", detail: "" });
    setShowForm(false);
  });

  const close = (task: TenantTask, outcome: "DONE" | "DISMISSED") =>
    act(() => api(`/tasks/${task.id}/close`, { method: "POST", body: { outcome } }));

  return (
    <div>
      <h1>{copy.title}</h1>
      <p className="muted">{copy.subtitle}</p>
      {error && <div className="banner error" role="alert">{error}</div>}
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={tab === t.key ? "tab active" : "tab"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel">
        {!suspended && tab === "OPEN" && (
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="btn" onClick={() => setShowForm((v) => !v)}>{copy.add}</button>
          </div>
        )}
        {showForm && (
          <div className="panel" style={{ marginBottom: 12 }}>
            <label>{copy.titleLabel}<input value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></label>
            <label>{copy.detailLabel}<textarea value={form.detail} rows={2}
              onChange={(e) => setForm({ ...form, detail: e.target.value })} maxLength={2000} /></label>
            <button type="button" className="btn primary" disabled={busy || form.title.trim().length < 3}
              onClick={createTask}>{copy.save}</button>
          </div>
        )}
        {!tasks.length ? (
          <p className="muted">{tab === "OPEN" ? copy.emptyOpen : copy.emptyClosed}</p>
        ) : (
          <table className="table">
            <thead><tr>
              <th>{copy.titleLabel}</th><th>{copy.sourceAutomation}/{copy.sourceManual}</th>
              <th>{tab === "OPEN" ? copy.created : copy.closed}</th><th />
            </tr></thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <strong>{task.title}</strong>
                    {task.detail && <div className="muted" style={{ fontSize: "0.9em" }}>{task.detail}</div>}
                  </td>
                  <td>{task.sourceType === "automation" ? copy.sourceAutomation : copy.sourceManual}</td>
                  <td>{new Date(task.closedAt ?? task.createdAt).toLocaleDateString()}</td>
                  <td>
                    {!suspended && task.status === "OPEN" && (
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button type="button" className="btn small primary" disabled={busy}
                          onClick={() => close(task, "DONE")}>{copy.done}</button>
                        <button type="button" className="btn small" disabled={busy}
                          onClick={() => close(task, "DISMISSED")}>{copy.dismiss}</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
