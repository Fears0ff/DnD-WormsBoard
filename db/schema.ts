import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * DnD Board schema (SQLite / better-sqlite3).
 *
 * There is intentionally no `tables` entity: one installation holds exactly
 * one game space. Timestamps are stored as integer unix milliseconds and are
 * exposed through the API as ISO strings (mapping happens in repositories).
 * JSON columns are used only for variable-structure payloads (character sheet,
 * compendium card data, per-board initiative list); everything that takes
 * part in rights, relations or invariants is a real column.
 *
 * The DDL source of truth that is actually applied at runtime lives in
 * db/migrations/*.ts (embedded SQL, so it survives the esbuild server bundle).
 * Keep this file and those migrations in sync; drizzle-kit can diff/generate
 * against this schema via drizzle.config.ts.
 */

const createdAt = () => integer("created_at").notNull();
const updatedAt = () => integer("updated_at").notNull();

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Technical identity for the platform adapter: local:<loginNormalized>.
    unionId: text("union_id").notNull().unique(),
    loginNormalized: text("login_normalized").notNull().unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    gameRole: text("game_role", { enum: ["master", "player"] })
      .notNull()
      .default("player"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_game_role", sql`${t.gameRole} IN ('master','player')`)],
);

/** Singleton row (id = 1) holding monotonically increasing state revisions. */
export const appMeta = sqliteTable(
  "app_meta",
  {
    id: integer("id").primaryKey(),
    gameRevision: integer("game_revision").notNull().default(0),
    compendiumRevision: integer("compendium_revision").notNull().default(0),
  },
  (t) => [check("app_meta_singleton", sql`${t.id} = 1`)],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    // Storage key, doubles as the object-store key. The only string PK.
    key: text("key").primaryKey(),
    backend: text("backend", { enum: ["local", "platform"] }).notNull(),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => users.id),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("media_backend", sql`${t.backend} IN ('local','platform')`),
    index("media_assets_uploaded_by_idx").on(t.uploadedBy),
  ],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("campaigns_single_active")
      .on(t.isActive)
      .where(sql`${t.isActive} = 1`),
  ],
);

export const boards = sqliteTable(
  "boards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: integer("campaign_id")
      .notNull()
      .default(1)
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    backgroundKey: text("background_key").references(
      () => mediaAssets.key,
      { onDelete: "set null" },
    ),
    cellSize: integer("cell_size").notNull().default(64),
    gridWidth: integer("grid_width").notNull().default(30),
    gridHeight: integer("grid_height").notNull().default(20),
    // JSON array of { tokenId, value } for this board.
    initiative: text("initiative").notNull().default("[]"),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("boards_campaign_idx").on(t.campaignId),
    // Invariant: at most one globally active board; its campaign must be active.
    uniqueIndex("boards_single_active")
      .on(t.isActive)
      .where(sql`${t.isActive} = 1`),
    check(
      "boards_grid_bounds",
      sql`${t.gridWidth} BETWEEN 1 AND 500 AND ${t.gridHeight} BETWEEN 1 AND 500 AND ${t.cellSize} BETWEEN 4 AND 1024`,
    ),
  ],
);

export const characters = sqliteTable(
  "characters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // JSON character sheet including its sheetVersion.
    data: text("data").notNull(),
    portraitKey: text("portrait_key").references(() => mediaAssets.key, {
      onDelete: "set null",
    }),
    // Optimistic concurrency version.
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("characters_owner_idx").on(t.ownerId)],
);

export const compendiumItems = sqliteTable(
  "compendium_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: [
        "spell",
        "item",
        "monster",
        "character",
        "species",
        "class",
        "feat",
        "background",
      ],
    }).notNull(),
    name: text("name").notNull(),
    source: text("source").notNull().default(""),
    isMagic: integer("is_magic", { mode: "boolean" })
      .notNull()
      .default(false),
    visibility: text("visibility", { enum: ["private", "shared"] })
      .notNull()
      .default("private"),
    // NULL only for imported shared cards.
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    imageKey: text("image_key").references(() => mediaAssets.key, {
      onDelete: "set null",
    }),
    // JSON payload of the concrete card type.
    data: text("data").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("compendium_type_idx").on(t.type),
    index("compendium_visibility_idx").on(t.visibility),
    index("compendium_created_by_idx").on(t.createdBy),
  ],
);

export const tokens = sqliteTable(
  "tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    boardId: integer("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["hero", "monster", "prop"] })
      .notNull()
      .default("prop"),
    label: text("label").notNull().default(""),
    ownerId: integer("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    characterId: integer("character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    compendiumId: integer("compendium_id").references(
      () => compendiumItems.id,
      { onDelete: "set null" },
    ),
    cellX: integer("cell_x").notNull().default(0),
    cellY: integer("cell_y").notNull().default(0),
    hp: integer("hp").notNull().default(0),
    maxHp: integer("max_hp").notNull().default(0),
    // Token footprint in grid squares.
    size: real("size").notNull().default(1),
    invisible: integer("invisible", { mode: "boolean" }).notNull().default(false),
    imageKey: text("image_key").references(() => mediaAssets.key, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tokens_board_idx").on(t.boardId),
    index("tokens_owner_idx").on(t.ownerId),
    check(
      "tokens_hp_bounds",
      sql`${t.hp} >= 0 AND ${t.maxHp} >= 0 AND ${t.hp} <= ${t.maxHp}`,
    ),
    check(
      "tokens_refs_exclusive",
      sql`NOT (${t.characterId} IS NOT NULL AND ${t.compendiumId} IS NOT NULL)`,
    ),
    // A compendium-bound token takes its image from the card.
    check(
      "tokens_compendium_image",
      sql`NOT (${t.compendiumId} IS NOT NULL AND ${t.imageKey} IS NOT NULL)`,
    ),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notes_user_idx").on(t.userId)],
);

export const noteShares = sqliteTable(
  "note_shares",
  {
    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.userId] }),
    index("note_shares_user_idx").on(t.userId),
  ],
);

export const worlds = sqliteTable(
  "worlds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    comment: text("comment").notNull().default(""),
    chronologyName: text("chronology_name").notNull(),
    zeroYearName: text("zero_year_name").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("worlds_single_primary").on(t.isPrimary).where(sql`${t.isPrimary} = 1`),
    index("worlds_created_by_idx").on(t.createdBy),
  ],
);

export const worldEntities = sqliteTable(
  "world_entities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    worldId: integer("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["territory", "region", "city", "place", "character", "faction", "event"],
    }).notNull(),
    parentId: integer("parent_id"),
    factionId: integer("faction_id"),
    authorId: integer("author_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    race: text("race").notNull().default(""),
    role: text("role").notNull().default(""),
    statusText: text("status_text").notNull().default(""),
    day: text("day").notNull().default(""),
    month: text("month").notNull().default(""),
    year: text("year").notNull().default(""),
    era: text("era", { enum: ["before", "after"] }).notNull().default("after"),
    imageKey: text("image_key").references(() => mediaAssets.key, { onDelete: "set null" }),
    reviewStatus: text("review_status", { enum: ["draft", "review", "rejected", "published"] })
      .notNull().default("draft"),
    visibility: text("visibility", { enum: ["all", "master"] }).notNull().default("all"),
    reviewComment: text("review_comment").notNull().default(""),
    draftOfId: integer("draft_of_id"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("world_entities_world_type_idx").on(t.worldId, t.type),
    index("world_entities_parent_idx").on(t.parentId),
    index("world_entities_author_idx").on(t.authorId),
    index("world_entities_review_idx").on(t.reviewStatus),
    index("world_entities_draft_of_idx").on(t.draftOfId),
  ],
);

export const worldEntityMaps = sqliteTable(
  "world_entity_maps",
  {
    entityId: integer("entity_id").notNull().references(() => worldEntities.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull().references(() => mediaAssets.key),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.imageKey] }), index("world_maps_image_idx").on(t.imageKey)],
);

export const worldEventCharacters = sqliteTable(
  "world_event_characters",
  {
    eventId: integer("event_id").notNull().references(() => worldEntities.id, { onDelete: "cascade" }),
    characterId: integer("character_id").notNull().references(() => worldEntities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.characterId] }), index("world_event_character_idx").on(t.characterId)],
);

export const worldPermissions = sqliteTable(
  "world_permissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    worldId: integer("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
    entityId: integer("entity_id").references(() => worldEntities.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    canAdd: integer("can_add", { mode: "boolean" }).notNull().default(false),
    canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("world_permissions_scope_idx").on(t.worldId, t.entityId), index("world_permissions_user_idx").on(t.userId)],
);

export type WorldRow = typeof worlds.$inferSelect;
export type WorldEntityRow = typeof worldEntities.$inferSelect;
export type WorldPermissionRow = typeof worldPermissions.$inferSelect;

export type UserRow = typeof users.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;
export type BoardRow = typeof boards.$inferSelect;
export type TokenRow = typeof tokens.$inferSelect;
export type AppMetaRow = typeof appMeta.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
export type CompendiumItemRow = typeof compendiumItems.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type MediaAssetRow = typeof mediaAssets.$inferSelect;
