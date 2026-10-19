import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
          <Link className="btn ghost" to="/billing/collections">
            Collections
          </Link>
          <Link className="btn ghost" to="/billing/reconciliation">
            Reconciliation
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
  const [search] = useSearchParams();
  const focusId = search.get("focus");
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      number: string;
      status: string;
      total: number;
      amountDue: number;
      amountPaid?: number;
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

  async function collectManual(invoiceId: string, amountDue: number, methodType: string) {
    await apiSend("/billing/payments/manual/collect", "POST", {
      invoiceId,
      amount: amountDue,
      methodType,
      idempotencyKey: `man_${methodType}_${invoiceId}_${Date.now()}`,
    });
    await load();
  }

  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Invoices</h2>
      {focusId && <p className="ok">Focused invoice from Today: {focusId}</p>}
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
          <li key={inv.id} style={focusId === inv.id ? { outline: "2px solid currentColor" } : undefined}>
            <strong>{inv.number}</strong> · {inv.status} · {money(inv.total, inv.currency)} · paid{" "}
            {money(inv.amountPaid ?? 0, inv.currency)} · due {money(inv.amountDue, inv.currency)}
            {inv.amountDue > 0 && (
              <span className="actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => payCash(inv.id, inv.amountDue)}
                >
                  Cash
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => collectManual(inv.id, inv.amountDue, "pay_to_staff")}
                >
                  Pay to staff
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => collectManual(inv.id, inv.amountDue, "bank_transfer_manual")}
                >
                  Bank transfer
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => collectManual(inv.id, inv.amountDue, "card_manual")}
                >
                  Card (manual)
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BillingPaymentsPage() {
  const [search] = useSearchParams();
  const focusId = search.get("focus");
  const [payments, setPayments] = useState<
    Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      methodType: string;
      externalReference?: string | null;
    }>
  >([]);
  function load() {
    apiGet<{ payments: typeof payments }>("/billing/payments").then((d) => setPayments(d.payments));
  }
  useEffect(() => {
    load();
  }, []);

  async function verify(id: string) {
    await apiSend(`/billing/payments/${id}/verify`, "POST", {});
    await load();
  }

  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Payments</h2>
      {focusId && <p className="ok">Focused payment from Today: {focusId}</p>}
      <ul className="list">
        {payments.map((p) => (
          <li key={p.id} style={focusId === p.id ? { outline: "2px solid currentColor" } : undefined}>
            {money(p.amount, p.currency)} · {p.status} · {p.methodType}
            {p.externalReference ? ` · ref ${p.externalReference}` : ""}
            {p.status === "pending_verification" && (
              <button type="button" className="btn ghost" onClick={() => verify(p.id)}>
                Verify
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BillingCollectionsPage() {
  const [summary, setSummary] = useState<{
    day: string;
    grandTotal: number;
    collectors: Array<{
      displayName: string;
      total: number;
      methods: Array<{ methodType: string; amount: number; count: number }>;
    }>;
  } | null>(null);
  useEffect(() => {
    apiGet<{ summary: NonNullable<typeof summary> }>("/billing/collections/today").then((d) =>
      setSummary(d.summary),
    );
  }, []);
  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Today&apos;s collections</h2>
      <p className="muted">Operational staff collection summary — not payroll.</p>
      {summary && (
        <>
          <p>
            <strong>{summary.day}</strong> · total {summary.grandTotal} (minor units)
          </p>
          <ul className="list">
            {summary.collectors.map((c) => (
              <li key={c.displayName}>
                <strong>{c.displayName}</strong> · {c.total}
                <ul>
                  {c.methods.map((m) => (
                    <li key={m.methodType}>
                      {m.methodType.replaceAll("_", " ")} — {m.amount} ({m.count})
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function BillingReconciliationPage() {
  const [rec, setRec] = useState<{
    day: string;
    openingCash: number;
    cashCollected: number;
    manualPayments: number;
    refunds: number;
    expectedTotal: number;
    recordedTotal: number;
    countedTotal?: number;
    difference: number;
  } | null>(null);
  const [opening, setOpening] = useState("0");
  const [counted, setCounted] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  function load(openingCash = opening, countedTotal = counted) {
    const q = new URLSearchParams({ openingCash });
    if (countedTotal !== "") q.set("countedTotal", countedTotal);
    apiGet<{ reconciliation: NonNullable<typeof rec> }>(
      `/billing/reconciliation/daily?${q.toString()}`,
    ).then((d) => setRec(d.reconciliation));
  }
  useEffect(() => {
    load();
  }, []);

  async function closePeriod() {
    setMessage(null);
    const countedTotal = counted !== "" ? Number(counted) : (rec?.expectedTotal ?? 0);
    const res = await apiSend<{ alreadyClosed?: boolean }>(
      "/billing/reconciliation/close",
      "POST",
      {
        openingCash: Number(opening) || 0,
        countedTotal,
      },
    );
    setMessage(res.alreadyClosed ? "Period already closed." : "Period closed.");
    load(opening, String(countedTotal));
  }

  return (
    <section className="page">
      <Link to="/billing">← Billing</Link>
      <h2>Daily reconciliation</h2>
      <p className="muted">Operational cash / manual payment reconciliation — not full accounting.</p>
      <label>
        Opening cash (minor)
        <input value={opening} onChange={(e) => setOpening(e.target.value)} />
      </label>
      <label>
        Counted total (minor)
        <input value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="optional" />
      </label>
      <button type="button" className="btn" onClick={() => load(opening, counted)}>
        Refresh
      </button>
      <button type="button" className="btn ghost" onClick={() => closePeriod()}>
        Close period
      </button>
      {message && <p className="ok">{message}</p>}
      {rec && (
        <dl className="profile-dl">
          <div>
            <dt>Day</dt>
            <dd>{rec.day}</dd>
          </div>
          <div>
            <dt>Opening cash</dt>
            <dd>{rec.openingCash}</dd>
          </div>
          <div>
            <dt>Cash collected</dt>
            <dd>{rec.cashCollected}</dd>
          </div>
          <div>
            <dt>Other manual payments</dt>
            <dd>{rec.manualPayments}</dd>
          </div>
          <div>
            <dt>Refunds</dt>
            <dd>{rec.refunds}</dd>
          </div>
          <div>
            <dt>Recorded total</dt>
            <dd>{rec.recordedTotal}</dd>
          </div>
          <div>
            <dt>Expected total</dt>
            <dd>{rec.expectedTotal}</dd>
          </div>
          <div>
            <dt>Counted total</dt>
            <dd>{rec.countedTotal ?? "—"}</dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd>{rec.difference}</dd>
          </div>
        </dl>
      )}
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
