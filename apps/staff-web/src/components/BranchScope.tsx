import { useEffect, useState } from "react";
import { apiGet, getSession } from "../lib/api";

const BRANCH_KEY = "hos.staff.branchId";

export function getSelectedBranchId(): string | null {
  return localStorage.getItem(BRANCH_KEY);
}

export function setSelectedBranchId(id: string | null) {
  if (!id) localStorage.removeItem(BRANCH_KEY);
  else localStorage.setItem(BRANCH_KEY, id);
  window.dispatchEvent(new Event("hos-branch-change"));
}

type Branch = { id: string; name: string; code: string };

/** Branch selector — only when staff has access to multiple branches. */
export function BranchScopeBar() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<string | null>(getSelectedBranchId());
  const session = getSession();

  useEffect(() => {
    apiGet<{ branches: Branch[] }>("/branches")
      .then((d) => {
        setBranches(d.branches);
        const ids = session?.branchIds ?? [];
        // If session has a single branch, lock selection
        if (ids.length === 1 && ids[0]) {
          setSelectedBranchId(ids[0]);
          setSelected(ids[0]);
        }
      })
      .catch(() => undefined);
  }, [session?.branchIds]);

  if (branches.length <= 1) {
    return (
      <p className="muted small" aria-label="Branch scope">
        {branches[0] ? `Branch: ${branches[0].name}` : "All branches"}
      </p>
    );
  }

  return (
    <div className="branch-scope" role="group" aria-label="Branch scope">
      <label htmlFor="branch-select">Branch</label>
      <select
        id="branch-select"
        className="input"
        value={selected ?? ""}
        onChange={(e) => {
          const v = e.target.value || null;
          setSelected(v);
          setSelectedBranchId(v);
        }}
      >
        <option value="">All authorized</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.code})
          </option>
        ))}
      </select>
    </div>
  );
}
