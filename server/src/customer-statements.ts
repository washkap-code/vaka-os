import { and, eq, inArray, lte } from "drizzle-orm";
import { db, notFound, schema } from "./lib.js";
import { exactSum, fromMinorUnits, toMinorUnits } from "./reports.js";

export type CustomerStatementCurrency = {
  currency: string;
  invoiced: string;
  paid: string;
  outstanding: string;
};

export async function getCustomerStatementSummary(opts: {
  tenantId: string;
  contactId: string;
  asAt: Date;
}) {
  const [contact] = await db.select({ id: schema.contacts.id, name: schema.contacts.name })
    .from(schema.contacts).where(and(
      eq(schema.contacts.id, opts.contactId),
      eq(schema.contacts.tenantId, opts.tenantId),
    ));
  if (!contact) throw notFound("Customer not found");
  const invoices = await db.select({
    id: schema.invoices.id,
    number: schema.invoices.number,
    currency: schema.invoices.currency,
    issueDate: schema.invoices.issueDate,
    dueDate: schema.invoices.dueDate,
    status: schema.invoices.status,
    total: schema.invoices.total,
    amountPaid: schema.invoices.amountPaid,
  }).from(schema.invoices).where(and(
    eq(schema.invoices.tenantId, opts.tenantId),
    eq(schema.invoices.contactId, contact.id),
    inArray(schema.invoices.status, ["ISSUED", "PARTIAL", "PAID"]),
    lte(schema.invoices.issueDate, opts.asAt),
  ));
  const grouped = new Map<string, { invoiced: bigint; paid: bigint; outstanding: bigint }>();
  for (const invoice of invoices) {
    const values = grouped.get(invoice.currency) ?? { invoiced: 0n, paid: 0n, outstanding: 0n };
    const total = toMinorUnits(invoice.total);
    const paid = toMinorUnits(invoice.amountPaid);
    values.invoiced += total;
    values.paid += paid;
    values.outstanding += total - paid;
    grouped.set(invoice.currency, values);
  }
  const currencies: CustomerStatementCurrency[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, values]) => ({
      currency,
      invoiced: fromMinorUnits(values.invoiced),
      paid: fromMinorUnits(values.paid),
      outstanding: fromMinorUnits(values.outstanding),
    }));
  const reconciled = currencies.every((row) =>
    exactSum([row.paid, row.outstanding]) === toMinorUnits(row.invoiced));
  return {
    contact,
    asAt: opts.asAt.toISOString().slice(0, 10),
    currencies,
    invoiceCount: invoices.length,
    reconciled,
  };
}
