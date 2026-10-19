import { setPrimitiveProviders } from "@hospitalityos/shared";
import { config } from "../config.js";
import { LocalMessagingAdapter } from "./communications/adapter.js";
import { LocalDiskStorageAdapter } from "./media-storage-adapter.js";
import { LocalJobDispatcherAdapter as HosLocalJobDispatcher } from "./jobs-adapter.js";
import {
  createStaticTokenFactory,
  MasterDistributorClient,
  RemoteElfComMessagingAdapter as HosRemoteElfCom,
  RemoteJobDispatcherAdapter as HosRemoteJobs,
  RemoteSovereignDriveAdapter as HosRemoteDrive,
} from "./remote/index.js";
import { setLifeOsPrimitives, type LifeOsPrimitiveContainer } from "./lifeos/container.js";
import {
  LocalElfComMessagingAdapter,
  LocalFundzManAdapter,
  LocalJobDispatcherAdapter,
  LocalMasterDistributorClient,
  LocalSovereignDriveAdapter,
  LocalTrustIdAdapter,
} from "./lifeos/local-adapters.js";
import {
  RemoteElfComMessagingAdapter,
  RemoteFundzManAdapter,
  RemoteJobDispatcherAdapter,
  RemoteMasterDistributorAdapter,
  RemoteSovereignDriveAdapter,
  RemoteTrustIdAdapter,
} from "./lifeos/remote-adapters.js";

export type PrimitiveBindingMode = "local" | "remote";

let distributorClient: MasterDistributorClient | null = null;
let lifeOsContainer: LifeOsPrimitiveContainer | null = null;

/** Domain-facing HOS Phase 0 contracts (messaging/storage/jobs used by verticals). */
export function registerLocalPrimitiveProviders(): void {
  setPrimitiveProviders({
    messaging: new LocalMessagingAdapter(),
    storage: new LocalDiskStorageAdapter(),
    jobs: new HosLocalJobDispatcher(),
  });
  distributorClient = null;
}

export function registerRemotePrimitiveProviders(opts?: {
  elfcomUrl?: string;
  sovereignDriveUrl?: string;
  platformJobsUrl?: string;
  masterDistributorUrl?: string;
  serviceToken?: string;
}): void {
  const token = createStaticTokenFactory(
    opts?.serviceToken ?? config.primitivesServiceToken,
  );

  setPrimitiveProviders({
    messaging: new HosRemoteElfCom({
      baseUrl: opts?.elfcomUrl ?? config.elfcomUrl,
      getAccessToken: token,
    }),
    storage: new HosRemoteDrive({
      baseUrl: opts?.sovereignDriveUrl ?? config.sovereignDriveUrl,
      getAccessToken: token,
    }),
    jobs: new HosRemoteJobs({
      baseUrl: opts?.platformJobsUrl ?? config.platformJobsUrl,
      getAccessToken: token,
    }),
  });

  distributorClient = new MasterDistributorClient({
    baseUrl: opts?.masterDistributorUrl ?? config.masterDistributorUrl,
    getAccessToken: token,
  });
}

export function getMasterDistributorClient(): MasterDistributorClient {
  if (!distributorClient) {
    throw new Error(
      "MasterDistributorClient not registered — set PRIMITIVES_MODE=remote or call registerRemotePrimitiveProviders",
    );
  }
  return distributorClient;
}

function requiredUrl(name: string, value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) throw new Error(`Missing env ${name} for PRIMITIVES_MODE=remote`);
  return v;
}

/** LifeOS Phase F — all 6 primitives via `@lifeos/shared` contracts. */
export function registerLifeOsPrimitives(env: NodeJS.ProcessEnv = process.env): LifeOsPrimitiveContainer {
  const mode = (env.PRIMITIVES_MODE ?? config.primitivesMode ?? "local").toLowerCase();

  const next: LifeOsPrimitiveContainer =
    mode === "remote"
      ? {
          trustId: new RemoteTrustIdAdapter(
            requiredUrl("TRUSTID_URL", env.TRUSTID_URL ?? env.TRUSTID_API_URL ?? config.trustidApiUrl),
          ),
          messaging: new RemoteElfComMessagingAdapter(
            requiredUrl("ELFCOM_URL", env.ELFCOM_URL ?? config.elfcomUrl),
          ),
          storage: new RemoteSovereignDriveAdapter(
            requiredUrl("SOVEREIGN_DRIVE_URL", env.SOVEREIGN_DRIVE_URL ?? config.sovereignDriveUrl),
          ),
          jobs: new RemoteJobDispatcherAdapter(
            requiredUrl("PLATFORM_JOBS_URL", env.PLATFORM_JOBS_URL ?? env.JOBS_ENGINE_URL ?? config.platformJobsUrl),
          ),
          distributor: new RemoteMasterDistributorAdapter(
            requiredUrl(
              "MASTER_DISTRIBUTOR_URL",
              env.MASTER_DISTRIBUTOR_URL ?? env.DISTRIBUTOR_URL ?? config.masterDistributorUrl,
            ),
          ),
          wallet: new RemoteFundzManAdapter(
            requiredUrl("FUNDZMAN_URL", env.FUNDZMAN_URL ?? "http://localhost:4200"),
          ),
        }
      : {
          trustId: new LocalTrustIdAdapter(),
          messaging: new LocalElfComMessagingAdapter(),
          storage: new LocalSovereignDriveAdapter(),
          jobs: new LocalJobDispatcherAdapter(),
          distributor: new LocalMasterDistributorClient(),
          wallet: new LocalFundzManAdapter(),
        };

  setLifeOsPrimitives(next);
  lifeOsContainer = next;
  return next;
}

export function getRegisteredLifeOsPrimitives(): LifeOsPrimitiveContainer {
  if (!lifeOsContainer) {
    return registerLifeOsPrimitives();
  }
  return lifeOsContainer;
}

/**
 * Boot: LifeOS 6-primitive container + HOS domain adapters (local|remote).
 */
export function registerLocalPrimitiveProvidersOrRemote(): void {
  registerLifeOsPrimitives();
  const mode: PrimitiveBindingMode =
    config.primitivesMode === "remote" ? "remote" : "local";
  if (mode === "remote") {
    registerRemotePrimitiveProviders();
  } else {
    registerLocalPrimitiveProviders();
  }
}
