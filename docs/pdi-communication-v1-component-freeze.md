# PDI Communication Primitive Binding V1 — Component Freeze Record

**Frozen contract version:** PDI COMMUNICATION V1

**Approval:** VERIFIED AND APPROVED FOR COMPONENT FREEZE

**Scope:** This record locks the verified component contract and its evidence. It does not authorize production deployment, a merge, publication, a Git release, or a freeze tag.

## Immutable contract

- The canonical mailbox subject is the canonical TrustID subject; no synthesized `elfcom:` identity is used.
- PDI creation is explicit. A guest has no PDI until the product creation flow succeeds.
- Communication authority is separate from the PDI/identity authority and must be explicitly requested and approved.
- Exactly one canonical ElfCom mailbox binding is used for a canonical subject. Returning provisioning preserves the binding rather than creating or remapping a mailbox.
- `communication.inbox` is read-only. It is available through both APP and SPACE execution modes with mailbox continuity.
- Provider thread identifiers are opaque provider data: the Hospitality product adapter returns them byte-for-byte without parsing, reconstruction, ownership derivation, or identifier-format authorization.
- Cross-owner and cross-tenant isolation are both enforced. Authenticated tenant context selects the PDI; supplied PDI, binding, owner, provider-reference, and thread identifiers cannot select another tenant's mailbox.
- Revocation disconnects capability execution; reconnection obtains a new active authority grant while preserving the canonical mailbox binding.
- An ElfCom provider outage fails closed as `CAPABILITY_UNAVAILABLE` / `PROVIDER_UNAVAILABLE`; recovery restores the existing mailbox and binding without duplication or remapping.
- `communication.send` is excluded. Inbox consent cannot authorize sending; APP and SPACE send attempts are rejected before an ElfCom send request or message creation.

## Pinned component revisions

| Component | Immutable revision | Evidence |
| --- | --- | --- |
| DDI | `2391f878852ed32e89d5690d867326fd64a6c39a` | CI `37650530422` — 54 passed, 0 failed, 0 cancelled |
| ElfCom | `f0b7e7213e4b0c8bf0efe560212ec1cd3764bdbf` | Canonical mailbox provider dependency pin |
| TrustID / Digi-RP | `8bf7852d14fe91ba28670768c7f3b2c898ce581b` | Durable owner and authority implementation pin |
| TrustID PostgreSQL isolation proof | `535ae83b3ece9cecc073af0222b5472bd6fa9cf2` | CI `37686430129` — passed; contains the TrustID/Digi-RP pin |
| Hospitality V1 implementation | `25ed1ad3be9b26271afdf26e4da4a79398bc1e77` | Canonical inbox contract consumer |
| Hospitality final verification | `e8e21a69346aa18e240c4f62f1a30becd9ea04bc` | CI `37928439988` — clean PostgreSQL verification passed |

All listed revisions were verified available from their published verification branches when this record was created. The final Hospitality CI ran at `e8e21a69346aa18e240c4f62f1a30becd9ea04bc`; it used PostgreSQL 16 and the exact DDI, ElfCom, and TrustID dependency SHAs above.

## Final verification evidence

CI `37928439988` passed all setup and proof steps:

- localhost safety gate, migrations, and exact dependency builds;
- opaque non-DM provider thread ID preservation through the actual Hospitality adapter;
- distinct disposable PostgreSQL tenant contexts and attempted foreign mailbox-selector inputs;
- controlled provider endpoint outage, fail-closed result, and recovery of the same mailbox;
- `communication.send` rejection through DDI capability execution in APP and SPACE, with zero ElfCom send requests;
- base (`eaf828dbf17993b1beda4dd232d4642b26726e54`) and candidate normalized TypeScript diagnostic comparison.

## Full HospitalityOS release blocker

This component freeze is not a full HospitalityOS release approval. The normalized TypeScript comparison found zero new V1 diagnostics, but the clean base and candidate both retain these seven pre-existing API diagnostics:

- `src/routes-crm.ts(552,9)` — TS2322
- `src/services/crm.ts(39,7)` — TS2322
- `src/services/crm.ts(269,5)` — TS2322
- `src/services/crm.ts(338,13)` — TS2322
- `src/services/operations.ts(268,7)` — TS2322
- `src/services/staff-identity.ts(97,7)` — TS2353
- `src/services/staff-identity.ts(105,7)` — TS2353

These are a separate full-release blocker and are not changed, suppressed, or accepted as a PDI Communication V1 component defect.

## Operational boundary

**COMPONENT FREEZE DOES NOT MEAN PRODUCTION DEPLOYMENT.**

No runtime code, API, database schema, provider contract, or authorization behavior is modified by this registration. No merge, deployment, publication, Git release, or tag is created.
