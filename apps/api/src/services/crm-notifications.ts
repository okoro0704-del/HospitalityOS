/**
 * CRM notification extension points.
 * Delivery goes through IMessagingProvider via the communications engine.
 */
import { getMessagingProvider, getJobDispatcher, getStorageProvider } from "@hospitalityos/shared";

export {
  processCommunicationEvent,
  type CommunicationEventInput,
} from "./communications/engine.js";

/** CRM / domain access to ecosystem primitives (dependency inversion). */
export { getMessagingProvider, getJobDispatcher, getStorageProvider };

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
