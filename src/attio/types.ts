export interface AttioListEntryId {
  workspace_id: string;
  list_id: string;
  entry_id: string;
}

export interface AttioListEntry {
  id: AttioListEntryId;
  parent_record_id: string;
  parent_object: string;
  created_at: string;
  entry_values: Record<string, unknown[]>;
}

export interface AttioPersonRecordId {
  workspace_id: string;
  object_id: string;
  record_id: string;
}

export interface AttioPersonRecord {
  id: AttioPersonRecordId;
  created_at: string;
  values: Record<string, unknown[]>;
}

export interface AttioListAttribute {
  id: { attribute_id: string };
  api_slug: string;
  type: string;
  is_unique: boolean;
}
