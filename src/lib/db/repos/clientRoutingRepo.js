import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { getProviderConnectionById } from "./connectionsRepo.js";

const CLIENT_TOKEN_PREFIX = "9r_";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return `${CLIENT_TOKEN_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

function tokenPrefix(token) {
  return token.length > 12 ? `${token.slice(0, 8)}...${token.slice(-4)}` : token;
}

function safeTokenRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix || null,
    tokenType: row.tokenType || "api",
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt,
    lastUsedAt: row.lastUsedAt || null,
  };
}

function bindingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientTokenId: row.clientTokenId,
    provider: row.provider,
    accountId: row.accountId,
    enabled: row.enabled === 1 || row.enabled === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    account: row.accountName || row.accountEmail
      ? { id: row.accountId, name: row.accountName || row.accountEmail || row.accountId, provider: row.accountProvider }
      : null,
  };
}

export function isClientTokenValue(token) {
  return typeof token === "string" && token.startsWith(CLIENT_TOKEN_PREFIX);
}

export function maskClientToken(token) {
  return tokenPrefix(token);
}

export async function createClientToken(name) {
  const db = await getAdapter();
  const token = generateToken();
  const now = new Date().toISOString();
  const id = uuidv4();
  const hash = hashToken(token);
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt, updatedAt, tokenHash, tokenPrefix, tokenType, lastUsedAt)
     VALUES(?, ?, ?, NULL, 1, ?, ?, ?, ?, 'client', NULL)`,
    [id, `client:${hash}`, name, now, now, hash, tokenPrefix(token)]
  );
  return { ...safeTokenRow({ id, name, tokenPrefix: tokenPrefix(token), tokenType: "client", isActive: 1, createdAt: now, updatedAt: now }), token };
}

export async function rotateClientToken(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ? AND tokenType = 'client'`, [id]);
  if (!row) return null;

  const token = generateToken();
  const now = new Date().toISOString();
  const hash = hashToken(token);
  const prefix = tokenPrefix(token);
  db.run(
    `UPDATE apiKeys
        SET key = ?, tokenHash = ?, tokenPrefix = ?, updatedAt = ?, lastUsedAt = NULL
      WHERE id = ? AND tokenType = 'client'`,
    [`client:${hash}`, hash, prefix, now, id]
  );

  return { ...safeTokenRow({ ...row, tokenPrefix: prefix, updatedAt: now, lastUsedAt: null }), token };
}

export async function getClientTokens() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys WHERE tokenType = 'client' ORDER BY createdAt ASC`);
  return rows.map(safeTokenRow);
}

export async function getClientTokenById(id) {
  const db = await getAdapter();
  return safeTokenRow(db.get(`SELECT * FROM apiKeys WHERE id = ? AND tokenType = 'client'`, [id]));
}

export async function getClientTokenByValue(token) {
  if (!isClientTokenValue(token)) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE tokenType = 'client' AND tokenHash = ?`, [hashToken(token)]);
  if (!row) return null;
  const now = new Date().toISOString();
  db.run(`UPDATE apiKeys SET lastUsedAt = ?, updatedAt = ? WHERE id = ?`, [now, now, row.id]);
  return safeTokenRow({ ...row, lastUsedAt: now, updatedAt: now });
}

export async function updateClientToken(id, data = {}) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ? AND tokenType = 'client'`, [id]);
  if (!row) return null;
  const name = data.name === undefined ? row.name : String(data.name).trim();
  if (!name) throw new Error("name is required");
  const isActive = data.isActive === undefined ? row.isActive : (data.isActive ? 1 : 0);
  const updatedAt = new Date().toISOString();
  db.run(`UPDATE apiKeys SET name = ?, isActive = ?, updatedAt = ? WHERE id = ?`, [name, isActive, updatedAt, id]);
  return safeTokenRow({ ...row, name, isActive, updatedAt });
}

export async function deleteClientToken(id) {
  const db = await getAdapter();
  const result = db.transaction(() => {
    db.run(`DELETE FROM clientAccountBindings WHERE clientTokenId = ?`, [id]);
    return db.run(`DELETE FROM apiKeys WHERE id = ? AND tokenType = 'client'`, [id]);
  });
  return (result?.changes || 0) > 0;
}

export async function getClientAccountBindings(clientTokenId) {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT b.*, c.provider AS accountProvider, c.name AS accountName, c.email AS accountEmail
       FROM clientAccountBindings b
       LEFT JOIN providerConnections c ON c.id = b.accountId
      WHERE b.clientTokenId = ?
      ORDER BY b.provider ASC`,
    [clientTokenId]
  );
  return rows.map(bindingRow);
}

export async function getClientAccountBinding(clientTokenId, provider) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM clientAccountBindings WHERE clientTokenId = ? AND provider = ?`, [clientTokenId, provider]);
  return bindingRow(row);
}

export async function setClientAccountBinding(clientTokenId, provider, accountId) {
  const token = await getClientTokenById(clientTokenId);
  if (!token) throw new Error("Client token not found");
  const account = await getProviderConnectionById(accountId);
  if (!account || account.provider !== provider) throw new Error("Account does not belong to provider");

  const db = await getAdapter();
  const now = new Date().toISOString();
  const id = uuidv4();
  db.run(
    `INSERT INTO clientAccountBindings(id, clientTokenId, provider, accountId, enabled, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(clientTokenId, provider) DO UPDATE SET accountId = excluded.accountId, enabled = 1, updatedAt = excluded.updatedAt`,
    [id, clientTokenId, provider, accountId, now, now]
  );
  return getClientAccountBinding(clientTokenId, provider);
}

export async function deleteClientAccountBinding(clientTokenId, provider) {
  const db = await getAdapter();
  const result = db.run(`DELETE FROM clientAccountBindings WHERE clientTokenId = ? AND provider = ?`, [clientTokenId, provider]);
  return (result?.changes || 0) > 0;
}

export async function getClientAssignmentsByAccount(accountIds = []) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) return {};
  const db = await getAdapter();
  const placeholders = accountIds.map(() => "?").join(",");
  const rows = db.all(
    `SELECT b.accountId, t.id AS clientTokenId, t.name, t.tokenPrefix
       FROM clientAccountBindings b
       JOIN apiKeys t ON t.id = b.clientTokenId AND t.tokenType = 'client'
      WHERE b.enabled = 1 AND t.isActive = 1 AND b.accountId IN (${placeholders})
      ORDER BY t.name ASC`,
    accountIds
  );
  return rows.reduce((out, row) => {
    (out[row.accountId] ||= []).push({ id: row.clientTokenId, name: row.name, tokenPrefix: row.tokenPrefix });
    return out;
  }, {});
}

export { hashToken };
