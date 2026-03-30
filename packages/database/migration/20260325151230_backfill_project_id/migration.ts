import { logger } from "@formbricks/logger";
import type { MigrationScript } from "../../src/scripts/migration-runner";

// Table names are from a hardcoded const array, not user input.
// $executeRawUnsafe is required because Postgres does not support parameterized identifiers.
const TABLES_TO_BACKFILL = [
  "Survey",
  "Contact",
  "ActionClass",
  "ContactAttributeKey",
  "Webhook",
  "Tag",
  "Segment",
  "Integration",
  "ApiKeyEnvironment",
] as const;

export const backfillProjectId: MigrationScript = {
  type: "data",
  id: "snae9apsx7e74yo9ncmhjl47",
  name: "20260325151230_backfill_project_id",
  run: async ({ tx }) => {
    for (const table of TABLES_TO_BACKFILL) {
      const updatedRows = await tx.$executeRawUnsafe(`
        UPDATE "${table}" t
        SET "projectId" = e."projectId"
        FROM "Environment" e
        WHERE t."environmentId" = e."id"
          AND t."projectId" IS NULL
      `);

      logger.info(`Backfilled ${updatedRows.toString()} rows in ${table}`);
    }

    // Verify no rows were missed.
    // Any remaining NULL projectId indicates orphaned rows (environmentId references a
    // non-existent Environment). The FK cascade should prevent this, but we check anyway.
    const failures: string[] = [];
    for (const table of TABLES_TO_BACKFILL) {
      const nullCount: [{ count: bigint }] = await tx.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "${table}" WHERE "projectId" IS NULL
      `);

      if (nullCount[0].count > 0n) {
        failures.push(`${table}: ${nullCount[0].count.toString()} rows with NULL projectId`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Backfill verification failed:\n${failures.join("\n")}`);
    }
  },
};
