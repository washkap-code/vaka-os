// ============================================================================
// PD-001 — Documents workspace surface. Visible only when the tenant's
// `documents.workspace` feature flag is enabled AND the user holds
// documents.read (nav + page hidden otherwise; the API fails closed
// regardless — the UI is never the security boundary). Uploads are PNG/JPEG/
// PDF data URLs up to 1.5 MB; every upload is a new immutable version.
// ============================================================================
import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { appEnglish } from "../locales/app.en";

type DocumentStatus = "ACTIVE" | "ARCHIVED";
type Classification = keyof typeof appEnglish.documents.classification;
type Folder = { id: string; name: string; parentId: string | null };
type WorkspaceDocument = {
  id: string;
  folderId: string | null;
  title: string;
  classification: Classification;
  status: DocumentStatus;
  currentVersion: number;
  updatedAt: string;
};
type DocumentVersion = {
  id: string; version: number; fileName: string; mediaType: string;
  byteSize: number; createdAt: string;
};

const copy = appEnglish.documents;
const CLASSIFICATIONS = Object.keys(copy.classification) as Classification[];
const ACCEPTED = ["image/png", "image/jpeg", "application/pdf"];
const MAX_BYTES = 1_500_000;

const formatSize = (bytes: number) =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File could not be read"));
    reader.readAsDataURL(file);
  });
}

export function DocumentsWorkspace({ readonly: suspended, canManage }: {
  readonly: boolean; canManage: boolean;
}) {
  const [tab, setTab] = useState<DocumentStatus>("ACTIVE");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [expanded, setExpanded] = useState<string>("");
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [upload, setUpload] = useState({ title: "", classification: "OTHER" as Classification, file: null as File | null });

  const refreshFolders = useCallback(() => {
    api("/documents/folders").then((rows) => setFolders(rows as Folder[]))
      .catch((e: Error) => setError(e.message));
  }, []);
  const refreshDocuments = useCallback(() => {
    const query = `status=${tab}${folderId ? `&folderId=${folderId}` : ""}`;
    api(`/documents?${query}`).then((rows) => setDocuments(rows as WorkspaceDocument[]))
      .catch((e: Error) => setError(e.message));
  }, [tab, folderId]);
  useEffect(refreshFolders, [refreshFolders]);
  useEffect(refreshDocuments, [refreshDocuments]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); refreshDocuments(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED.includes(file.type)) return copy.fileTypeInvalid;
    if (file.size > MAX_BYTES) return copy.fileTooLarge;
    return null;
  };

  const createFolder = () => act(async () => {
    await api("/documents/folders", { method: "POST", body: { name: folderName.trim() } });
    setFolderName(""); setShowFolderForm(false); refreshFolders();
  });

  const uploadDocument = () => act(async () => {
    const file = upload.file!;
    const invalid = validateFile(file);
    if (invalid) throw new Error(invalid);
    await api("/documents", {
      method: "POST",
      body: {
        title: upload.title.trim(),
        classification: upload.classification,
        ...(folderId && { folderId }),
        fileName: file.name,
        dataUrl: await readFileAsDataUrl(file),
      },
    });
    setUpload({ title: "", classification: "OTHER", file: null });
    setShowUpload(false);
  });

  const addVersion = (documentId: string, file: File) => act(async () => {
    const invalid = validateFile(file);
    if (invalid) throw new Error(invalid);
    await api(`/documents/${documentId}/versions`, {
      method: "POST",
      body: { fileName: file.name, dataUrl: await readFileAsDataUrl(file) },
    });
    if (expanded === documentId) await toggleVersions(documentId, true);
  });

  const setStatus = (documentId: string, action: "archive" | "restore") =>
    act(() => api(`/documents/${documentId}/${action}`, { method: "POST" }));

  const download = (documentId: string, version?: number) => act(async () => {
    const content = await api(`/documents/${documentId}/content${version ? `?version=${version}` : ""}`) as
      { fileName: string; dataUrl: string };
    const link = document.createElement("a");
    link.href = content.dataUrl;
    link.download = content.fileName;
    link.click();
  });

  const toggleVersions = async (documentId: string, forceOpen = false) => {
    if (expanded === documentId && !forceOpen) { setExpanded(""); setVersions([]); return; }
    try {
      const detail = await api(`/documents/${documentId}`) as { versions: DocumentVersion[] };
      setExpanded(documentId); setVersions(detail.versions);
    } catch (e) { setError((e as Error).message); }
  };

  const writable = !suspended && canManage;

  return (
    <div>
      <h1>{copy.title}</h1>
      <p className="muted">{copy.subtitle}</p>
      {error && <div className="banner error" role="alert">{error}</div>}
      <div className="tabs" role="tablist">
        {([["ACTIVE", copy.tabs.active], ["ARCHIVED", copy.tabs.archived]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={tab === key ? "tab active" : "tab"} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <label style={{ margin: 0 }}>{copy.folders}{" "}
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">{copy.allFolders}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.parentId ? `— ${folder.name}` : folder.name}
                </option>
              ))}
            </select>
          </label>
          {writable && (
            <>
              <button type="button" className="btn" onClick={() => setShowFolderForm((v) => !v)}>{copy.newFolder}</button>
              <button type="button" className="btn primary" onClick={() => setShowUpload((v) => !v)}>{copy.upload}</button>
            </>
          )}
        </div>
        {showFolderForm && writable && (
          <div className="panel" style={{ marginBottom: 12 }}>
            <label>{copy.folderNameLabel}<input value={folderName} maxLength={120}
              onChange={(e) => setFolderName(e.target.value)} /></label>
            <button type="button" className="btn primary" disabled={busy || !folderName.trim()}
              onClick={createFolder}>{copy.createFolder}</button>
          </div>
        )}
        {showUpload && writable && (
          <div className="panel" style={{ marginBottom: 12 }}>
            <label>{copy.titleLabel}<input value={upload.title} maxLength={200}
              onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></label>
            <label>{copy.classificationLabel}
              <select value={upload.classification}
                onChange={(e) => setUpload({ ...upload, classification: e.target.value as Classification })}>
                {CLASSIFICATIONS.map((key) => <option key={key} value={key}>{copy.classification[key]}</option>)}
              </select>
            </label>
            <label>{copy.fileLabel}<input type="file" accept={ACCEPTED.join(",")}
              onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })} /></label>
            <button type="button" className="btn primary"
              disabled={busy || !upload.title.trim() || !upload.file}
              onClick={uploadDocument}>{busy ? copy.uploading : copy.save}</button>
          </div>
        )}
        {!documents.length ? (
          <p className="muted">{tab === "ACTIVE" ? copy.emptyActive : copy.emptyArchived}</p>
        ) : (
          <table className="table">
            <thead><tr>
              <th>{copy.columns.title}</th><th>{copy.columns.classification}</th>
              <th>{copy.columns.version}</th><th>{copy.columns.updated}</th><th />
            </tr></thead>
            <tbody>
              {documents.map((doc) => (
                <Fragment key={doc.id}>
                  <tr>
                    <td><strong>{doc.title}</strong></td>
                    <td>{copy.classification[doc.classification] ?? doc.classification}</td>
                    <td>
                      <button type="button" className="btn small" onClick={() => toggleVersions(doc.id)}
                        aria-expanded={expanded === doc.id}>
                        v{doc.currentVersion} · {copy.versions}
                      </button>
                    </td>
                    <td>{new Date(doc.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" className="btn small" disabled={busy}
                          onClick={() => download(doc.id)}>{copy.download}</button>
                        {writable && doc.status === "ACTIVE" && (
                          <>
                            <label className="btn small" style={{ marginBottom: 0 }}>
                              {copy.newVersion}
                              <input type="file" accept={ACCEPTED.join(",")} style={{ display: "none" }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) void addVersion(doc.id, file);
                                }} />
                            </label>
                            <button type="button" className="btn small" disabled={busy}
                              onClick={() => setStatus(doc.id, "archive")}>{copy.archive}</button>
                          </>
                        )}
                        {writable && doc.status === "ARCHIVED" && (
                          <button type="button" className="btn small" disabled={busy}
                            onClick={() => setStatus(doc.id, "restore")}>{copy.restore}</button>
                        )}
                      </span>
                    </td>
                  </tr>
                  {expanded === doc.id && (
                    <tr>
                      <td colSpan={5}>
                        <ul style={{ margin: 0 }}>
                          {versions.map((version) => (
                            <li key={version.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span>
                                {copy.versionRow
                                  .replace("{version}", String(version.version))
                                  .replace("{fileName}", version.fileName)
                                  .replace("{size}", formatSize(version.byteSize))}
                              </span>
                              <button type="button" className="btn small" disabled={busy}
                                onClick={() => download(doc.id, version.version)}>{copy.download}</button>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
