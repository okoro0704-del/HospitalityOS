import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";

export type MockTrustId = {
  baseUrl: string;
  jwksUrl: string;
  issueAssertion: (claims: {
    sub: string;
    aud: string;
    app_id?: string;
    scopes?: string[];
    display_name?: string;
    jti?: string;
    sid?: string;
    expSeconds?: number;
    device_trust?: "trusted" | "temporary" | "untrusted";
    issuer?: string;
  }) => Promise<string>;
  revokeJti: (jti: string) => void;
  markConsumed: (jti: string) => void;
  close: () => Promise<void>;
};

/**
 * Minimal TrustID stand-in for HospitalityOS assertion-exchange tests.
 * Serves JWKS, session introspection, and assertion consume.
 */
export async function startMockTrustId(): Promise<MockTrustId> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "trustid-key-test";
  jwk.alg = "EdDSA";
  jwk.use = "sig";

  const revoked = new Set<string>();
  const activeJtis = new Map<string, number>();
  const consumed = new Set<string>();

  async function issueAssertion(claims: {
    sub: string;
    aud: string;
    app_id?: string;
    scopes?: string[];
    display_name?: string;
    jti?: string;
    sid?: string;
    expSeconds?: number;
    device_trust?: "trusted" | "temporary" | "untrusted";
    issuer?: string;
    assertion_type?: "authentication" | "step_up";
    step_up_for?: string;
  }) {
    const jti = claims.jti ?? randomBytes(16).toString("hex");
    const sid = claims.sid ?? randomBytes(12).toString("hex");
    const expSeconds = claims.expSeconds ?? 120;
    activeJtis.set(jti, Date.now() + expSeconds * 1000);
    return new SignJWT({
      sid,
      app_id: claims.app_id ?? "app_hos",
      scopes: claims.scopes ?? ["openid", "profile"],
      display_name: claims.display_name,
      device_trust: claims.device_trust ?? "trusted",
      ver: "1",
      assertion_type: claims.assertion_type ?? "authentication",
      auth_time: Math.floor(Date.now() / 1000),
      ...(claims.step_up_for ? { step_up_for: claims.step_up_for } : {}),
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "trustid-key-test", typ: "JWT" })
      .setIssuer(claims.issuer ?? "trustid")
      .setSubject(claims.sub)
      .setAudience(claims.aud)
      .setIssuedAt()
      .setExpirationTime(`${expSeconds}s`)
      .setJti(jti)
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

    if (req.method === "GET" && url.pathname === "/.well-known/jwks.json") {
      res.end(JSON.stringify({ keys: [jwk as JWK] }));
      return;
    }

    const activeMatch = url.pathname.match(/^\/sessions\/([^/]+)\/active$/);
    if (req.method === "GET" && activeMatch) {
      const jti = decodeURIComponent(activeMatch[1]!);
      if (revoked.has(jti)) {
        res.end(JSON.stringify({ active: false, reason: "revoked" }));
        return;
      }
      const exp = activeJtis.get(jti);
      const active = !!exp && exp > Date.now();
      res.end(JSON.stringify({ active, reason: active ? undefined : "inactive" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/assertions/consume") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { jti?: string };
      if (!body.jti || !activeJtis.has(body.jti)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "unknown_jti" }));
        return;
      }
      if (consumed.has(body.jti) || revoked.has(body.jti)) {
        res.statusCode = 409;
        res.end(JSON.stringify({ error: "replay" }));
        return;
      }
      consumed.add(body.jti);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    jwksUrl: `${baseUrl}/.well-known/jwks.json`,
    issueAssertion,
    revokeJti: (jti: string) => {
      revoked.add(jti);
      activeJtis.delete(jti);
    },
    markConsumed: (jti: string) => consumed.add(jti),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
