import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import type { AddressInfo } from "node:net";

export type MockLifeOs = {
  baseUrl: string;
  jwksUrl: string;
  issueToken: (claims: {
    sub: string;
    aud: string;
    experience_id: string;
    business_id: string;
    scopes?: string[];
    display_name?: string;
    jti?: string;
    sid?: string;
    expSeconds?: number;
  }) => Promise<string>;
  setHandoff: (handoff: string, experienceId: string, token: string) => void;
  revokeJti: (jti: string) => void;
  close: () => Promise<void>;
};

/**
 * Minimal LifeOS stand-in for HospitalityOS integration tests.
 * Implements exchange, introspect, and JWKS per the experience-session protocol.
 */
export async function startMockLifeOs(): Promise<MockLifeOs> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "lifeos-key-test";
  jwk.alg = "EdDSA";
  jwk.use = "sig";

  const handoffs = new Map<string, { experienceId: string; token: string; used: boolean }>();
  const revoked = new Set<string>();
  const activeJtis = new Set<string>();

  async function issueToken(claims: {
    sub: string;
    aud: string;
    experience_id: string;
    business_id: string;
    scopes?: string[];
    display_name?: string;
    jti?: string;
    sid?: string;
    expSeconds?: number;
  }) {
    const jti = claims.jti ?? `jti_${crypto.randomUUID()}`;
    const sid = claims.sid ?? `sid_${crypto.randomUUID()}`;
    activeJtis.add(jti);
    return new SignJWT({
      sid,
      jti,
      experience_id: claims.experience_id,
      business_id: claims.business_id,
      scopes: claims.scopes ?? ["profile.basic"],
      display_name: claims.display_name,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "lifeos-key-test", typ: "JWT" })
      .setIssuer("lifeos")
      .setSubject(claims.sub)
      .setAudience(claims.aud)
      .setIssuedAt()
      .setExpirationTime(`${claims.expSeconds ?? 300}s`)
      .sign(privateKey);
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("content-type", "application/json");

    if (req.method === "GET" && url.pathname === "/.well-known/experience-keys") {
      res.end(JSON.stringify({ keys: [jwk as JWK] }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/experience-sessions/exchange") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { handoff?: string; experienceId?: string };
      const entry = body.handoff ? handoffs.get(body.handoff) : undefined;
      if (!entry) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "invalid_token", message: "Unknown handoff" }));
        return;
      }
      if (entry.used) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "replay_detected", message: "Handoff already used" }));
        return;
      }
      if (entry.experienceId !== body.experienceId) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "wrong_audience", message: "Experience mismatch" }));
        return;
      }
      entry.used = true;
      res.end(
        JSON.stringify({
          token: entry.token,
          token_type: "Bearer",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
          session_id: "mock_session",
          scopes: ["profile.basic"],
        }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/experience-sessions/introspect") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { jti?: string };
      if (!body.jti || !activeJtis.has(body.jti)) {
        res.end(JSON.stringify({ active: false, reason: "unknown" }));
        return;
      }
      if (revoked.has(body.jti)) {
        res.end(JSON.stringify({ active: false, reason: "revoked" }));
        return;
      }
      res.end(JSON.stringify({ active: true }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    jwksUrl: `${baseUrl}/.well-known/experience-keys`,
    issueToken,
    setHandoff(handoff, experienceId, token) {
      handoffs.set(handoff, { experienceId, token, used: false });
    },
    revokeJti(jti) {
      revoked.add(jti);
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
