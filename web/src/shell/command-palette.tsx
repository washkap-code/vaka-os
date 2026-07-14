import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { api, fmt } from "../api";
import { Dialog } from "../design-system";
import { appEnglish } from "../locales/app.en";
import {
  isEditableSearchShortcutTarget,
  parseWorkspaceSearchResponse,
  workspaceSearchTarget,
  type WorkspaceSearchResult,
  type WorkspaceSearchTarget,
} from "./command-search-model";

const entityOrder: readonly WorkspaceSearchResult["entityType"][] = ["customer", "supplier", "invoice", "product"];

function resultDetail(result: WorkspaceSearchResult): string {
  if (result.document.entityType === "customer") {
    return result.document.contactType === "COMPANY"
      ? appEnglish.shell.search.company
      : appEnglish.shell.search.individual;
  }
  if (result.document.entityType === "supplier") {
    return result.document.supplierCode
      ? appEnglish.shell.search.supplierCode.replace("{code}", result.document.supplierCode)
      : appEnglish.shell.search.supplier;
  }
  if (result.document.entityType === "invoice") {
    return `${result.document.customerName} · ${fmt(result.document.total, result.document.currency)}`;
  }
  return `${result.document.sku} · ${fmt(result.document.salePrice, result.document.currency)}`;
}

export function CommandPalette({ onSelect }: { onSelect: (target: WorkspaceSearchTarget) => void }) {
  const copy = appEnglish.shell.search;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const requestVersionRef = useRef(0);

  const openPalette = () => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    setOpen(true);
  };

  const closePalette = () => {
    requestVersionRef.current += 1;
    setOpen(false);
    setQuery("");
    setResults([]);
    setStatus("idle");
    setActiveIndex(0);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slashShortcut = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey
        && !isEditableSearchShortcutTarget(event.target);
      if (!commandShortcut && !slashShortcut) return;
      event.preventDefault();
      if (!open) openPalette();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setResults([]);
      setStatus("idle");
      setActiveIndex(0);
      return;
    }
    const controller = new AbortController();
    const version = ++requestVersionRef.current;
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await api(`/search?q=${encodeURIComponent(trimmed)}&limit=20`, { signal: controller.signal });
        if (version !== requestVersionRef.current) return;
        const parsed = parseWorkspaceSearchResponse(response);
        setResults(parsed);
        setActiveIndex(0);
        setStatus("ready");
      } catch (error: unknown) {
        if (controller.signal.aborted || version !== requestVersionRef.current) return;
        setResults([]);
        setStatus("error");
      }
    }, 240);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const grouped = useMemo(() => entityOrder.map((entityType) => ({
    entityType,
    results: results.filter((result) => result.entityType === entityType),
  })).filter((group) => group.results.length > 0), [results]);
  const orderedResults = useMemo(() => grouped.flatMap((group) => group.results), [grouped]);

  const activate = (result: WorkspaceSearchResult) => {
    const target = workspaceSearchTarget(result);
    if (!target) return;
    closePalette();
    onSelect(target);
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (!orderedResults.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + orderedResults.length) % orderedResults.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = orderedResults[activeIndex];
      if (result) activate(result);
    }
  };

  const activeResult = orderedResults[activeIndex];
  const statusMessage = status === "loading" ? copy.loading
    : status === "error" ? copy.error
      : status === "ready" && !results.length ? copy.empty
        : status === "ready" ? copy.resultCount.replace("{count}", String(results.length))
          : query.length === 1 ? copy.keepTyping : copy.initial;

  return <div id="vaka-command-bar-mount" className="command-bar-mount">
    <button ref={triggerRef} className="command-search-trigger" type="button" onClick={openPalette}
      aria-label={copy.trigger} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">
      <span aria-hidden="true">⌕</span><span>{copy.trigger}</span><kbd>⌘K</kbd>
    </button>
    <Dialog open={open} onClose={closePalette} title={copy.title} description={copy.description} closeLabel={copy.close}>
      <div className="command-palette">
        <label htmlFor="workspace-command-query">{copy.label}</label>
        <input ref={inputRef} id="workspace-command-query" className="command-search-input" type="search"
          value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onInputKeyDown}
          placeholder={copy.placeholder} autoComplete="off" role="combobox" aria-autocomplete="list"
          aria-expanded={results.length > 0} aria-controls="workspace-search-results"
          aria-activedescendant={activeResult ? `workspace-search-result-${activeResult.entityType}-${activeResult.id}` : undefined} />
        <p className={`command-search-status ${status === "error" ? "command-search-status--error" : ""}`}
          role="status" aria-live="polite">{statusMessage}</p>
        {results.length > 0 && <div id="workspace-search-results" className="command-search-results" role="listbox" aria-label={copy.results}>
          {grouped.map((group) => <section key={group.entityType} role="group" aria-labelledby={`search-group-${group.entityType}`}>
            <h3 id={`search-group-${group.entityType}`}>{group.results[0]?.object.fallbackLabel}</h3>
            {group.results.map((result) => {
              const index = orderedResults.findIndex((candidate) => candidate.id === result.id && candidate.entityType === result.entityType);
              return <button key={`${result.entityType}:${result.id}`} id={`workspace-search-result-${result.entityType}-${result.id}`}
                type="button" role="option" aria-selected={index === activeIndex}
                className={index === activeIndex ? "command-search-result is-active" : "command-search-result"}
                onMouseMove={() => setActiveIndex(index)} onClick={() => activate(result)}>
                <span><strong>{result.title}</strong><small>{resultDetail(result)}</small></span>
                <span aria-hidden="true">→</span>
              </button>;
            })}
          </section>)}
        </div>}
        <p className="command-search-hint">{copy.keyboardHint}</p>
      </div>
    </Dialog>
  </div>;
}
