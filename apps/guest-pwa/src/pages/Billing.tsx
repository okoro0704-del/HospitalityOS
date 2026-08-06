import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

function money(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function GuestPaymentsPage() {
  const [data, setData] = useState<{
    invoices: Array<{ id: string; number: string; status: string; amountDue: number; total: number; currency: string }>;
    payments: Array<{ id: string; amount: number; currency: string; status: string }>;
    receipts: Array<{ id: string; number: string; amount: number; currency: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    apiGet<NonNullable<typeof data>>("/guest/billing")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(() => {
    load();
  }, []);

  async function pay(invoiceId: string) {
    setBusy(invoiceId);
    setError(null);
    try {
      const key = `guest_${invoiceId}_${Date.now()}`;
      const intentRes = await apiSend<{ intent: { id: string } }>(
        "/guest/billing/payment-intents",
        "POST",
        { invoiceId, idempotencyKey: key },
      );
      await apiSend(`/guest/billing/payment-intents/${intentRes.intent.id}/capture`, "POST", {
        idempotencyKey: `cap_${key}`,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <h2>Payments</h2>
      <p className="muted">
        <Link to="/invoices">Invoices</Link> · <Link to="/receipts">Receipts</Link>
      </p>
      {error && <p className="error">{error}</p>}
      <h3>Amount due</h3>
      <ul className="list">
        {(data?.invoices ?? [])
          .filter((i) => i.amountDue > 0)
          .map((inv) => (
            <li key={inv.id}>
              {inv.number} · {money(inv.amountDue, inv.currency)} · {inv.status}
              <button
                type="button"
                className="btn"
                disabled={busy === inv.id}
                onClick={() => pay(inv.id)}
              >
                {busy === inv.id ? "Processing…" : "Pay (mock)"}
              </button>
            </li>
          ))}
      </ul>
      <h3>Payment history</h3>
      <ul className="list">
        {(data?.payments ?? []).map((p) => (
          <li key={p.id}>
            {money(p.amount, p.currency)} · {p.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuestInvoicesPage() {
  const [invoices, setInvoices] = useState<
    Array<{ id: string; number: string; status: string; total: number; amountDue: number; currency: string }>
  >([]);
  useEffect(() => {
    apiGet<{ invoices: typeof invoices }>("/guest/billing/invoices").then((d) =>
      setInvoices(d.invoices),
    );
  }, []);
  return (
    <section className="panel">
      <h2>Invoices</h2>
      <Link to="/payments">← Payments</Link>
      <ul className="list">
        {invoices.map((inv) => (
          <li key={inv.id}>
            {inv.number} · {inv.status} · total {money(inv.total, inv.currency)} · due{" "}
            {money(inv.amountDue, inv.currency)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuestReceiptsPage() {
  const [receipts, setReceipts] = useState<
    Array<{ id: string; number: string; amount: number; currency: string; createdAt: string }>
  >([]);
  useEffect(() => {
    apiGet<{ receipts: typeof receipts }>("/guest/billing/receipts").then((d) =>
      setReceipts(d.receipts),
    );
  }, []);
  return (
    <section className="panel">
      <h2>Receipts</h2>
      <Link to="/payments">← Payments</Link>
      <ul className="list">
        {receipts.map((r) => (
          <li key={r.id}>
            {r.number} · {money(r.amount, r.currency)} · {new Date(r.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}
