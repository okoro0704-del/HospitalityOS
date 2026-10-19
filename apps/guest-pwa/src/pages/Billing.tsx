import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

function money(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function GuestPaymentsPage() {
  const [data, setData] = useState<{
    invoices: Array<{
      id: string;
      number: string;
      status: string;
      amountDue: number;
      total: number;
      currency: string;
    }>;
    payments: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      methodType?: string;
    }>;
    receipts: Array<{ id: string; number: string; amount: number; currency: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiGet<NonNullable<typeof data>>("/guest/billing")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(() => {
    load();
  }, []);

  async function requestManual(invoiceId: string, methodType: "pay_at_venue" | "pay_to_staff") {
    setBusy(`${methodType}:${invoiceId}`);
    setError(null);
    setMessage(null);
    try {
      const key = `guest_man_${methodType}_${invoiceId}_${Date.now()}`;
      const res = await apiSend<{ message?: string }>("/guest/billing/manual/request", "POST", {
        invoiceId,
        methodType,
        idempotencyKey: key,
      });
      setMessage(res.message ?? "Payment request recorded. Staff will confirm when paid.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  async function payMock(invoiceId: string) {
    setBusy(`mock:${invoiceId}`);
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
      {message && <p className="ok">{message}</p>}
      <h3>Amount due</h3>
      <ul className="list">
        {(data?.invoices ?? [])
          .filter((i) => i.amountDue > 0)
          .map((inv) => (
            <li key={inv.id}>
              {inv.number} · {money(inv.amountDue, inv.currency)} · {inv.status}
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy === `pay_at_venue:${inv.id}`}
                  onClick={() => requestManual(inv.id, "pay_at_venue")}
                >
                  Pay at venue
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy === `pay_to_staff:${inv.id}`}
                  onClick={() => requestManual(inv.id, "pay_to_staff")}
                >
                  Pay to staff
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy === `mock:${inv.id}`}
                  onClick={() => payMock(inv.id)}
                >
                  {busy === `mock:${inv.id}` ? "Processing…" : "Pay online (demo)"}
                </button>
              </div>
            </li>
          ))}
      </ul>
      <h3>Payment history</h3>
      <ul className="list">
        {(data?.payments ?? []).map((p) => (
          <li key={p.id}>
            {money(p.amount, p.currency)} · {p.status}
            {p.methodType ? ` · ${p.methodType.replaceAll("_", " ")}` : ""}
            {p.status === "captured" ? " · Payment received" : ""}
            {p.status === "pending_verification" ? " · Awaiting verification" : ""}
          </li>
        ))}
      </ul>
      {(data?.receipts?.length ?? 0) > 0 && (
        <>
          <h3>Receipts available</h3>
          <ul className="list">
            {data!.receipts.map((r) => (
              <li key={r.id}>
                {r.number} · {money(r.amount, r.currency)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function GuestInvoicesPage() {
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      number: string;
      status: string;
      total: number;
      amountDue: number;
      currency: string;
    }>
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
    Array<{ id: string; number: string; amount: number; currency: string; createdAt: string; methodType?: string }>
  >([]);
  const [detail, setDetail] = useState<{
    receipt: {
      id: string;
      number: string;
      amount: number;
      currency: string;
      methodType: string;
      createdAt: string;
      invoice?: { number: string; status: string } | null;
      payment?: { status: string; methodType: string } | null;
      business?: { name: string } | null;
    };
  } | null>(null);

  useEffect(() => {
    apiGet<{ receipts: typeof receipts }>("/guest/billing/receipts").then((d) =>
      setReceipts(d.receipts),
    );
  }, []);

  async function openReceipt(id: string) {
    const res = await apiGet<NonNullable<typeof detail>>(`/guest/billing/receipts/${id}`);
    setDetail(res);
  }

  return (
    <section className="panel">
      <h2>Receipts</h2>
      <p className="muted">
        <Link to="/activity">Activity</Link> · <Link to="/payments">Payments</Link>
      </p>
      <ul className="list">
        {receipts.map((r) => (
          <li key={r.id}>
            <button type="button" className="btn ghost" onClick={() => openReceipt(r.id)}>
              {r.number}
            </button>{" "}
            · {money(r.amount, r.currency)} · {new Date(r.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
      {detail && (
        <div className="card">
          <h3>Receipt {detail.receipt.number}</h3>
          <p>
            Amount: {money(detail.receipt.amount, detail.receipt.currency)}
            <br />
            Method: {detail.receipt.methodType.replaceAll("_", " ")}
            <br />
            {detail.receipt.business ? (
              <>
                Business: {detail.receipt.business.name}
                <br />
              </>
            ) : null}
            {detail.receipt.invoice ? (
              <>
                Invoice: {detail.receipt.invoice.number} ({detail.receipt.invoice.status})
                <br />
              </>
            ) : null}
            Date: {new Date(detail.receipt.createdAt).toLocaleString()}
          </p>
          <button type="button" className="btn ghost" onClick={() => setDetail(null)}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}
