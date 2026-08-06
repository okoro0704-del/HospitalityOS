/**
 * CRM notification extension points — delegates to the Sprint 12 communications engine.
 */
export {
  processCommunicationEvent,
  type CommunicationEventInput,
} from "./communications/engine.js";

export type CrmNotificationCandidate = {
  tenantId: string;
  customerId: string;
  channelHints: Array<"email" | "sms" | "push">;
  event: {
    eventType: string;
    sourceModule: string;
    sourceEntityId?: string | null;
    occurredAt: Date;
  };
  respectConsentPurposes: string[];
};

/** @deprecated Prefer processCommunicationEvent */
export function buildNotificationCandidate(
  input: CrmNotificationCandidate,
): CrmNotificationCandidate & { status: "queued_placeholder" } {
  return { ...input, status: "queued_placeholder" };
}
