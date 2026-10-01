import { writeAudit } from "../../lib/audit.js";
import { exchangeDigiAssertion } from "./ddi-client.js";
import { saveDigiSession, saveIdentity } from "./vault.js";

/** Forward one verified TrustID assertion to Digi Core. Hospitality login still succeeds if Digi is down. */
export async function attachDigiContext(input: {
  assertion: string;
  tenantId: string;
  actorKind: "guest" | "staff";
  actorId: string;
  hospitalitySessionId: string;
  trustIdSubject: string;
}) {
  try {
    const exchanged = await exchangeDigiAssertion(input.assertion);
    await saveIdentity({ ...input, digiOwnerId: exchanged.ownerId });
    await saveDigiSession({
      tenantId: input.tenantId,
      actorKind: input.actorKind,
      actorId: input.actorId,
      hospitalitySessionId: input.hospitalitySessionId,
      digiOwnerId: exchanged.ownerId,
      sessionToken: exchanged.sessionToken,
      expiresAt: exchanged.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await writeAudit({
      tenantId: input.tenantId,
      actorKind: input.actorKind,
      actorId: input.actorId,
      action: "PDI_LOOKUP",
      resource: "digi_owner",
      metadata: { result: "DIGI_SESSION_READY" },
    });
    return { digi: "READY" as const, digiOwnerId: exchanged.ownerId };
  } catch {
    await writeAudit({
      tenantId: input.tenantId,
      actorKind: input.actorKind,
      actorId: input.actorId,
      action: "PDI_LOOKUP",
      resource: "digi_owner",
      metadata: { result: "DIGI_UNAVAILABLE" },
    }).catch(() => undefined);
    return { digi: "UNAVAILABLE" as const };
  }
}
