import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { appStrings as appEnglish } from "../locales";
import { notificationCopy, type NotificationItem } from "./notification-copy";

export function NotificationMenu() {
  const copy = appEnglish.shell.notifications;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(false);
    void api("/notifications?limit=20")
      .then((result) => { if (active) setItems(result.notifications ?? []); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return <div className="shell-popover" ref={panelRef}>
    <button className="shell-icon-button" type="button" aria-label={copy.open}
      aria-expanded={open} aria-controls="workspace-notifications" onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">●</span>
    </button>
    {open && <section id="workspace-notifications" className="shell-menu notification-panel" aria-label={copy.title}>
      <div className="shell-menu-heading"><strong>{copy.title}</strong><span>{copy.recent}</span></div>
      {loading ? <p role="status">{copy.loading}</p> : error ? <p role="alert">{copy.error}</p>
        : items.length === 0 ? <p>{copy.empty}</p>
          : <ol>{items.map((item) => {
            const content = notificationCopy(item, copy);
            return <li key={item.id}>
              <strong>{content.title}</strong><span>{content.detail}</span>
              <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-ZW")}</time>
            </li>;
          })}</ol>}
    </section>}
  </div>;
}
