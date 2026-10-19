import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { config } from "../config.js";
import {
  verifyTrustIdAssertion,
  markAssertionConsumed,
  consumeTrustIdAssertion,
} from "../lib/trustid.js";

/** Actions that require recent TrustID step-up. */
export const STEP_UP_ACTIONS = [
  "refund",
  "customer.merge",
  "staff.role_change",
  "payment.verify",
  "payment.refund",
  "config.change",
  "security.settings",
  "customer.sensitive_read",
  "high_value.operation",
] as const;

export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

export function isStepUpAction(value: string): value is StepUpAction {
  return (STEP_UP_ACTIONS as readonly string[]).includes(value);
}

const DEFAULT_STEP_UP_TTL_MS = 5 * 60_000;

/** Create a pending step-up challenge for a sensitive staff action. */
export async function createStepUpChallenge(opts: {
  tenantId: string;
  staffId: string;
  staffSessionId: string;
  action: StepUpAction;
  ttlMs?: number;
}) {
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_STEP_UP_TTL_MS));
  const challenge = await prisma.stepUpChallenge.create({
    data: {
      tenantId: opts.tenantId,
      staffId: opts.staffId,
      staffSessionId: opts.staffSessionId,
      action: opts.action,
      status: "pending",
      requiredScopes: ["openid", "step_up"],
      expiresAt,
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.staffId,
    action: "auth.step_up.required",
    resource: "step_up_challenge",
    resourceId: challenge.id,
    metadata: { stepUpAction: opts.action },
  });

  return {
    challengeId: challenge.id,
    action: challenge.action,
    status: challenge.status,
    expiresAt: challenge.expiresAt.toISOString(),
    message: "TrustID step-up required for this action",
  };
}

/** Satisfy step-up with a TrustID step_up assertion. */
export async function satisfyStepUpChallenge(opts: {
  challengeId: string;
  tenantId: string;
  staffId: string;
  assertion: string;
}) {
  const challenge = await prisma.stepUpChallenge.findFirst({
    where: {
      id: opts.challengeId,
      tenantId: opts.tenantId,
      staffId: opts.staffId,
    },
  });
  if (!challenge) {
    throw Object.assign(new Error("Step-up challenge not found"), {
      code: "not_found",
      statusCode: 404,
    });
  }
  if (challenge.status !== "pending" || challenge.expiresAt < new Date()) {
    throw Object.assign(new Error("Step-up challenge expired or already used"), {
      code: "step_up_expired",
      statusCode: 401,
    });
  }

  const verified = await verifyTrustIdAssertion({
    assertion: opts.assertion,
    expectedAudience: config.trustidAudience,
    expectedAssertionType: "step_up",
    expectedStepUpFor: challenge.action,
    requiredScopes: ["openid", "step_up"],
  });
  if (!verified.ok) {
    throw Object.assign(new Error(verified.message), {
      code: verified.code,
      statusCode: 401,
    });
  }

  // Staff session must be linked to same TrustID
  const session = await prisma.staffSession.findFirst({
    where: { id: challenge.staffSessionId, tenantId: opts.tenantId, revokedAt: null },
  });
  if (!session) {
    throw Object.assign(new Error("Staff session invalid"), {
      code: "unauthorized",
      statusCode: 401,
    });
  }
  if (session.trustId && session.trustId !== verified.claims.sub) {
    throw Object.assign(new Error("Step-up identity does not match session"), {
      code: "identity_mismatch",
      statusCode: 403,
    });
  }

  const consumed = await consumeTrustIdAssertion(verified.claims.jti);
  if (!consumed.ok && consumed.code === "replay") {
    throw Object.assign(new Error("Assertion has already been used"), {
      code: "replay",
      statusCode: 401,
    });
  }
  markAssertionConsumed(verified.claims.jti, verified.claims.exp);

  await prisma.assertionExchange.create({
    data: {
      jti: verified.claims.jti,
      trustId: verified.claims.sub,
      purpose: `step_up:${challenge.action}`,
      tenantId: opts.tenantId,
      expiresAt: new Date(verified.claims.exp * 1000 + 300_000),
    },
  });

  const stepUpAt = {
    ...((session.stepUpAt as Record<string, number>) ?? {}),
    [challenge.action]: Date.now(),
  };

  await prisma.$transaction([
    prisma.stepUpChallenge.update({
      where: { id: challenge.id },
      data: {
        status: "satisfied",
        satisfiedAt: new Date(),
        jti: verified.claims.jti,
      },
    }),
    prisma.staffSession.update({
      where: { id: session.id },
      data: { stepUpAt },
    }),
  ]);

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.staffId,
    action: "auth.step_up.satisfied",
    resource: "step_up_challenge",
    resourceId: challenge.id,
    metadata: { stepUpAction: challenge.action, jti: verified.claims.jti },
  });

  return {
    ok: true,
    action: challenge.action,
    satisfiedAt: new Date().toISOString(),
  };
}

/**
 * Ensure the staff session has a recent satisfied step-up for the action.
 * Returns null if ok; otherwise a challenge payload (caller returns 403 step_up_required).
 */
export async function requireStepUp(opts: {
  tenantId: string;
  staffId: string;
  staffSessionId: string;
  action: StepUpAction;
  maxAgeMs?: number;
}): Promise<{ required: false } | { required: true; challenge: Awaited<ReturnType<typeof createStepUpChallenge>> }> {
  const maxAge = opts.maxAgeMs ?? DEFAULT_STEP_UP_TTL_MS;
  const session = await prisma.staffSession.findFirst({
    where: { id: opts.staffSessionId, tenantId: opts.tenantId, revokedAt: null },
  });
  if (!session) {
    throw Object.assign(new Error("Staff session invalid"), {
      code: "unauthorized",
      statusCode: 401,
    });
  }

  const map = (session.stepUpAt as Record<string, number>) ?? {};
  const at = map[opts.action];
  if (typeof at === "number" && Date.now() - at < maxAge) {
    return { required: false };
  }

  const challenge = await createStepUpChallenge({
    tenantId: opts.tenantId,
    staffId: opts.staffId,
    staffSessionId: opts.staffSessionId,
    action: opts.action,
    ttlMs: maxAge,
  });
  return { required: true, challenge };
}
