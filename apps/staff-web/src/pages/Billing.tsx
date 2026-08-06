import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/api";

function money(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function BillingDashboardPage() {
  const [dash, setDash] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    apiGet<{ dashboard: Record<string, number> }>("/billing/dashboard").then((d) =>
      setDash(d.dashboard),
    );
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h2>Dashboard</h2>
        </div>
        <div className="actions">
          <Link className="btn ghost" to="/billing/invoices">
            Invoices
          </Link>
          <Link className="btn ghost" to="/billing/payments">
            Payments
          </Link>
          <Link className="btn ghost" to="/billing/refunds">
            Refunds
          </Link>
          <Link className="btn ghost" to="/billing/settlements">
            Settlements
          </Link>
          <Link className="btn ghost" to="/billing/taxes">
            Taxes
          </Link>
        </div>
      </header>
      {dash && (
        <div className="stat-row">
          <article className="stat">
            <p className="muted">Outstanding</p>
            <strong>
              {dash.outstandingInvoices} · {dash.outstandingAmount}
            </strong>
          </article>
          <article className="stat">
            <p className="muted">Paid today</p>
            <strong>
              {dash.paidTodayCount} · {dash.paidTodayAmount}
            </strong>
          </article>
          <article className="stat">
            <p className="muted">Refunds</p>
            <strong>{dash.refunds}</strong>
          </article>
          <article className="stat">
            <p className="muted">Failed / pending</p>
            <strong>
              {dash.failedPayments} / {dash.pendingIntents}
            </strong>
          </article>
          <article className="stat">
            <p className="muted">Cash</p>
            <strong>{dash.cashPayments}</strong>
          </article>
        </div>
      )}
    </section>
  );
}

export function BillingInvoicesPage() {
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      number: string;
      status: string;
      total: number;
      amountDue: number;
      currency: string;
      customerId: string;
    }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiGet<{ invoices: typeof invoices }>("/billing/invoices")
      .then((d) => setInvoices(d.invoices))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(() => {
    load();
    apiGet<{ customers: typeof customers }>("/customers")
      .then((d) => setCustomers(d.customers))
      .catch(() => undefined);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/billing/invoices", "POST", {
      customerId: fd.get("customerId"),
      currency: fd.get("currency") || "NGN",
      lines: [
        {
          description: fd.get("description"),
          unitAmount: Number(fd.get("unitAmount")),
          quantity: Number(fd.get("quantity") || 1),
        },
      ],
    });
    await load();
    (e.target as HTMLFormElement).reset();
  }

  async function payCash(invoiceId: string, amountDue: number) {
    await apiSend("/billing/payments/cash", "POST", {
      invoiceId,
      amount: amountDue,
      idempotencyKey: `cash_${invoiceId}_${Date.now()}`,
    });
    await load();
  }

  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Invoices</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onCreate}>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Customer
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <select name="currency" defaultValue="NGN">
          <option value="NGN">NGN</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
        </select>
        <input name="description" placeholder="Line description" required />
        <input name="unitAmount" type="number" placeholder="Unit amount (minor)" required />
        <input name="quantity" type="number" defaultValue={1} />
        <button type="submit">Create invoice</button>
      </form>
      <ul className="list">
        {invoices.map((inv) => (
          <li key={inv.id}>
            <strong>{inv.number}</strong> · {inv.status} · {money(inv.total, inv.currency)} · due{" "}
            {money(inv.amountDue, inv.currency)}
            {inv.amountDue > 0 && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => payCash(inv.id, inv.amountDue)}
              >
                Record cash
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BillingPaymentsPage() {
  const [payments, setPayments] = useState<
    Array<{ id: string; amount: number; currency: string; status: string; methodType: string }>
  >([]);
  useEffect(() => {
    apiGet<{ payments: typeof payments }>("/billing/payments").then((d) => setPayments(d.payments));
  }, []);
  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Payments</h2>
      <ul className="list">
        {payments.map((p) => (
          <li key={p.id}>
            {money(p.amount, p.currency)} · {p.status} · {p.methodType}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BillingRefundsPage() {
  const [refunds, setRefunds] = useState<
    Array<{ id: string; amount: number; currency: string; status: string; reason: string | null }>
  >([]);
  const [payments, setPayments] = useState<
    Array<{ id: string; amount: number; currency: string; status: string; capturedAmount: number; refundedAmount: number }>
  >([]);
  function load() {
    apiGet<{ refunds: typeof refunds }>("/billing/refunds").then((d) => setRefunds(d.refunds));
    apiGet<{ payments: typeof payments }>("/billing/payments").then((d) => setPayments(d.payments));
  }
  useEffect(() => {
    load();
  }, []);
  async function onRefund(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/billing/refunds", "POST", {
      paymentId: fd.get("paymentId"),
      amount: Number(fd.get("amount")),
      reason: fd.get("reason") || undefined,
      idempotencyKey: `ref_${Date.now()}`,
    });
    await load();
  }
  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Refunds</h2>
      <form className="card-form" onSubmit={onRefund}>
        <select name="paymentId" required defaultValue="">
          <option value="" disabled>
            Payment
          </option>
          {payments
            .filter((p) => ["captured", "partially_refunded"].includes(p.status))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.id.slice(0, 8)} · {money(p.capturedAmount - p.refundedAmount, p.currency)} left
              </option>
            ))}
        </select>
        <input name="amount" type="number" placeholder="Amount (minor)" required />
        <input name="reason" placeholder="Reason" />
        <button type="submit">Request refund</button>
      </form>
      <ul className="list">
        {refunds.map((r) => (
          <li key={r.id}>
            {money(r.amount, r.currency)} · {r.status} · {r.reason ?? "—"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BillingSettlementsPage() {
  const [items, setItems] = useState<
    Array<{ id: string; grossAmount: number; feeAmount: number; netAmount: number; currency: string; status: string }>
  >([]);
  useEffect(() => {
    apiGet<{ settlements: typeof items }>("/billing/settlements").then((d) => setItems(d.settlements));
  }, []);
  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Settlements</h2>
      <ul className="list">
        {items.map((s) => (
          <li key={s.id}>
            gross {money(s.grossAmount, s.currency)} · fee {money(s.feeAmount, s.currency)} · net{" "}
            {money(s.netAmount, s.currency)} · {s.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BillingTaxesPage() {
  const [rules, setRules] = useState<
    Array<{ id: string; code: string; name: string; rateBps: number; jurisdiction: string }>
  >([]);
  function load() {
    apiGet<{ taxRules: typeof rules }>("/billing/taxes").then((d) => setRules(d.taxRules));
  }
  useEffect(() => {
    load();
  }, []);
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/billing/taxes", "POST", {
      code: fd.get("code"),
      name: fd.get("name"),
      rateBps: Number(fd.get("rateBps")),
      jurisdiction: fd.get("jurisdiction") || "NG",
    });
    await load();
  }
  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Tax rules</h2>
      <form className="card-form" onSubmit={onCreate}>
        <input name="code" placeholder="Code" required />
        <input name="name" placeholder="Name" required />
        <input name="rateBps" type="number" placeholder="Rate (bps, 750 = 7.5%)" required />
        <input name="jurisdiction" placeholder="Jurisdiction" defaultValue="NG" />
        <button type="submit">Add rule</button>
      </form>
      <ul className="list">
        {rules.map((r) => (
          <li key={r.id}>
            {r.code} · {r.name} · {(r.rateBps / 100).toFixed(2)}% · {r.jurisdiction}
          </li>
        ))}
      </ul>
    </section>
  );
}
