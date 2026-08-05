import { useEffect, useState } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Policy = {
  id: string;
  name: string;
  code: string;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  cancellationDeadlineMinutes: number;
  allowWaitlist: boolean;
};

export function BookingPoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    await apiSend("/booking/bootstrap", "POST");
    const data = await apiGet<{ policies: Policy[] }>("/booking/policies");
    setPolicies(data.policies);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function save(policy: Policy) {
    await apiSend(`/booking/policies/${policy.id}`, "PATCH", {
      minNoticeMinutes: policy.minNoticeMinutes,
      maxAdvanceDays: policy.maxAdvanceDays,
      cancellationDeadlineMinutes: policy.cancellationDeadlineMinutes,
      allowWaitlist: policy.allowWaitlist,
    });
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Booking engine</p>
          <h2>Policies</h2>
          <p className="muted">Notice windows, advance limits, cancellation deadlines, waitlists.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="stack-list">
        {policies.map((p) => (
          <article key={p.id} className="panel soft">
            <strong>
              {p.name} <span className="muted small">({p.code})</span>
            </strong>
            <div className="inline-form wrap">
              <label className="field">
                Min notice (min)
                <input
                  type="number"
                  value={p.minNoticeMinutes}
                  onChange={(e) =>
                    setPolicies((all) =>
                      all.map((x) =>
                        x.id === p.id
                          ? { ...x, minNoticeMinutes: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                Max advance (days)
                <input
                  type="number"
                  value={p.maxAdvanceDays}
                  onChange={(e) =>
                    setPolicies((all) =>
                      all.map((x) =>
                        x.id === p.id ? { ...x, maxAdvanceDays: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                Cancel deadline (min)
                <input
                  type="number"
                  value={p.cancellationDeadlineMinutes}
                  onChange={(e) =>
                    setPolicies((all) =>
                      all.map((x) =>
                        x.id === p.id
                          ? { ...x, cancellationDeadlineMinutes: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                Waitlist
                <select
                  value={p.allowWaitlist ? "yes" : "no"}
                  onChange={(e) =>
                    setPolicies((all) =>
                      all.map((x) =>
                        x.id === p.id ? { ...x, allowWaitlist: e.target.value === "yes" } : x,
                      ),
                    )
                  }
                >
                  <option value="yes">Allowed</option>
                  <option value="no">Disabled</option>
                </select>
              </label>
              <button type="button" className="btn" onClick={() => save(p)}>
                Save
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
