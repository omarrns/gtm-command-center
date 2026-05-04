import type {
  Database as GeneratedDatabase,
  Json as GeneratedJson,
} from "../../../supabase/generated/database.types";

export type Database = GeneratedDatabase;
export type Json = GeneratedJson;

type PublicSchema = Database["public"];
type PublicTables = PublicSchema["Tables"];
type PublicTableName = keyof PublicTables;

export type TableRow<T extends PublicTableName> = PublicTables[T]["Row"];
export type TableInsert<T extends PublicTableName> = PublicTables[T]["Insert"];
export type TableUpdate<T extends PublicTableName> = PublicTables[T]["Update"];

export function asJson(value: unknown): Json {
  return value as Json;
}
