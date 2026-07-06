import { migrateEmptyStrategyTeamConfigs } from "./agent-team-migration.js";

const result = await migrateEmptyStrategyTeamConfigs();
console.warn(`Agent team config migration inspected ${String(result.inspected)} strategies and migrated ${String(result.migrated)}.`);
