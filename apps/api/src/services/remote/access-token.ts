/**
 * Service-to-service bearer for remote LifeOS primitives.
 * Production should mint TrustID tokens; local/remote-dev uses a static token.
 */
export type AccessTokenFactory = () => Promise<string> | string;

export function createStaticTokenFactory(token: string): AccessTokenFactory {
  return () => token;
}

export async function resolveAccessToken(factory: AccessTokenFactory): Promise<string> {
  return await factory();
}
