import { Children, useCallback, useEffect, useMemo, useState } from "react";
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
type SupplierBillLine = {
  id: string; purchaseOrderLineItemId: string; productId: string; quantity: string;
  unitPrice: string; taxTreatment: "standard" | "zero-rated" | "exempt";
  taxRate: string; netAmount: string; taxAmount: string; lineTotal: string;
};
type SupplierBill = {
  id: string; purchaseOrderId: string; vendorContactId: string; number: string | null;
  supplierInvoiceNumber: string; status: "DRAFT" | "POSTED"; billDate: string;
  taxDate: string; dueDate: string; currency: Currency; rateToBase: string;
  subtotal: string; taxTotal: string; total: string; matchStatus: "PENDING" | "MATCHED" | "BLOCKED";
  lines: SupplierBillLine[];
};
type MatchReasonCode = "SUPPLIER_MISMATCH" | "CURRENCY_MISMATCH" | "LINE_NOT_ON_PO" | "PRICE_MISMATCH"
  | "QUANTITY_EXCEEDS_RECEIVED" | "QUANTITY_EXCEEDS_ORDERED" | "DUPLICATE_SUPPLIER_INVOICE" | "NO_RECEIPT_EVIDENCE";
type MatchResult = {
  status: "MATCHED" | "BLOCKED";
  reasons: Array<{ code: MatchReasonCode; message: string; purchaseOrderLineItemId?: string }>;
  evaluatedAt: string;
};
type SupplierAnalyticsReport = {
  generatedAt: string;
  baseCurrency: Currency;
  summary: {
    supplierCount: number; baseSpend: string; onTimeOrders: number; eligibleDeliveryOrders: number;
    onTimeRateBasisPoints: number | null; openGrniBase: string; sourceScheduledApBase: string;
    currentBlockedDrafts: number;
  };
  spend: { baseGrossTiesToApSource: boolean; rows: Array<{
    supplierId: string; supplierName: string; currency: Currency; postedBillCount: number;
    originalGross: string; baseGross: string;
  }> };
  delivery: { rows: Array<{
    supplierId: string; supplierName: string; completedOrders: number; eligibleOrders: number;
    onTimeOrders: number; lateOrders: number; missingExpectedDate: number; onTimeRateBasisPoints: number | null;
  }> };
  priceVariance: { postedPolicy: "STRICT_EXACT_MATCH"; postedBaseVariance: string; rows: Array<{
    billId: string; supplierName: string; supplierInvoiceNumber: string; currency: Currency;
    quantity: string; approvedUnitPrice: string; billUnitPrice: string; originalVariance: string;
    baseVarianceAtPoRate: string;
  }> };
  matchExceptions: {
    historicalAttemptCoverage: "NOT_RECORDED_ROLLED_BACK_ATTEMPTS";
    draftsEvaluated: number; blockedDrafts: number;
    reasonCounts: Array<{ code: MatchReasonCode; count: number }>;
  };
  exposure: {
    grni: {
      rows: Array<{ supplierId: string; supplierName: string; currency: Currency; openOriginal: string; openBase: string }>;
      selectedScheduleBase: string; tenantControlBase: string; tenantUnallocatedBase: string; tenantTies: boolean;
    };
    accountsPayable: {
      rows: Array<{ supplierId: string; supplierName: string; currency: Currency; postedBillCount: number; originalGross: string; baseGross: string }>;
      completeOpenItemSubledger: false; selectedScheduleBase: string; tenantControlBase: string;
      tenantUnallocatedBase: string; tenantTies: boolean;
    };
  };
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
  | { kind: "bill"; bill?: SupplierBill }
  | null;

const blankLine = (warehouseId = ""): EntryLine => ({ productId: "", warehouseId, quantity: "1", unitCost: "" });
const messageOf = (error: unknown) => error instanceof Error ? error.message : appEnglish.procurement.unexpectedError;
const toUnits = (value: string) => Math.round(Number(value) * 1_000);
const fromUnits = (value: number) => (value / 1_000).toFixed(3).replace(/\.?(?:0+)$/, "");

export function ProcurementWorkspace({ readonly, permissions, currentUserId, baseCurrency }: {
  readonly: boolean; permissions: readonly string[]; currentUserId: string; baseCurrency: Currency;
}) {
  const copy = appEnglish.procurement;
  const [tab, setTab] = useState<"requisitions" | "rfqs" | "orders" | "receipts" | "bills" | "analytics">("requisitions");
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [rfqs, setRfqs] = useState<RequestForQuote[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [matches, setMatches] = useState<Record<string, MatchResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const canRequest = !readonly && permissions.includes("procurement.request");
  const canWrite = !readonly && permissions.includes("procurement.write");
  const canApprove = !readonly && permissions.includes("procurement.approve");
  const canReceive = !readonly && permissions.includes("procurement.receive");
  const canPostBills = !readonly && permissions.includes("accounting.post");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextReference, nextRequisitions, nextRfqs, nextOrders, nextReceipts, nextBills] = await Promise.all([
        api("/procurement/reference-data") as Promise<ReferenceData>,
        api("/purchase-requisitions") as Promise<Requisition[]>,
        api("/request-for-quotes") as Promise<RequestForQuote[]>,
        api("/purchase-orders") as Promise<PurchaseOrder[]>,
        api("/goods-receipts") as Promise<GoodsReceipt[]>,
        api("/supplier-bills") as Promise<SupplierBill[]>,
      ]);
      setReference(nextReference); setRequisitions(nextRequisitions); setRfqs(nextRfqs);
      setOrders(nextOrders); setReceipts(nextReceipts); setBills(nextBills);
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
  const inspectMatch = async (billId: string) => {
    setBusy(true); setError("");
    try {
      const result = await api(`/supplier-bills/${billId}/match`) as MatchResult;
      setMatches((current) => ({ ...current, [billId]: result }));
    } catch (matchError) { setError(messageOf(matchError)); }
    finally { setBusy(false); }
  };

  const tabs = [
    ["requisitions", copy.tabs.requisitions, requisitions.length],
    ["rfqs", copy.tabs.rfqs, rfqs.length],
    ["orders", copy.tabs.orders, orders.length],
    ["receipts", copy.tabs.receipts, receipts.length],
    ["bills", copy.tabs.bills, bills.length],
    ["analytics", copy.tabs.analytics, null],
  ] as const;

  return <section className="procurement-workspace">
    <header className="procurement-header">
      <div><h1>{copy.title}</h1><p className="sub">{copy.subtitle}</p></div>
      <div className="procurement-header-actions">
        {canRequest && <button className="btn" onClick={() => setDialog({ kind: "requisition" })}>{copy.newRequisition}</button>}
        {canWrite && <button className="btn ghost" onClick={() => setDialog({ kind: "direct-po" })}>{copy.newDirectPo}</button>}
        {canPostBills && <button className="btn ghost" onClick={() => setDialog({ kind: "bill" })}>{copy.newSupplierBill}</button>}
      </div>
    </header>
    <div className="procurement-control-note" role="note"><strong>{copy.controlTitle}</strong><span>{copy.controlDetail}</span></div>
    <div className="tabs procurement-tabs" role="tablist" aria-label={copy.workspaceSections}>
      {tabs.map(([key, label, count]) => <button key={key} role="tab" aria-selected={tab === key}
        className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}{count !== null && <span>{count}</span>}</button>)}
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
      {tab === "bills" && <RecordGrid empty={copy.empty.bills}>{bills.map((row) => {
        const match = matches[row.id];
        const order = orders.find((candidate) => candidate.id === row.purchaseOrderId);
        return <article className="procurement-card" key={row.id}>
          <RecordHeading number={row.number ?? copy.draftBillNumber} status={row.status} meta={supplierName(row.vendorContactId)} />
          <dl className="procurement-bill-facts">
            <div><dt>{copy.supplierInvoice}</dt><dd>{row.supplierInvoiceNumber}</dd></div>
            <div><dt>{copy.purchaseOrder}</dt><dd>{order?.number ?? copy.unknownPurchaseOrder}</dd></div>
            <div><dt>{copy.dueDate}</dt><dd>{new Date(row.dueDate).toLocaleDateString()}</dd></div>
          </dl>
          <div className="procurement-total"><span>{copy.billTotal}</span><strong>{fmt(row.total, row.currency)}</strong></div>
          <ul className="procurement-lines">{row.lines.map((line) => <li key={line.id}>
            <span><strong>{productName(line.productId)}</strong><small>{copy.billTax.replace("{rate}", line.taxRate)}</small></span>
            <span className="procurement-quantity">{line.quantity} {copy.units}<small>{fmt(line.lineTotal, row.currency)}</small></span>
          </li>)}</ul>
          {match && <MatchEvidence match={match} />}
          <div className="procurement-actions">
            <button className="btn ghost sm" disabled={busy} onClick={() => void inspectMatch(row.id)}>{copy.checkMatch}</button>
            {canPostBills && row.status === "DRAFT" && <button className="btn ghost sm" onClick={() => setDialog({ kind: "bill", bill: row })}>{copy.editDraftBill}</button>}
            {canPostBills && row.status === "DRAFT" && <button className="btn sm" disabled={busy} onClick={() => {
              if (window.confirm(copy.postBillConfirmation.replace("{reference}", row.supplierInvoiceNumber))) {
                void finish(() => api(`/supplier-bills/${row.id}/post`, { method: "POST", body: { confirmed: true }, headers: { "Idempotency-Key": crypto.randomUUID() } }));
              }
            }}>{copy.postBill}</button>}
          </div>
        </article>;
      })}</RecordGrid>}
      {tab === "analytics" && reference && <SupplierAnalyticsPanel suppliers={reference.suppliers} />}
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
    {dialog?.kind === "bill" && reference && <SupplierBillDialog bill={dialog.bill} orders={orders} reference={reference}
      busy={busy} error={error} onClose={() => setDialog(null)} onSave={(body) => finish(() => api(
        dialog.bill ? `/supplier-bills/${dialog.bill.id}` : "/supplier-bills",
        { method: dialog.bill ? "PUT" : "POST", body },
      ))} />}
  </section>;
}

function SupplierAnalyticsPanel({ suppliers }: { suppliers: ReferenceData["suppliers"] }) {
  const copy = appEnglish.procurement.analytics;
  const currentDate = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${currentDate.slice(0, 7)}-01`);
  const [to, setTo] = useState(currentDate);
  const [asAt, setAsAt] = useState(currentDate);
  const [supplierId, setSupplierId] = useState("");
  const [report, setReport] = useState<SupplierAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (period: { from: string; to: string; asAt: string; supplierId: string }) => {
    setLoading(true); setError("");
    const query = new URLSearchParams({ from: period.from, to: period.to, asAt: period.asAt });
    if (period.supplierId) query.set("supplierId", period.supplierId);
    try {
      setReport(await api(`/reports/supplier-performance?${query.toString()}`) as SupplierAnalyticsReport);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.loadError);
    } finally { setLoading(false); }
  }, [copy.loadError]);

  useEffect(() => {
    void loadReport({ from: `${currentDate.slice(0, 7)}-01`, to: currentDate, asAt: currentDate, supplierId: "" });
  }, [currentDate, loadReport]);

  const percent = (basisPoints: number | null) => basisPoints === null
    ? copy.notAvailable : `${(basisPoints / 100).toFixed(1)}%`;
  const noRows = report && report.spend.rows.length === 0 && report.delivery.rows.length === 0
    && report.priceVariance.rows.length === 0 && report.exposure.grni.rows.length === 0
    && report.exposure.accountsPayable.rows.length === 0;

  return <section className="supplier-analytics" aria-labelledby="supplier-analytics-title">
    <header className="supplier-analytics-heading">
      <div><h2 id="supplier-analytics-title">{copy.title}</h2><p className="sub">{copy.help}</p></div>
      {report && <span className="sub">{copy.generated.replace("{date}", new Date(report.generatedAt).toLocaleString())}</span>}
    </header>
    <form className="supplier-analytics-filters panel" onSubmit={(event) => {
      event.preventDefault(); void loadReport({ from, to, asAt, supplierId });
    }}>
      <LegacyField label={copy.from}><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></LegacyField>
      <LegacyField label={copy.to}><input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></LegacyField>
      <LegacyField label={copy.asAt}><input type="date" value={asAt} min={to} onChange={(event) => setAsAt(event.target.value)} required /></LegacyField>
      <LegacyField label={copy.supplier}><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
        <option value="">{copy.allSuppliers}</option>
        {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
      </select></LegacyField>
      <button className="btn" type="submit" disabled={loading}>{loading ? copy.refreshing : copy.refresh}</button>
    </form>
    {error && <div className="err-text procurement-error" role="alert">{error} <button className="auth-link" onClick={() => void loadReport({ from, to, asAt, supplierId })}>{copy.retry}</button></div>}
    {loading && !report ? <div className="panel procurement-loading" role="status">{copy.loading}</div> : report && <>
      <div className="supplier-analytics-metrics" aria-label={copy.summaryLabel}>
        <AnalyticsMetric label={copy.baseSpend} value={fmt(report.summary.baseSpend, report.baseCurrency)} detail={copy.postedBillsBasis} />
        <AnalyticsMetric label={copy.onTimeRate} value={percent(report.summary.onTimeRateBasisPoints)} detail={copy.onTimeDetail.replace("{onTime}", String(report.summary.onTimeOrders)).replace("{eligible}", String(report.summary.eligibleDeliveryOrders))} />
        <AnalyticsMetric label={copy.openGrni} value={fmt(report.summary.openGrniBase, report.baseCurrency)} detail={copy.asAtDetail.replace("{date}", asAt)} />
        <AnalyticsMetric label={copy.apSchedule} value={fmt(report.summary.sourceScheduledApBase, report.baseCurrency)} detail={copy.incompleteAp} />
        <AnalyticsMetric label={copy.blockedDrafts} value={String(report.summary.currentBlockedDrafts)} detail={copy.currentDraftBasis} />
      </div>
      {noRows && <div className="panel procurement-empty">{copy.empty}</div>}
      <AnalyticsSection title={copy.spendTitle} help={copy.spendHelp}>
        <AnalyticsTable label={copy.spendTableLabel} headers={[copy.supplierColumn, copy.billsColumn, copy.originalGross, copy.baseGross]} empty={copy.noSpend}>
          {report.spend.rows.map((row) => <tr key={`${row.supplierId}-${row.currency}`}><td>{row.supplierName}</td><td className="num">{row.postedBillCount}</td><td className="num">{fmt(row.originalGross, row.currency)}</td><td className="num">{fmt(row.baseGross, report.baseCurrency)}</td></tr>)}
        </AnalyticsTable>
        <ReconciliationStatus ties={report.spend.baseGrossTiesToApSource} success={copy.spendTies} warning={copy.spendDifference} />
      </AnalyticsSection>
      <AnalyticsSection title={copy.deliveryTitle} help={copy.deliveryHelp}>
        <AnalyticsTable label={copy.deliveryTableLabel} headers={[copy.supplierColumn, copy.completedColumn, copy.onTimeColumn, copy.lateColumn, copy.rateColumn]} empty={copy.noDelivery}>
          {report.delivery.rows.map((row) => <tr key={row.supplierId}><td>{row.supplierName}</td><td className="num">{row.completedOrders}</td><td className="num">{row.onTimeOrders}</td><td className="num">{row.lateOrders}</td><td className="num">{percent(row.onTimeRateBasisPoints)}</td></tr>)}
        </AnalyticsTable>
      </AnalyticsSection>
      <AnalyticsSection title={copy.exceptionsTitle} help={copy.exceptionsHelp}>
        <div className="supplier-analytics-exceptions">
          <div><h4>{copy.blockReasons}</h4>{report.matchExceptions.reasonCounts.length > 0
            ? <ul>{report.matchExceptions.reasonCounts.map((row) => <li key={row.code}><strong>{row.count}</strong><span>{appEnglish.procurement.matchReasons[row.code]}</span></li>)}</ul>
            : <p className="sub">{copy.noBlocks}</p>}</div>
          <div><h4>{copy.priceVariance}</h4>{report.priceVariance.rows.length > 0
            ? <ul>{report.priceVariance.rows.map((row) => <li key={`${row.billId}-${row.supplierInvoiceNumber}`}><strong>{row.supplierName}</strong><span>{copy.varianceDetail.replace("{reference}", row.supplierInvoiceNumber).replace("{amount}", fmt(row.originalVariance, row.currency))}</span></li>)}</ul>
            : <p className="sub">{copy.noVariance}</p>}</div>
        </div>
        <p className="supplier-analytics-disclosure" role="note">{copy.attemptDisclosure}</p>
      </AnalyticsSection>
      <AnalyticsSection title={copy.exposureTitle} help={copy.exposureHelp}>
        <div className="supplier-analytics-exposure-grid">
          <div><h4>{copy.grniTitle}</h4><AnalyticsTable label={copy.grniTableLabel} headers={[copy.supplierColumn, copy.originalOpen, copy.baseOpen]} empty={copy.noGrni}>
            {report.exposure.grni.rows.map((row) => <tr key={`${row.supplierId}-${row.currency}`}><td>{row.supplierName}</td><td className="num">{fmt(row.openOriginal, row.currency)}</td><td className="num">{fmt(row.openBase, report.baseCurrency)}</td></tr>)}
          </AnalyticsTable><ReconciliationStatus ties={report.exposure.grni.tenantTies} success={copy.grniTies} warning={copy.controlDifference.replace("{amount}", fmt(report.exposure.grni.tenantUnallocatedBase, report.baseCurrency))} /></div>
          <div><h4>{copy.apTitle}</h4><AnalyticsTable label={copy.apTableLabel} headers={[copy.supplierColumn, copy.originalGross, copy.baseGross]} empty={copy.noAp}>
            {report.exposure.accountsPayable.rows.map((row) => <tr key={`${row.supplierId}-${row.currency}`}><td>{row.supplierName}</td><td className="num">{fmt(row.originalGross, row.currency)}</td><td className="num">{fmt(row.baseGross, report.baseCurrency)}</td></tr>)}
          </AnalyticsTable><ReconciliationStatus ties={report.exposure.accountsPayable.tenantTies} success={copy.apTies} warning={copy.controlDifference.replace("{amount}", fmt(report.exposure.accountsPayable.tenantUnallocatedBase, report.baseCurrency))} /></div>
        </div>
        <p className="supplier-analytics-disclosure" role="note">{copy.apDisclosure}</p>
      </AnalyticsSection>
    </>}
  </section>;
}

function AnalyticsMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="supplier-analytics-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function AnalyticsSection({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return <section className="supplier-analytics-section panel"><header><h3>{title}</h3><p className="sub">{help}</p></header>{children}</section>;
}

function AnalyticsTable({ label, headers, empty, children }: {
  label: string; headers: string[]; empty: string; children: React.ReactNode;
}) {
  return <div className="table-scroll" role="region" aria-label={label} tabIndex={0}><table><thead><tr>{headers.map((header, index) => <th key={header} className={index > 0 ? "num" : undefined}>{header}</th>)}</tr></thead><tbody>{Children.count(children) > 0 ? children : <tr><td colSpan={headers.length}>{empty}</td></tr>}</tbody></table></div>;
}

function ReconciliationStatus({ ties, success, warning }: { ties: boolean; success: string; warning: string }) {
  return <p className={`supplier-analytics-reconciliation ${ties ? "ties" : "difference"}`}><strong>{ties ? appEnglish.procurement.analytics.reconciled : appEnglish.procurement.analytics.reviewRequired}</strong><span>{ties ? success : warning}</span></p>;
}

function RecordGrid({ empty, children }: { empty: string; children: React.ReactNode }) {
  return <div className="procurement-grid">{Children.count(children) > 0
    ? children : <div className="panel procurement-empty">{empty}</div>}</div>;
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
  return <div className="row end modal-actions"><button type="button" className="btn ghost" onClick={onClose}>{copy.cancel}</button><button className="btn" disabled={busy || !valid} type="submit">{busy ? copy.saving : save}</button></div>;
}
function DialogError({ error }: { error: string }) { return error ? <div className="err-text" role="alert">{error}</div> : null; }

function MatchEvidence({ match }: { match: MatchResult }) {
  const copy = appEnglish.procurement;
  return <section className={`procurement-match ${match.status}`} role="status" aria-live="polite">
    <h3>{match.status === "MATCHED" ? copy.matchPassed : copy.matchBlocked}</h3>
    <p>{match.status === "MATCHED" ? copy.matchPassedHelp : copy.matchBlockedHelp}</p>
    {match.reasons.length > 0 && <ul>{match.reasons.map((reason, index) =>
      <li key={`${reason.code}-${reason.purchaseOrderLineItemId ?? index}`}><strong>{reason.code}</strong> — {copy.matchReasons[reason.code]}</li>)}</ul>}
  </section>;
}

type BillEntryLine = {
  purchaseOrderLineItemId: string;
  selected: boolean;
  quantity: string;
  unitPrice: string;
  taxTreatment: "standard" | "zero-rated" | "exempt";
};

function SupplierBillDialog({ bill, orders, reference, busy, error, onClose, onSave }: {
  bill?: SupplierBill; orders: PurchaseOrder[]; reference: ReferenceData; busy: boolean; error: string;
  onClose: () => void; onSave: (body: unknown) => void;
}) {
  const copy = appEnglish.procurement;
  const eligibleOrders = useMemo(() => orders.filter((row) => row.number && (row.status === "ORDERED" || row.status === "RECEIVED")), [orders]);
  const [purchaseOrderId, setPurchaseOrderId] = useState(bill?.purchaseOrderId ?? eligibleOrders[0]?.id ?? "");
  const order = eligibleOrders.find((row) => row.id === purchaseOrderId);
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(bill?.supplierInvoiceNumber ?? "");
  const [billDate, setBillDate] = useState(bill?.billDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [taxDate, setTaxDate] = useState(bill?.taxDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(bill?.dueDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [rateToBase, setRateToBase] = useState(bill?.rateToBase ?? order?.rateToBase ?? "1");
  const buildLines = useCallback((selectedOrder?: PurchaseOrder): BillEntryLine[] => selectedOrder?.lines.map((poLine) => {
    const existing = bill?.lines.find((line) => line.purchaseOrderLineItemId === poLine.id);
    return {
      purchaseOrderLineItemId: poLine.id,
      selected: Boolean(existing) || (!bill && toUnits(poLine.quantityReceived) > 0),
      quantity: existing?.quantity ?? (toUnits(poLine.quantityReceived) > 0 ? poLine.quantityReceived : poLine.quantity),
      unitPrice: existing?.unitPrice ?? poLine.unitCost,
      taxTreatment: existing?.taxTreatment ?? "standard",
    };
  }) ?? [], [bill]);
  const [lines, setLines] = useState<BillEntryLine[]>(() => buildLines(order));
  const chooseOrder = (nextId: string) => {
    const nextOrder = eligibleOrders.find((row) => row.id === nextId);
    setPurchaseOrderId(nextId); setRateToBase(nextOrder?.rateToBase ?? "1"); setLines(buildLines(nextOrder));
  };
  const selectedLines = lines.filter((line) => line.selected);
  const valid = Boolean(order && supplierInvoiceNumber.trim() && billDate && taxDate && dueDate >= billDate
    && Number(rateToBase) > 0 && selectedLines.length > 0
    && selectedLines.every((line) => Number(line.quantity) > 0 && Number(line.unitPrice) > 0));
  const updateLine = <K extends keyof BillEntryLine>(id: string, field: K, value: BillEntryLine[K]) =>
    setLines((current) => current.map((line) => line.purchaseOrderLineItemId === id ? { ...line, [field]: value } : line));

  return <LegacyModal labelledBy="supplier-bill-title" onClose={onClose} className="procurement-modal">
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!valid) return;
      const body = {
        ...(!bill ? { purchaseOrderId } : {}), supplierInvoiceNumber, billDate, taxDate, dueDate, rateToBase,
        lines: selectedLines.map(({ purchaseOrderLineItemId, quantity, unitPrice, taxTreatment }) =>
          ({ purchaseOrderLineItemId, quantity, unitPrice, taxTreatment })),
      };
      onSave(body);
    }}>
      <h2 id="supplier-bill-title" tabIndex={-1} data-modal-initial-focus>{bill ? copy.editSupplierBillTitle : copy.newSupplierBillTitle}</h2>
      <p className="sub">{copy.supplierBillHelp}</p>
      {eligibleOrders.length === 0 ? <p className="procurement-error" role="alert">{copy.noEligiblePurchaseOrders}</p> : <>
        <div className="grid3">
          <LegacyField label={copy.purchaseOrder}><select value={purchaseOrderId} disabled={Boolean(bill)} onChange={(event) => chooseOrder(event.target.value)}>
            <option value="">{copy.selectPurchaseOrder}</option>
            {eligibleOrders.map((row) => <option key={row.id} value={row.id}>{row.number} — {productLabelForSupplier(reference, row.vendorContactId)}</option>)}
          </select></LegacyField>
          <LegacyField label={copy.supplierInvoice}><input value={supplierInvoiceNumber} maxLength={120} onChange={(event) => setSupplierInvoiceNumber(event.target.value)} /></LegacyField>
          <LegacyField label={copy.rateToBase}><input type="number" min="0.000001" step="0.000001" inputMode="decimal" value={rateToBase} onChange={(event) => setRateToBase(event.target.value)} /></LegacyField>
          <LegacyField label={copy.billDate}><input type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} /></LegacyField>
          <LegacyField label={copy.taxDate}><input type="date" value={taxDate} onChange={(event) => setTaxDate(event.target.value)} /></LegacyField>
          <LegacyField label={copy.dueDate}><input type="date" min={billDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></LegacyField>
        </div>
        {order && <div className="procurement-derived" role="note"><strong>{copy.derivedBillControls}</strong><span>{copy.derivedBillSummary
          .replace("{supplier}", productLabelForSupplier(reference, order.vendorContactId)).replace("{currency}", order.currency)}</span></div>}
        <fieldset className="supplier-bill-lines"><legend>{copy.billLines}</legend>{order?.lines.map((poLine, index) => {
          const line = lines.find((candidate) => candidate.purchaseOrderLineItemId === poLine.id);
          if (!line) return null;
          return <div className="supplier-bill-line" key={poLine.id}>
            <label className="supplier-bill-select"><input type="checkbox" checked={line.selected}
              onChange={(event) => updateLine(poLine.id, "selected", event.target.checked)} />
              <span><strong>{copy.line.replace("{number}", String(index + 1))}: {productLabel(reference, poLine.productId)}</strong>
                <small>{copy.poLineEvidence.replace("{ordered}", poLine.quantity).replace("{received}", poLine.quantityReceived).replace("{price}", fmt(poLine.unitCost, order.currency))}</small></span>
            </label>
            {line.selected && <div className="supplier-bill-line-fields">
              <LegacyField label={`${copy.billQuantity} — ${productLabel(reference, poLine.productId)}`}><input type="number" min="0.001" step="0.001" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(poLine.id, "quantity", event.target.value)} /></LegacyField>
              <LegacyField label={`${copy.billUnitPrice} — ${productLabel(reference, poLine.productId)}`}><input type="number" min="0.01" step="0.01" inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(poLine.id, "unitPrice", event.target.value)} /></LegacyField>
              <LegacyField label={`${copy.taxTreatment} — ${productLabel(reference, poLine.productId)}`}><select value={line.taxTreatment} onChange={(event) => updateLine(poLine.id, "taxTreatment", event.target.value as BillEntryLine["taxTreatment"])}>
                <option value="standard">{copy.standardTax}</option><option value="zero-rated">{copy.zeroRatedTax}</option><option value="exempt">{copy.exemptTax}</option>
              </select></LegacyField>
            </div>}
          </div>;
        })}</fieldset>
      </>}
      <DialogError error={error} /><DialogActions busy={busy} valid={valid} onClose={onClose} save={bill ? copy.saveDraftBill : copy.createDraftBill} />
    </form>
  </LegacyModal>;
}

function productLabelForSupplier(reference: ReferenceData, supplierId: string) {
  return reference.suppliers.find((row) => row.id === supplierId)?.name ?? appEnglish.procurement.unknownSupplier;
}

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
