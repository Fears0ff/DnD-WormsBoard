import type { Migration } from "./types";

/** Independent worlds, account-owned drafts, review and inherited permissions. */
const migration: Migration = {
  version: "0006",
  name: "worlds",
  sql: `
CREATE TABLE worlds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  chronology_name TEXT NOT NULL,
  zero_year_name TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX worlds_single_primary ON worlds (is_primary) WHERE is_primary = 1;
CREATE INDEX worlds_created_by_idx ON worlds (created_by);

CREATE TABLE world_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  parent_id INTEGER,
  faction_id INTEGER,
  author_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  race TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  status_text TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL DEFAULT '',
  month TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  era TEXT NOT NULL DEFAULT 'after',
  image_key TEXT REFERENCES media_assets(key) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT NOT NULL DEFAULT 'all',
  review_comment TEXT NOT NULL DEFAULT '',
  draft_of_id INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX world_entities_world_type_idx ON world_entities (world_id, type);
CREATE INDEX world_entities_parent_idx ON world_entities (parent_id);
CREATE INDEX world_entities_author_idx ON world_entities (author_id);
CREATE INDEX world_entities_review_idx ON world_entities (review_status);
CREATE INDEX world_entities_draft_of_idx ON world_entities (draft_of_id);

CREATE TABLE world_entity_maps (
  entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
  image_key TEXT NOT NULL REFERENCES media_assets(key),
  position INTEGER NOT NULL,
  PRIMARY KEY (entity_id, image_key)
);
CREATE INDEX world_maps_image_idx ON world_entity_maps (image_key);

CREATE TABLE world_event_characters (
  event_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, character_id)
);
CREATE INDEX world_event_character_idx ON world_event_characters (character_id);

CREATE TABLE world_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  entity_id INTEGER REFERENCES world_entities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_add INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX world_permissions_scope_idx ON world_permissions (world_id, entity_id);
CREATE INDEX world_permissions_user_idx ON world_permissions (user_id);
`,
};

export default migration;
