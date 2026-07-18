import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../api";
import { appStrings as appEnglish } from "../locales";
import {
  BLACKBOOK_CATEGORIES,
  blackbookDetailValues,
  parseBlackbookEntries,
  parseBlackbookEntry,
  type BlackbookCategory,
  type BlackbookDetailField,
  type BlackbookEntryDetail,
  type BlackbookEntrySummary,
} from "./blackbook-model";

type LoadStatus = "loading" | "ready" | "error";

interface BlackbookDirectoryProps {
  initialEntryKey?: string | null;
  onInitialEntryConsumed?: () => void;
}

const copy = appEnglish.blackbook;
const categoryOptions: readonly (BlackbookCategory | "")[] = ["", ...BLACKBOOK_CATEGORIES];
const referenceFields: readonly BlackbookDetailField[] = [
  "parentId", "issuingAuthorityId", "licenceTypeId", "authorityId",
];

function formatReviewedDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" })
    .format(new Date(`${value}T12:00:00Z`));
}

function isOfficialUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

function renderPayloadValue(
  field: BlackbookDetailField,
  value: unknown,
  openEntry: (key: string) => void,
): ReactNode {
  if ((field === "website" || field === "officialFormUrl") && isOfficialUrl(value)) {
    return <a className="blackbook-official-link" href={value} target="_blank" rel="noreferrer noopener">
      <strong>{copy.openOfficialLink}</strong><span>{value}</span>
    </a>;
  }
  if (referenceFields.includes(field) && typeof value === "string") {
    return <button className="blackbook-reference-link" type="button" onClick={() => openEntry(value)}>
      {copy.openRelatedEntry.replace("{key}", value)}
    </button>;
  }
  if (field === "services" && Array.isArray(value)) {
    return <ul className="blackbook-value-list">
      {value.filter((item): item is string => typeof item === "string").map((item) =>
        <li key={item}><button className="blackbook-reference-link" type="button"
          onClick={() => openEntry(item)}>{copy.openRelatedEntry.replace("{key}", item)}</button></li>)}
    </ul>;
  }
  if (Array.isArray(value)) {
    return <ul className="blackbook-value-list">{value.map((item, index) =>
      <li key={`${String(item)}:${index}`}>{String(item)}</li>)}</ul>;
  }
  if ((field === "cadence" || field === "renewalFrequency") && typeof value === "string"
    && value in copy.cadence) {
    return copy.cadence[value as keyof typeof copy.cadence];
  }
  if (typeof value === "boolean") return value ? copy.yes : copy.no;
  return String(value);
}

export function BlackbookDirectory({
  initialEntryKey = null,
  onInitialEntryConsumed,
}: BlackbookDirectoryProps) {
  const [category, setCategory] = useState<BlackbookCategory | "">("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [entries, setEntries] = useState<BlackbookEntrySummary[]>([]);
  const [listStatus, setListStatus] = useState<LoadStatus>("loading");
  const [listRetry, setListRetry] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<BlackbookEntryDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("loading");
  const [detailRetry, setDetailRetry] = useState(0);
  const directoryHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!initialEntryKey) return;
    setSelectedKey(initialEntryKey);
    setDetail(null);
    setDetailStatus("loading");
    onInitialEntryConsumed?.();
  }, [initialEntryKey, onInitialEntryConsumed]);

  useEffect(() => {
    const controller = new AbortController();
    setListStatus("loading");
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (appliedQuery) params.set("q", appliedQuery);
    const suffix = params.size ? `?${params.toString()}` : "";
    api(`/blackbook/entries${suffix}`, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setEntries(parseBlackbookEntries(value));
        setListStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEntries([]);
          setListStatus("error");
        }
      });
    return () => controller.abort();
  }, [category, appliedQuery, listRetry]);

  useEffect(() => {
    if (!selectedKey) return;
    const controller = new AbortController();
    setDetailStatus("loading");
    api(`/blackbook/entries/${encodeURIComponent(selectedKey)}`, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        const parsed = parseBlackbookEntry(value);
        if (!parsed) throw new Error("Invalid Black Book entry response");
        setDetail(parsed);
        setDetailStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDetail(null);
          setDetailStatus("error");
        }
      });
    return () => controller.abort();
  }, [selectedKey, detailRetry]);

  useEffect(() => {
    if (detailStatus !== "ready" || !detail) return;
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }, [detail, detailStatus]);

  const openEntry = (key: string, returnFocus?: HTMLElement) => {
    if (returnFocus) returnFocusRef.current = returnFocus;
    setSelectedKey(key);
    setDetail(null);
    setDetailStatus("loading");
  };

  const backToDirectory = () => {
    setSelectedKey(null);
    setDetail(null);
    window.requestAnimationFrame(() => {
      const returnFocus = returnFocusRef.current;
      if (returnFocus?.isConnected) returnFocus.focus();
      else directoryHeadingRef.current?.focus();
    });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedQuery(query.trim());
  };

  if (selectedKey) {
    return <section className="blackbook-workspace" aria-labelledby="blackbook-detail-title">
      <button className="btn blackbook-back" type="button" onClick={backToDirectory}>← {copy.back}</button>
      {detailStatus === "loading" && <div className="blackbook-state" role="status">{copy.loadingDetail}</div>}
      {detailStatus === "error" && <div className="blackbook-state blackbook-state--error" role="alert">
        <p>{copy.detailError}</p>
        <button className="btn" type="button" onClick={() => setDetailRetry((value) => value + 1)}>{copy.retry}</button>
      </div>}
      {detailStatus === "ready" && detail && <article className="blackbook-detail">
        <header className="blackbook-detail-header">
          <div>
            <span className="blackbook-category-label">{copy.categories[detail.category]}</span>
            <h1 id="blackbook-detail-title" ref={detailHeadingRef} tabIndex={-1}>{detail.name}</h1>
          </div>
          <span className={detail.verified ? "blackbook-status is-verified" : "blackbook-status"}>
            {detail.verified ? copy.verified : copy.notVerified}
          </span>
        </header>
        <p className="blackbook-verification-help">{copy.verificationHelp}</p>
        <div className="blackbook-review-date">
          <span>{copy.lastReviewed}</span><strong>{formatReviewedDate(detail.lastReviewed)}</strong>
        </div>
        <aside className="blackbook-notice" aria-label={copy.noticeLabel}>
          <strong>{copy.noticeLabel}</strong><p>{copy.notice}</p>
        </aside>
        <section className="blackbook-detail-section" aria-labelledby="blackbook-information-title">
          <h2 id="blackbook-information-title">{copy.information}</h2>
          {blackbookDetailValues(detail.payload).length ? <dl className="blackbook-facts">
            {blackbookDetailValues(detail.payload).map(({ key, value }) => <div key={key}>
              <dt>{copy.fields[key]}</dt>
              <dd>{renderPayloadValue(key, value, (entryKey) => openEntry(entryKey))}</dd>
            </div>)}
          </dl> : <p className="muted">{copy.noAdditionalInformation}</p>}
        </section>
        <section className="blackbook-detail-section" aria-labelledby="blackbook-sources-title">
          <h2 id="blackbook-sources-title">{copy.sources}</h2>
          <p className="muted">{copy.sourcesHelp}</p>
          <ol className="blackbook-sources">
            {detail.sources.map((source, index) => <li key={source}>
              <a href={source} target="_blank" rel="noreferrer noopener">
                <strong>{copy.sourceNumber.replace("{number}", String(index + 1))}</strong><span>{source}</span>
              </a>
            </li>)}
          </ol>
        </section>
      </article>}
    </section>;
  }

  const resultStatus = listStatus === "loading" ? copy.loading
    : listStatus === "error" ? copy.loadError
      : entries.length === 0 ? copy.empty
        : copy.resultCount.replace("{count}", String(entries.length));

  return <section className="blackbook-workspace" aria-labelledby="blackbook-directory-title">
    <header className="blackbook-directory-header">
      <div>
        <h1 id="blackbook-directory-title" ref={directoryHeadingRef} tabIndex={-1}>{copy.title}</h1>
        <p className="muted">{copy.subtitle}</p>
      </div>
      <span className="blackbook-readonly">{copy.readOnly}</span>
    </header>
    <aside className="blackbook-notice" aria-label={copy.noticeLabel}>
      <strong>{copy.noticeLabel}</strong><p>{copy.notice}</p>
    </aside>
    <form className="blackbook-search" role="search" onSubmit={submitSearch}>
      <label htmlFor="blackbook-query">{copy.searchLabel}</label>
      <div>
        <input id="blackbook-query" type="search" value={query} maxLength={120}
          placeholder={copy.searchPlaceholder} onChange={(event) => setQuery(event.target.value)} />
        <button className="btn primary" type="submit">{copy.search}</button>
        {appliedQuery && <button className="btn" type="button" onClick={() => {
          setQuery(""); setAppliedQuery("");
        }}>{copy.clearSearch}</button>}
      </div>
    </form>
    <div className="blackbook-categories" role="group" aria-label={copy.categoryLabel}>
      {categoryOptions.map((option) => <button key={option || "all"} type="button"
        className={category === option ? "blackbook-category is-active" : "blackbook-category"}
        aria-pressed={category === option} onClick={() => setCategory(option)}>
        {option ? copy.categories[option] : copy.allCategories}
      </button>)}
    </div>
    <p className={listStatus === "error" ? "blackbook-results-status is-error" : "blackbook-results-status"}
      role={listStatus === "error" ? "alert" : "status"} aria-live="polite">{resultStatus}</p>
    {listStatus === "error" && <button className="btn" type="button"
      onClick={() => setListRetry((value) => value + 1)}>{copy.retry}</button>}
    {listStatus === "ready" && entries.length > 0 && <ul className="blackbook-entry-list" aria-label={copy.resultsLabel}>
      {entries.map((entry) => <li key={entry.key}>
        <button type="button" onClick={(event) => openEntry(entry.key, event.currentTarget)}>
          <span className="blackbook-entry-heading">
            <span className="blackbook-category-label">{copy.categories[entry.category]}</span>
            <strong>{entry.name}</strong>
          </span>
          <span className="blackbook-entry-meta">
            <span>{entry.verified ? copy.verified : copy.notVerified}</span>
            <span>{copy.reviewedOn.replace("{date}", formatReviewedDate(entry.lastReviewed))}</span>
          </span>
          <span className="blackbook-open-entry">{copy.openEntry}<span aria-hidden="true"> →</span></span>
        </button>
      </li>)}
    </ul>}
  </section>;
}
