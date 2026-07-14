import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fmt } from "../api";
import { LegacyField } from "../accessibility/legacy-field";
import { LegacyModal } from "../accessibility/legacy-modal";
import { appEnglish } from "../locales/app.en";

type Currency = "USD" | "ZWG";
type ReferenceData = {
  suppliers: Array<{ id: string; name: string; supplierCode: string | null; supplierCurrency: Currency | null }>;
  products: Array<{ id: string; sku: string; name: string; costPrice: string; currency: Currency }>;
  warehouses: Array<{ id: string; name: string; isDefault: boolean }>;
};
type RequisitionLine = {
  id: string; productId: string; warehouseId: string; quantity: string; estimatedUnitCost: string | null;
};
type Requisition = {
  id: string; number: string; purpose: string; neededBy: string | null; currency: Currency;
  status: "SUBMITTED" | "APPROVED" | "REJECTED"; createdBy: string; decisionReason: string | null;
  lines: RequisitionLine[];
};
type RfqLine = {
  id: string; productId: string; warehouseId: string; quantity: string;
};
type RequestForQuote = {
  id: string; number: string; purchaseRequisitionId: string; status: "ISSUED" | "AWARDED";
  responseDueAt: string | null; supplierContactIds: string[]; awardedSupplierContactId: string | null;
  lines: RfqLine[];
};
type PurchaseOrderLine = {
  id: string; productId: string; warehouseId: string; quantity: string; quantityReceived: string;
  unitCost: string; lineTotal: string;
};
type PurchaseOrder = {
  id: string; number: string | null; vendorContactId: string; purchaseRequisitionId: string | null;
  requestForQuoteId: string | null; currency: Currency; rateToBase: string; total: string;
  status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED"; createdBy: string;
  expectedDate: string | null; lines: PurchaseOrderLine[];
  receipts: Array<{ id: string; number: string; receivedAt: string }>;
};
type GoodsReceipt = {
  id: string; number: string; purchaseOrderId: string; receivedAt: string; deliveryNote: string | null;
  lines: Array<{ id: string; productId: string; warehouseId: string; quantityReceived: string }>;
};
type EntryLine = { productId: string; warehouseId: string; quantity: string; unitCost: string };
type Dialog =
  | { kind: "requisition" }
  | { kind: "decision"; requisition: Requisition }
  | { kind: "rfq"; requisition: Requisition }
  | { kind: "award"; rfq: RequestForQuote }
  | { kind: "direct-po" }
  | { kind: "approve-po"; order: PurchaseOrder }
  | { kind: "receipt"; order: PurchaseOrder }
  | null;

const blankLine = (warehouseId = ""): EntryLine => ({ productId: "", warehouseId, quantity: "1", unitCost: "" });
const messageOf = (error: unknown) => error instanceof Error ? error.message : appEnglish.procurement.unexpectedError;
const toUnits = (value: string) => Math.round(Number(value) * 1_000);
const fromUnits = (value: number) => (value / 1_000).toFixed(3).replace(/\.?(?:0+)$/, "");

export function ProcurementWorkspace({ readonly, permissions, currentUserId, baseCurrency }: {
  readonly: boolean; permissions: readonly string[]; currentUserId: string; baseCurrency: Currency;
}) {
  const copy = appEnglish.procurement;
  const [tab, setTab] = useState<"requisitions" | "rfqs" | "orders" | "receipts">("requisitions");
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [rfqs, setRfqs] = useState<RequestForQuote[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const canRequest = !readonly && permissions.includes("procurement.request");
  const canWrite = !readonly && permissions.includes("procurement.write");
  const canApprove = !readonly && permissions.includes("procurement.approve");
  const canReceive = !readonly && permissions.includes("procurement.receive");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextReference, nextRequisitions, nextRfqs, nextOrders, nextReceipts] = await Promise.all([
        api("/procurement/reference-data") as Promise<ReferenceData>,
        api("/purchase-requisitions") as Promise<Requisition[]>,
        api("/request-for-quotes") as Promise<RequestForQuote[]>,
        api("/purchase-orders") as Promise<PurchaseOrder[]>,
        api("/goods-receipts") as Promise<GoodsReceipt[]>,
      ]);
      setReference(nextReference); setRequisitions(nextRequisitions); setRfqs(nextRfqs);
      setOrders(nextOrders); setReceipts(nextReceipts);
    } catch (loadError) { setError(messageOf(loadError)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const supplierName = (id: string) => reference?.suppliers.find((row) => row.id === id)?.name ?? copy.unknownSupplier;
  const productName = (id: string) => {
    const product = reference?.products.find((row) => row.id === id);
    return product ? `${product.sku} — ${product.name}` : copy.unknownProduct;
  };
  const warehouseName = (id: string) => reference?.warehouses.find((row) => row.id === id)?.name ?? copy.unknownWarehouse;
  const finish = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); setDialog(null); await load(); }
    catch (actionError) { setError(messageOf(actionError)); }
    finally { setBusy(false); }
  };

  const tabs = [
    ["requisitions", copy.tabs.requisitions, requisitions.length],
    ["rfqs", copy.tabs.rfqs, rfqs.length],
    ["orders", copy.tabs.orders, orders.length],
    ["receipts", copy.tabs.receipts, receipts.length],
  ] as const;

  return <section className="procurement-workspace">
    <header className="procurement-header">
      <div><h1>{copy.title}</h1><p className="sub">{copy.subtitle}</p></div>
      <div className="procurement-header-actions">
        {canRequest && <button className="btn" onClick={() => setDialog({ kind: "requisition" })}>{copy.newRequisition}</button>}
        {canWrite && <button className="btn ghost" onClick={() => setDialog({ kind: "direct-po" })}>{copy.newDirectPo}</button>}
      </div>
    </header>
    <div className="procurement-control-note" role="note"><strong>{copy.controlTitle}</strong><span>{copy.controlDetail}</span></div>
    <div className="tabs procurement-tabs" role="tablist" aria-label={copy.workspaceSections}>
      {tabs.map(([key, label, count]) => <button key={key} role="tab" aria-selected={tab === key}
        className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}<span>{count}</span></button>)}
    </div>
    {error && <div className="err-text procurement-error" role="alert">{error} <button className="auth-link" onClick={() => void load()}>{copy.retry}</button></div>}
    {loading ? <div className="panel procurement-loading" aria-live="polite">{copy.loading}</div> : <>
      {tab === "requisitions" && <RecordGrid empty={copy.empty.requisitions}>{requisitions.map((row) =>
        <article className="procurement-card" key={row.id}>
          <RecordHeading number={row.number} status={row.status} meta={row.neededBy ? copy.neededBy.replace("{date}", new Date(row.neededBy).toLocaleDateString()) : copy.noNeededBy} />
          <p>{row.purpose}</p><LineSummary lines={row.lines} productName={productName} warehouseName={warehouseName} currency={row.currency} estimated />
          {row.decisionReason && <p className="procurement-reason"><strong>{copy.decisionReason}</strong> {row.decisionReason}</p>}
          <div className="procurement-actions">
            {canApprove && row.status === "SUBMITTED" && row.createdBy !== currentUserId && <button className="btn sm" onClick={() => setDialog({ kind: "decision", requisition: row })}>{copy.review}</button>}
            {canWrite && row.status === "APPROVED" && !rfqs.some((rfq) => rfq.purchaseRequisitionId === row.id) && <button className="btn sm" onClick={() => setDialog({ kind: "rfq", requisition: row })}>{copy.issueRfq}</button>}
          </div>
        </article>)}</RecordGrid>}
      {tab === "rfqs" && <RecordGrid empty={copy.empty.rfqs}>{rfqs.map((row) =>
        <article className="procurement-card" key={row.id}>
          <RecordHeading number={row.number} status={row.status} meta={row.responseDueAt ? copy.responsesDue.replace("{date}", new Date(row.responseDueAt).toLocaleDateString()) : copy.noResponseDue} />
          <p className="sub">{copy.invitedSuppliers.replace("{count}", String(row.supplierContactIds.length))}</p>
          <div className="procurement-supplier-list">{row.supplierContactIds.map((id) => <span className="pill" key={id}>{supplierName(id)}</span>)}</div>
          <LineSummary lines={row.lines} productName={productName} warehouseName={warehouseName} />
          <div className="procurement-actions">{canWrite && row.status === "ISSUED" && <button className="btn sm" onClick={() => setDialog({ kind: "award", rfq: row })}>{copy.recordAward}</button>}</div>
        </article>)}</RecordGrid>}
      {tab === "orders" && <RecordGrid empty={copy.empty.orders}>{orders.map((row) =>
        <article className="procurement-card" key={row.id}>
          <RecordHeading number={row.number ?? copy.draftNumber} status={row.status} meta={supplierName(row.vendorContactId)} />
          <div className="procurement-total"><span>{copy.orderTotal}</span><strong>{fmt(row.total, row.currency)}</strong></div>
          <LineSummary lines={row.lines} productName={productName} warehouseName={warehouseName} currency={row.currency} received />
          <div className="procurement-actions">
            {canApprove && row.status === "DRAFT" && row.createdBy !== currentUserId && <button className="btn sm" onClick={() => setDialog({ kind: "approve-po", order: row })}>{copy.approvePo}</button>}
            {canReceive && row.status === "ORDERED" && <button className="btn sm" onClick={() => setDialog({ kind: "receipt", order: row })}>{copy.receiveGoods}</button>}
          </div>
        </article>)}</RecordGrid>}
      {tab === "receipts" && <RecordGrid empty={copy.empty.receipts}>{receipts.map((row) => {
        const order = orders.find((candidate) => candidate.id === row.purchaseOrderId);
        return <article className="procurement-card" key={row.id}>
          <RecordHeading number={row.number} status={copy.posted} meta={copy.receivedOn.replace("{date}", new Date(row.receivedAt).toLocaleDateString())} />
          <p className="sub">{copy.forPurchaseOrder.replace("{number}", order?.number ?? copy.draftNumber)}</p>
          {row.deliveryNote && <p>{copy.deliveryNoteValue.replace("{reference}", row.deliveryNote)}</p>}
          <LineSummary lines={row.lines} productName={productName} warehouseName={warehouseName} receivedOnly />
        </article>;
      })}</RecordGrid>}
    </>}
    {dialog?.kind === "requisition" && reference && <RequisitionDialog reference={reference} baseCurrency={baseCurrency} busy={busy} error={error}
      onClose={() => setDialog(null)} onSave={(body) => finish(() => api("/purchase-requisitions", { method: "POST", body }))} />}
    {dialog?.kind === "decision" && <DecisionDialog requisition={dialog.requisition} busy={busy} error={error} onClose={() => setDialog(null)}
      onSave={(body) => finish(() => api(`/purchase-requisitions/${dialog.requisition.id}/decision`, { method: "POST", body }))} />}
    {dialog?.kind === "rfq" && reference && <RfqDialog requisition={dialog.requisition} reference={reference} busy={busy} error={error}
      onClose={() => setDialog(null)} onSave={(body) => finish(() => api("/request-for-quotes", { method: "POST", body }))} />}
    {dialog?.kind === "award" && reference && <AwardDialog rfq={dialog.rfq} reference={reference} baseCurrency={baseCurrency} busy={busy} error={error}
      onClose={() => setDialog(null)} onSave={(body) => finish(() => api(`/request-for-quotes/${dialog.rfq.id}/award`, { method: "POST", body }))} />}
    {dialog?.kind === "direct-po" && reference && <DirectPoDialog reference={reference} baseCurrency={baseCurrency} busy={busy} error={error}
      onClose={() => setDialog(null)} onSave={(body) => finish(() => api("/purchase-orders", { method: "POST", body }))} />}
    {dialog?.kind === "approve-po" && <PoApprovalDialog order={dialog.order} busy={busy} error={error} onClose={() => setDialog(null)}
      onSave={(body) => finish(() => api(`/purchase-orders/${dialog.order.id}/approve`, { method: "POST", body }))} />}
    {dialog?.kind === "receipt" && <ReceiptDialog order={dialog.order} productName={productName} busy={busy} error={error} onClose={() => setDialog(null)}
      onSave={(body) => finish(() => api(`/purchase-orders/${dialog.order.id}/receipts`, { method: "POST", body,
        headers: { "Idempotency-Key": crypto.randomUUID() } }))} />}
  </section>;
}

function RecordGrid({ empty, children }: { empty: string; children: React.ReactNode }) {
  return <div className="procurement-grid">{children || <div className="panel procurement-empty">{empty}</div>}</div>;
}
function RecordHeading({ number, status, meta }: { number: string; status: string; meta: string }) {
  return <header className="procurement-card-heading"><div><h2>{number}</h2><span className="sub">{meta}</span></div><span className={`pill ${status}`}>{status.replaceAll("_", " ")}</span></header>;
}
function LineSummary({ lines, productName, warehouseName, currency, estimated, received, receivedOnly }: {
  lines: Array<{ id: string; productId: string; warehouseId: string; quantity?: string; quantityReceived?: string; estimatedUnitCost?: string | null; unitCost?: string }>;
  productName: (id: string) => string; warehouseName: (id: string) => string; currency?: Currency;
  estimated?: boolean; received?: boolean; receivedOnly?: boolean;
}) {
  const copy = appEnglish.procurement;
  return <ul className="procurement-lines">{lines.map((line) => <li key={line.id}>
    <span><strong>{productName(line.productId)}</strong><small>{warehouseName(line.warehouseId)}</small></span>
    <span className="procurement-quantity">{receivedOnly ? line.quantityReceived : line.quantity} {copy.units}
      {received && <small>{copy.receivedQuantity.replace("{quantity}", line.quantityReceived ?? "0")}</small>}
      {estimated && line.estimatedUnitCost && currency && <small>{copy.estimate.replace("{amount}", fmt(line.estimatedUnitCost, currency))}</small>}
    </span>
  </li>)}</ul>;
}

function EntryLines({ lines, setLines, reference, costLabel }: {
  lines: EntryLine[]; setLines: (lines: EntryLine[]) => void; reference: ReferenceData; costLabel: string;
}) {
  const copy = appEnglish.procurement;
  const update = (index: number, field: keyof EntryLine, value: string) => {
    const next = lines.map((line, position) => position === index ? { ...line, [field]: value } : line);
    if (field === "productId") {
      const product = reference.products.find((row) => row.id === value);
      if (product && !next[index].unitCost) next[index].unitCost = product.costPrice;
    }
    setLines(next);
  };
  return <div className="procurement-line-editor">{lines.map((line, index) => <fieldset key={index}>
    <legend>{copy.line.replace("{number}", String(index + 1))}</legend>
    <div className="procurement-line-fields">
      <LegacyField label={copy.product}><select value={line.productId} onChange={(event) => update(index, "productId", event.target.value)} required><option value="">{copy.selectProduct}</option>{reference.products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}</select></LegacyField>
      <LegacyField label={copy.warehouse}><select value={line.warehouseId} onChange={(event) => update(index, "warehouseId", event.target.value)} required><option value="">{copy.selectWarehouse}</option>{reference.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></LegacyField>
      <LegacyField label={copy.quantity}><input type="number" min="0.001" step="0.001" inputMode="decimal" value={line.quantity} onChange={(event) => update(index, "quantity", event.target.value)} /></LegacyField>
      <LegacyField label={costLabel}><input type="number" min="0" step="0.01" inputMode="decimal" value={line.unitCost} onChange={(event) => update(index, "unitCost", event.target.value)} /></LegacyField>
    </div>
    {lines.length > 1 && <button type="button" className="auth-link" onClick={() => setLines(lines.filter((_, position) => position !== index))}>{copy.removeLine}</button>}
  </fieldset>)}<button type="button" className="btn ghost sm" onClick={() => setLines([...lines, blankLine(reference.warehouses.find((row) => row.isDefault)?.id)])}>{copy.addLine}</button></div>;
}

function DialogActions({ busy, valid, onClose, save }: { busy: boolean; valid: boolean; onClose: () => void; save: string }) {
  const copy = appEnglish.procurement;
  return <div className="row end modal-actions"><button className="btn ghost" onClick={onClose}>{copy.cancel}</button><button className="btn" disabled={busy || !valid} type="submit">{busy ? copy.saving : save}</button></div>;
}
function DialogError({ error }: { error: string }) { return error ? <div className="err-text" role="alert">{error}</div> : null; }

function RequisitionDialog({ reference, baseCurrency, busy, error, onClose, onSave }: {
  reference: ReferenceData; baseCurrency: Currency; busy: boolean; error: string; onClose: () => void; onSave: (body: unknown) => void;
}) {
  const copy = appEnglish.procurement;
  const defaultWarehouse = reference.warehouses.find((row) => row.isDefault)?.id ?? reference.warehouses[0]?.id ?? "";
  const [purpose, setPurpose] = useState(""); const [neededBy, setNeededBy] = useState(""); const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [lines, setLines] = useState<EntryLine[]>([blankLine(defaultWarehouse)]);
  const valid = purpose.trim().length > 0 && lines.every((line) => line.productId && line.warehouseId && Number(line.quantity) > 0 && (!line.unitCost || Number(line.unitCost) >= 0));
  return <LegacyModal labelledBy="new-requisition-title" onClose={onClose} className="procurement-modal"><form onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ purpose, neededBy: neededBy || null, currency, lines: lines.map(({ productId, warehouseId, quantity, unitCost }) => ({ productId, warehouseId, quantity, estimatedUnitCost: unitCost || null })) }); }}>
    <h2 id="new-requisition-title" tabIndex={-1} data-modal-initial-focus>{copy.newRequisitionTitle}</h2><p className="sub">{copy.requisitionHelp}</p>
    <div className="grid3"><LegacyField label={copy.purpose}><input value={purpose} maxLength={500} onChange={(event) => setPurpose(event.target.value)} /></LegacyField><LegacyField label={copy.neededByDate}><input type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} /></LegacyField><LegacyField label={copy.currency}><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option>USD</option><option>ZWG</option></select></LegacyField></div>
    <EntryLines lines={lines} setLines={setLines} reference={reference} costLabel={copy.estimatedUnitCost} /><DialogError error={error} /><DialogActions busy={busy} valid={valid} onClose={onClose} save={copy.submitRequisition} />
  </form></LegacyModal>;
}

function DecisionDialog({ requisition, busy, error, onClose, onSave }: { requisition: Requisition; busy: boolean; error: string; onClose: () => void; onSave: (body: unknown) => void }) {
  const copy = appEnglish.procurement; const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE"); const [reason, setReason] = useState("");
  return <LegacyModal labelledBy="requisition-decision-title" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onSave({ decision, reason }); }}><h2 id="requisition-decision-title" tabIndex={-1} data-modal-initial-focus>{copy.reviewTitle.replace("{number}", requisition.number)}</h2><p>{requisition.purpose}</p><LegacyField label={copy.decision}><select value={decision} onChange={(event) => setDecision(event.target.value as "APPROVE" | "REJECT")}><option value="APPROVE">{copy.approve}</option><option value="REJECT">{copy.reject}</option></select></LegacyField><LegacyField label={copy.reason} hint={copy.independentApprovalHelp}><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></LegacyField><DialogError error={error} /><DialogActions busy={busy} valid={Boolean(reason.trim())} onClose={onClose} save={copy.recordDecision} /></form></LegacyModal>;
}

function RfqDialog({ requisition, reference, busy, error, onClose, onSave }: { requisition: Requisition; reference: ReferenceData; busy: boolean; error: string; onClose: () => void; onSave: (body: unknown) => void }) {
  const copy = appEnglish.procurement; const [selected, setSelected] = useState<string[]>([]); const [due, setDue] = useState("");
  return <LegacyModal labelledBy="issue-rfq-title" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (selected.length) onSave({ purchaseRequisitionId: requisition.id, supplierContactIds: selected, responseDueAt: due || null }); }}><h2 id="issue-rfq-title" tabIndex={-1} data-modal-initial-focus>{copy.issueRfqTitle.replace("{number}", requisition.number)}</h2><LegacyField label={copy.responseDueDate}><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></LegacyField><fieldset className="supplier-choice"><legend>{copy.inviteSuppliers}</legend>{reference.suppliers.map((supplier) => <label key={supplier.id}><input type="checkbox" checked={selected.includes(supplier.id)} onChange={() => setSelected(selected.includes(supplier.id) ? selected.filter((id) => id !== supplier.id) : [...selected, supplier.id])} /><span>{supplier.name}{supplier.supplierCode ? ` · ${supplier.supplierCode}` : ""}</span></label>)}</fieldset>{reference.suppliers.length === 0 && <p className="err-text">{copy.noSuppliers}</p>}<DialogError error={error} /><DialogActions busy={busy} valid={selected.length > 0} onClose={onClose} save={copy.issueRfq} /></form></LegacyModal>;
}

function AwardDialog({ rfq, reference, baseCurrency, busy, error, onClose, onSave }: { rfq: RequestForQuote; reference: ReferenceData; baseCurrency: Currency; busy: boolean; error: string; onClose: () => void; onSave: (body: unknown) => void }) {
  const copy = appEnglish.procurement; const invited = reference.suppliers.filter((row) => rfq.supplierContactIds.includes(row.id));
  const [supplier, setSupplier] = useState(invited[0]?.id ?? ""); const [currency, setCurrency] = useState<Currency>(invited[0]?.supplierCurrency ?? baseCurrency); const [rate, setRate] = useState("1"); const [expectedDate, setExpectedDate] = useState("");
  const [costs, setCosts] = useState<Record<string, string>>(() => Object.fromEntries(rfq.lines.map((line) => [line.id, ""])));
  const valid = Boolean(supplier) && Number(rate) > 0 && rfq.lines.every((line) => Number(costs[line.id]) > 0);
  return <LegacyModal labelledBy="award-rfq-title" onClose={onClose} className="procurement-modal"><form onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ supplierContactId: supplier, currency, rateToBase: rate, expectedDate: expectedDate || null, lines: rfq.lines.map((line) => ({ requestForQuoteLineItemId: line.id, unitCost: costs[line.id] })) }); }}><h2 id="award-rfq-title" tabIndex={-1} data-modal-initial-focus>{copy.awardTitle.replace("{number}", rfq.number)}</h2><p className="sub">{copy.awardHelp}</p><div className="grid3"><LegacyField label={copy.selectedSupplier}><select value={supplier} onChange={(event) => setSupplier(event.target.value)}>{invited.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></LegacyField><LegacyField label={copy.currency}><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option>USD</option><option>ZWG</option></select></LegacyField><LegacyField label={copy.rateToBase}><input type="number" min="0.000001" step="0.000001" value={rate} onChange={(event) => setRate(event.target.value)} /></LegacyField><LegacyField label={copy.expectedDate}><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></LegacyField></div><div className="procurement-award-lines">{rfq.lines.map((line) => <LegacyField key={line.id} label={`${productLabel(reference, line.productId)} · ${line.quantity} ${copy.units}`}><input type="number" min="0.01" step="0.01" inputMode="decimal" value={costs[line.id]} onChange={(event) => setCosts({ ...costs, [line.id]: event.target.value })} /></LegacyField>)}</div><DialogError error={error} /><DialogActions busy={busy} valid={valid} onClose={onClose} save={copy.createDraftPo} /></form></LegacyModal>;
}

function productLabel(reference: ReferenceData, id: string) { const product = reference.products.find((row) => row.id === id); return product ? `${product.sku} — ${product.name}` : appEnglish.procurement.unknownProduct; }

function DirectPoDialog({ reference, baseCurrency, busy, error, onClose, onSave }: { reference: ReferenceData; baseCurrency: Currency; busy: boolean; error: string; onClose: () => void; onSave: (body: unknown) => void }) {
  const copy = appEnglish.procurement; const defaultWarehouse = reference.warehouses.find((row) => row.isDefault)?.id ?? reference.warehouses[0]?.id ?? "";
  const [supplier, setSupplier] = useState(""); const [currency, setCurrency] = useState<Currency>(baseCurrency); const [rate, setRate] = useState("1"); const [expectedDate, setExpectedDate] = useState(""); const [lines, setLines] = useState<EntryLine[]>([blankLine(defaultWarehouse)]);
  const valid = Boolean(supplier) && Number(rate) > 0 && lines.every((line) => line.productId && line.warehouseId && Number(line.quantity) > 0 && Number(line.unitCost) > 0);
  return <LegacyModal labelledBy="new-direct-po-title" onClose={onClose} className="procurement-modal"><form onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ vendorContactId: supplier, currency, rateToBase: rate, expectedDate: expectedDate || null, lines }); }}><h2 id="new-direct-po-title" tabIndex={-1} data-modal-initial-focus>{copy.newDirectPoTitle}</h2><p className="sub">{copy.directPoHelp}</p><div className="grid3"><LegacyField label={copy.supplier}><select value={supplier} onChange={(event) => setSupplier(event.target.value)}><option value="">{copy.selectSupplier}</option>{reference.suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></LegacyField><LegacyField label={copy.currency}><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option>USD</option><option>ZWG</option></select></LegacyField><LegacyField label={copy.rateToBase}><input type="number" min="0.000001" step="0.000001" value={rate} onChange={(event) => setRate(event.target.value)} /></LegacyField><LegacyField label={copy.expectedDate}><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></LegacyField></div><EntryLines lines={lines} setLines={setLines} reference={reference} costLabel={copy.unitCost} /><DialogError error={error} /><DialogActions busy={busy} valid={valid} onClose={onClose} save={copy.createDraftPo} /></form></LegacyModal>;
}

function PoApprovalDialog({ order, busy, error, onClose, onSave }: { order: PurchaseOrder; busy: boolean; error: string; onClose: () => void; onSave: (body: unknown) => void }) {
  const copy = appEnglish.procurement; const [reason, setReason] = useState("");
  return <LegacyModal labelledBy="approve-po-title" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onSave({ reason }); }}><h2 id="approve-po-title" tabIndex={-1} data-modal-initial-focus>{copy.approvePoTitle}</h2><p>{copy.approvePoSummary.replace("{amount}", fmt(order.total, order.currency))}</p><LegacyField label={copy.reason} hint={copy.poApprovalHelp}><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></LegacyField><DialogError error={error} /><DialogActions busy={busy} valid={Boolean(reason.trim())} onClose={onClose} save={copy.approvePo} /></form></LegacyModal>;
}

function ReceiptDialog({ order, productName, busy, error, onClose, onSave }: { order: PurchaseOrder; productName: (id: string) => string; busy: boolean; error: string; onClose: () => void; onSave: (body: unknown) => void }) {
  const copy = appEnglish.procurement; const outstanding = useMemo(() => order.lines.map((line) => ({ line, maximum: Math.max(0, toUnits(line.quantity) - toUnits(line.quantityReceived)), quantity: fromUnits(Math.max(0, toUnits(line.quantity) - toUnits(line.quantityReceived))) })).filter((row) => row.maximum > 0), [order]);
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(outstanding.map((row) => [row.line.id, row.quantity]))); const [deliveryNote, setDeliveryNote] = useState(""); const [note, setNote] = useState("");
  const selected = outstanding.filter((row) => Number(quantities[row.line.id]) > 0 && toUnits(quantities[row.line.id]) <= row.maximum);
  return <LegacyModal labelledBy="receive-po-title" onClose={onClose} className="procurement-modal"><form onSubmit={(event) => { event.preventDefault(); if (selected.length) onSave({ deliveryNote: deliveryNote || null, note: note || null, lines: selected.map((row) => ({ purchaseOrderLineItemId: row.line.id, quantity: quantities[row.line.id] })) }); }}><h2 id="receive-po-title" tabIndex={-1} data-modal-initial-focus>{copy.receiveTitle.replace("{number}", order.number ?? copy.draftNumber)}</h2><p className="sub">{copy.receiptHelp}</p><div className="grid2"><LegacyField label={copy.deliveryNote}><input value={deliveryNote} maxLength={200} onChange={(event) => setDeliveryNote(event.target.value)} /></LegacyField><LegacyField label={copy.receiptNote}><input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} /></LegacyField></div><div className="procurement-receipt-lines">{outstanding.map((row) => <LegacyField key={row.line.id} label={productName(row.line.productId)} hint={copy.outstanding.replace("{quantity}", fromUnits(row.maximum))}><input type="number" min="0" max={fromUnits(row.maximum)} step="0.001" inputMode="decimal" value={quantities[row.line.id]} onChange={(event) => setQuantities({ ...quantities, [row.line.id]: event.target.value })} /></LegacyField>)}</div><DialogError error={error} /><DialogActions busy={busy} valid={selected.length > 0} onClose={onClose} save={copy.postReceipt} /></form></LegacyModal>;
}
