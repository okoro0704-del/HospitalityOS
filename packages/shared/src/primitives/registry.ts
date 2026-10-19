/**
 * Optional runtime registry for primitive providers.
 * Hosts (HospitalityOS API) set local adapters at boot; tests may override.
 */
import type { IJobDispatcher, IMessagingProvider, IStorageProvider } from "./interfaces.js";

export type PrimitiveRegistry = {
  messaging?: IMessagingProvider;
  storage?: IStorageProvider;
  jobs?: IJobDispatcher;
};

const globalRegistry: PrimitiveRegistry = {};

export function setPrimitiveProviders(partial: PrimitiveRegistry): void {
  Object.assign(globalRegistry, partial);
}

export function getMessagingProvider(): IMessagingProvider {
  if (!globalRegistry.messaging) {
    throw new Error("IMessagingProvider not registered — call setPrimitiveProviders at boot");
  }
  return globalRegistry.messaging;
}

export function getStorageProvider(): IStorageProvider {
  if (!globalRegistry.storage) {
    throw new Error("IStorageProvider not registered — call setPrimitiveProviders at boot");
  }
  return globalRegistry.storage;
}

export function getJobDispatcher(): IJobDispatcher {
  if (!globalRegistry.jobs) {
    throw new Error("IJobDispatcher not registered — call setPrimitiveProviders at boot");
  }
  return globalRegistry.jobs;
}

/** Test helper — clears registry */
export function resetPrimitiveProviders(): void {
  delete globalRegistry.messaging;
  delete globalRegistry.storage;
  delete globalRegistry.jobs;
}
