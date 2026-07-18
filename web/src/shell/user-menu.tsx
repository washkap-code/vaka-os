import { useEffect, useRef, useState } from "react";
import { appStrings as appEnglish, getLocale, setLocale, LOCALE_LABELS, SUPPORTED_LOCALES } from "../locales";

export function UserMenu({ fullName, email, onSettings, onLogout }: {
  fullName: string;
  email: string;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const copy = appEnglish.shell.account;
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const initial = fullName.trim().charAt(0).toUpperCase() || "V";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };
  return <div className="shell-popover" ref={panelRef}>
    <button className="account-trigger" type="button" aria-label={copy.open}
      aria-expanded={open} aria-controls="workspace-account-menu" onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">{initial}</span><b>{fullName}</b>
    </button>
    {open && <div id="workspace-account-menu" className="shell-menu account-panel">
      <div className="account-identity"><strong>{fullName}</strong><span>{email}</span></div>
      <button type="button" onClick={() => choose(onSettings)}>{copy.settings}</button>
      <div className="account-language" role="group" aria-label={copy.language}>
        <span className="account-language-label">{copy.language}</span>
        {SUPPORTED_LOCALES.map((code) => (
          <button key={code} type="button" aria-pressed={getLocale() === code}
            onClick={() => { setOpen(false); setLocale(code); }}>
            {LOCALE_LABELS[code]}
          </button>
        ))}
        {getLocale() !== "en" && <small className="account-language-notice">{copy.languageReferenceNotice}</small>}
      </div>
      <button type="button" onClick={() => choose(onLogout)}>{copy.signOut}</button>
    </div>}
  </div>;
}
