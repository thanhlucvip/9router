import { TABLES, buildCreateTableSql } from "../schema.js";

const migration = {
  version: 2,
  name: "client-routing",
  up(db) {
    // Existing API keys stay valid. New client tokens use the additive hash
    // columns and keep a non-secret marker in the legacy key column.
    for (const column of ["updatedAt", "tokenHash", "tokenPrefix", "tokenType", "lastUsedAt"]) {
      const definition = TABLES.apiKeys.columns[column];
      try { db.exec(`ALTER TABLE apiKeys ADD COLUMN ${column} ${definition}`); } catch {}
    }
    db.exec(buildCreateTableSql("clientAccountBindings", TABLES.clientAccountBindings));
    for (const idx of TABLES.clientAccountBindings.indexes || []) db.exec(idx);
    for (const idx of TABLES.apiKeys.indexes || []) db.exec(idx);
  },
};

export default migration;
