import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
let dbApi;
let authApi;
let accountA;
let accountB;
const originalDataDir = process.env.DATA_DIR;

async function boot() {
  dbApi = await import("@/lib/db/index.js");
  authApi = await import("@/sse/services/auth.js");
}

async function createCodexAccount(name, priority) {
  return dbApi.createProviderConnection({
    provider: "codex",
    authType: "oauth",
    name,
    email: `${name.toLowerCase().replaceAll(" ", "-")}@example.com`,
    priority,
    isActive: true,
    accessToken: `access-${name}`,
    refreshToken: `refresh-${name}`,
  });
}

async function createAuthenticatedClient(name) {
  const created = await dbApi.createClientToken(name);
  const client = await dbApi.getClientTokenByValue(created.token);
  return { created, client };
}

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-client-routing-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
  await boot();
  accountA = await createCodexAccount("Account A", 1);
  accountB = await createCodexAccount("Account B", 2);
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("client token account affinity", () => {
  it("routes TOKEN_1 to Account A", async () => {
    const { created, client } = await createAuthenticatedClient("PC 1");
    await dbApi.setClientAccountBinding(created.id, "codex", accountA.id);

    const credentials = await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: client });

    expect(credentials.connectionId).toBe(accountA.id);
    expect(credentials.routingBound).toBe(true);
  });

  it("routes TOKEN_2 to Account B", async () => {
    const { created, client } = await createAuthenticatedClient("PC 2");
    await dbApi.setClientAccountBinding(created.id, "codex", accountB.id);

    const credentials = await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: client });

    expect(credentials.connectionId).toBe(accountB.id);
  });

  it("returns a bound-account error instead of using another account when Account A is disabled", async () => {
    const { created, client } = await createAuthenticatedClient("PC 1");
    await dbApi.setClientAccountBinding(created.id, "codex", accountA.id);
    await dbApi.updateProviderConnection(accountA.id, { isActive: false });

    const result = await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: client });

    expect(result.boundError.code).toBe("BOUND_ACCOUNT_DISABLED");
    expect(result.boundAccountId).toBe(accountA.id);
    expect(result.connectionId).toBeUndefined();
  });

  it("keeps existing account selection for an unbound client token", async () => {
    const { client } = await createAuthenticatedClient("Unbound PC");

    const credentials = await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: client });

    expect(credentials.connectionId).toBe(accountA.id);
    expect(credentials.routingBound).toBeUndefined();
  });

  it("uses a changed binding on the next request", async () => {
    const { created, client } = await createAuthenticatedClient("Switchable PC");
    await dbApi.setClientAccountBinding(created.id, "codex", accountA.id);
    expect((await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: client })).connectionId).toBe(accountA.id);

    await dbApi.setClientAccountBinding(created.id, "codex", accountB.id);

    expect((await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: client })).connectionId).toBe(accountB.id);
  });

  it("persists bindings across a database restart", async () => {
    const { created } = await createAuthenticatedClient("Persistent PC");
    await dbApi.setClientAccountBinding(created.id, "codex", accountA.id);
    global._dbAdapter.instance.close?.();
    delete global._dbAdapter;
    vi.resetModules();
    await boot();

    const binding = await dbApi.getClientAccountBinding(created.id, "codex");

    expect(binding.accountId).toBe(accountA.id);
  });

  it("denies a disabled client token and never stores its raw value", async () => {
    const { created } = await createAuthenticatedClient("Disabled PC");
    await dbApi.updateClientToken(created.id, { isActive: false });
    const request = new Request("http://localhost/v1/chat/completions", {
      headers: { Authorization: `Bearer ${created.token}` },
    });

    const authentication = await authApi.authenticateApiRequest(request, { requireApiKey: false });
    const adapter = await import("@/lib/db/driver.js").then((module) => module.getAdapter());
    const stored = adapter.get(`SELECT key, tokenHash FROM apiKeys WHERE id = ?`, [created.id]);

    expect(authentication.error.code).toBe("CLIENT_TOKEN_DISABLED");
    expect(stored.key).not.toContain(created.token);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it("rotates a client token without storing the raw replacement", async () => {
    const { created } = await createAuthenticatedClient("Rotating PC");
    const rotated = await dbApi.rotateClientToken(created.id);

    expect(rotated.token).toMatch(/^9r_[A-Za-z0-9_-]+$/);
    expect(rotated.token).not.toBe(created.token);
    expect((await dbApi.getClientTokenByValue(created.token))).toBeNull();
    expect((await dbApi.getClientTokenByValue(rotated.token)).id).toBe(created.id);

    const adapter = await import("@/lib/db/driver.js").then((module) => module.getAdapter());
    const stored = adapter.get(`SELECT key, tokenHash FROM apiKeys WHERE id = ?`, [created.id]);
    expect(stored.key).not.toContain(rotated.token);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it("keeps concurrent clients on their configured accounts", async () => {
    const token1 = await createAuthenticatedClient("Concurrent PC 1");
    const token2 = await createAuthenticatedClient("Concurrent PC 2");
    await dbApi.setClientAccountBinding(token1.created.id, "codex", accountA.id);
    await dbApi.setClientAccountBinding(token2.created.id, "codex", accountB.id);

    const [credentials1, credentials2] = await Promise.all([
      authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: token1.client }),
      authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: token2.client }),
    ]);

    expect(credentials1.connectionId).toBe(accountA.id);
    expect(credentials2.connectionId).toBe(accountB.id);
  });

  it("tracks two client tokens on the same account independently", async () => {
    const token1 = await createAuthenticatedClient("Shared Account PC 1");
    const token2 = await createAuthenticatedClient("Shared Account PC 2");
    await dbApi.setClientAccountBinding(token1.created.id, "codex", accountA.id);
    await dbApi.setClientAccountBinding(token2.created.id, "codex", accountA.id);

    const credentials1 = await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: token1.client });
    const credentials2 = await authApi.getProviderCredentials("codex", null, "gpt-5", { authenticatedClient: token2.client });
    dbApi.trackPendingRequest("gpt-5", "codex", accountA.id, true, false, credentials1.clientTokenId);

    const { activeClientTokens } = await dbApi.getActiveRequests();

    expect(credentials1.connectionId).toBe(accountA.id);
    expect(credentials2.connectionId).toBe(accountA.id);
    expect(activeClientTokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientTokenId: token1.created.id, connectionId: accountA.id, count: 1 }),
    ]));
    expect(activeClientTokens.some((request) => request.clientTokenId === token2.created.id)).toBe(false);

    dbApi.trackPendingRequest("gpt-5", "codex", accountA.id, false, false, credentials1.clientTokenId);
  });
});
