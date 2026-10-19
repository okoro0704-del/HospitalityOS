import { resolveAccessToken, type AccessTokenFactory } from "./access-token.js";

export interface MasterDistributorClientOptions {
  /** Base URL of Master Distributor, e.g. http://localhost:3100 */
  baseUrl: string;
  getAccessToken: AccessTokenFactory;
  fetchFn?: typeof fetch;
}

export type DistributorDomainStatus = "PENDING" | "PROVISIONING" | "ACTIVE" | "FAILED";

export interface BootstrapTenantInput {
  slug: string;
  displayName: string;
  vertical?: "hospitality" | string;
  primaryDomain?: string;
  metadata?: Record<string, unknown>;
}

export interface BootstrapTenantResult {
  tenantId: string;
  slug: string;
  domainStatus: DistributorDomainStatus;
  dnsStatus?: string;
  sslStatus?: string;
}

/**
 * Control-plane client for Master Distributor (`/v1/distributor`).
 * Used for tenant domain provisioning — not a domain vertical concern.
 */
export class MasterDistributorClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenFactory;
  private readonly fetchFn: typeof fetch;

  constructor(opts: MasterDistributorClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.getAccessToken = opts.getAccessToken;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async bootstrapTenant(input: BootstrapTenantInput): Promise<BootstrapTenantResult> {
    const token = await resolveAccessToken(this.getAccessToken);
    const res = await this.fetchFn(`${this.baseUrl}/v1/distributor/tenants/bootstrap`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug: input.slug,
        displayName: input.displayName,
        vertical: input.vertical ?? "hospitality",
        primaryDomain: input.primaryDomain,
        metadata: input.metadata,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Master Distributor bootstrap failed (${res.status}): ${text}`);
    }

    return (await res.json()) as BootstrapTenantResult;
  }

  async getDomainStatus(tenantId: string): Promise<{
    tenantId: string;
    domainStatus: DistributorDomainStatus;
    dnsStatus: string;
    sslStatus: string;
  }> {
    const token = await resolveAccessToken(this.getAccessToken);
    const res = await this.fetchFn(
      `${this.baseUrl}/v1/distributor/tenants/${encodeURIComponent(tenantId)}/domain-status`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Master Distributor domain-status failed (${res.status}): ${text}`);
    }

    return (await res.json()) as {
      tenantId: string;
      domainStatus: DistributorDomainStatus;
      dnsStatus: string;
      sslStatus: string;
    };
  }
}
