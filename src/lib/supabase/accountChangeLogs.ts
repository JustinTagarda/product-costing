export type DbAccountChangeLogRow = {
  id: string;
  owner_user_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  table_name: string;
  row_id: string | null;
  action: "insert" | "update" | "delete";
  changed_fields: unknown;
  created_at: string;
};

export type AccountChangeLogEntry = {
  id: string;
  ownerUserId: string;
  actorUserId: string | null;
  actorEmail: string;
  tableName: string;
  rowId: string | null;
  action: "insert" | "update" | "delete";
  changedFields: string[];
  createdAt: string;
};

export function rowToAccountChangeLog(row: DbAccountChangeLogRow): AccountChangeLogEntry {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    actorUserId: row.actor_user_id,
    actorEmail: (row.actor_email || "").trim().toLowerCase() || "system",
    tableName: row.table_name,
    rowId: row.row_id,
    action: row.action,
    changedFields: Array.isArray(row.changed_fields)
      ? row.changed_fields.filter((field): field is string => typeof field === "string")
      : [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}
