import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbHandle } from "../../db/connection";
import {
  users,
  worldEntities,
  worldEntityMaps,
  worldEventCharacters,
  worldPermissions,
  worlds,
  type WorldEntityRow,
  type WorldPermissionRow,
  type WorldRow,
} from "../../db/schema";
import type { WorldDto, WorldEntityType } from "../../contracts/worlds";

export function toWorldDto(db: DbHandle, row: WorldRow): WorldDto {
  return {
    id: row.id,
    name: row.name,
    comment: row.comment,
    chronologyName: row.chronologyName,
    zeroYearName: row.zeroYearName,
    isPrimary: row.isPrimary,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    reviewCount: db.select({ id: worldEntities.id }).from(worldEntities)
      .where(and(eq(worldEntities.worldId, row.id), eq(worldEntities.reviewStatus, "review"))).all().length,
  };
}

export function listWorldRows(db: DbHandle): WorldRow[] {
  return db.select().from(worlds).orderBy(desc(worlds.isPrimary), asc(worlds.name)).all();
}

export function findWorld(db: DbHandle, id: number): WorldRow | undefined {
  return db.select().from(worlds).where(eq(worlds.id, id)).get();
}

export function insertWorld(
  db: DbHandle,
  values: Omit<typeof worlds.$inferInsert, "createdAt" | "updatedAt">,
): WorldRow {
  const now = Date.now();
  return db.insert(worlds).values({ ...values, createdAt: now, updatedAt: now }).returning().get();
}

export function updateWorldRow(
  db: DbHandle,
  id: number,
  patch: Partial<Pick<WorldRow, "name" | "comment" | "chronologyName" | "zeroYearName">>,
): WorldRow | undefined {
  return db.update(worlds).set({ ...patch, updatedAt: Date.now() }).where(eq(worlds.id, id)).returning().get();
}

export function deleteWorldRow(db: DbHandle, id: number): void {
  db.delete(worlds).where(eq(worlds.id, id)).run();
}

export function listWorldEntityRows(db: DbHandle, worldId: number): WorldEntityRow[] {
  return db.select().from(worldEntities).where(eq(worldEntities.worldId, worldId))
    .orderBy(asc(worldEntities.type), asc(worldEntities.name), asc(worldEntities.id)).all();
}

export function findWorldEntity(db: DbHandle, id: number): WorldEntityRow | undefined {
  return db.select().from(worldEntities).where(eq(worldEntities.id, id)).get();
}

export function findOwnedDraft(db: DbHandle, publishedId: number, authorId: number): WorldEntityRow | undefined {
  return db.select().from(worldEntities).where(and(
    eq(worldEntities.draftOfId, publishedId), eq(worldEntities.authorId, authorId),
  )).get();
}

export function listEntityDrafts(db: DbHandle, id: number): WorldEntityRow[] {
  return db.select().from(worldEntities).where(eq(worldEntities.draftOfId, id)).all();
}

export function listEntityChildren(db: DbHandle, id: number): WorldEntityRow[] {
  return db.select().from(worldEntities).where(eq(worldEntities.parentId, id)).all();
}

export function insertWorldEntity(
  db: DbHandle,
  values: Omit<typeof worldEntities.$inferInsert, "createdAt" | "updatedAt" | "version">,
): WorldEntityRow {
  const now = Date.now();
  return db.insert(worldEntities).values({ ...values, createdAt: now, updatedAt: now }).returning().get();
}

export function updateWorldEntityRow(
  db: DbHandle,
  id: number,
  patch: Partial<Omit<WorldEntityRow, "id" | "createdAt" | "updatedAt" | "version">>,
): WorldEntityRow | undefined {
  return db.update(worldEntities).set({
    ...patch, version: sql`${worldEntities.version} + 1`, updatedAt: Date.now(),
  }).where(eq(worldEntities.id, id)).returning().get();
}

export function deleteWorldEntityRow(db: DbHandle, id: number): void {
  db.delete(worldEntities).where(eq(worldEntities.id, id)).run();
}

export function listMapKeys(db: DbHandle, entityId: number): string[] {
  return db.select({ key: worldEntityMaps.imageKey }).from(worldEntityMaps)
    .where(eq(worldEntityMaps.entityId, entityId)).orderBy(asc(worldEntityMaps.position)).all().map((row) => row.key);
}

export function replaceMapKeys(db: DbHandle, entityId: number, keys: string[]): void {
  db.delete(worldEntityMaps).where(eq(worldEntityMaps.entityId, entityId)).run();
  if (keys.length) {
    db.insert(worldEntityMaps).values([...new Set(keys)].map((imageKey, position) => ({ entityId, imageKey, position }))).run();
  }
}

export function listEventCharacterIds(db: DbHandle, eventId: number): number[] {
  return db.select({ id: worldEventCharacters.characterId }).from(worldEventCharacters)
    .where(eq(worldEventCharacters.eventId, eventId)).orderBy(asc(worldEventCharacters.characterId)).all().map((row) => row.id);
}

export function replaceEventCharacters(db: DbHandle, eventId: number, characterIds: number[]): void {
  db.delete(worldEventCharacters).where(eq(worldEventCharacters.eventId, eventId)).run();
  if (characterIds.length) {
    db.insert(worldEventCharacters).values([...new Set(characterIds)].map((characterId) => ({ eventId, characterId }))).run();
  }
}

export function copyEventCharacters(db: DbHandle, sourceId: number, targetId: number): void {
  replaceEventCharacters(db, targetId, listEventCharacterIds(db, sourceId));
}

export function listWorldPermissionRows(db: DbHandle, worldId: number): WorldPermissionRow[] {
  return db.select().from(worldPermissions).where(eq(worldPermissions.worldId, worldId)).orderBy(asc(worldPermissions.id)).all();
}

export function listUserPermissionRows(db: DbHandle, worldId: number, userId: number): WorldPermissionRow[] {
  return db.select().from(worldPermissions).where(and(
    eq(worldPermissions.worldId, worldId), eq(worldPermissions.userId, userId),
  )).all();
}

export function replaceWorldPermission(
  db: DbHandle,
  values: { worldId: number; entityId: number | null; userId: number; canAdd: boolean; canEdit: boolean },
): WorldPermissionRow {
  const condition = and(
    eq(worldPermissions.worldId, values.worldId),
    eq(worldPermissions.userId, values.userId),
    values.entityId === null ? isNull(worldPermissions.entityId) : eq(worldPermissions.entityId, values.entityId),
  );
  db.delete(worldPermissions).where(condition).run();
  return db.insert(worldPermissions).values({ ...values, createdAt: Date.now() }).returning().get();
}

export function deleteWorldPermission(db: DbHandle, id: number): void {
  db.delete(worldPermissions).where(eq(worldPermissions.id, id)).run();
}

export function authorNames(db: DbHandle, rows: WorldEntityRow[]): Map<number, string> {
  const ids = [...new Set(rows.map((row) => row.authorId))];
  if (!ids.length) return new Map();
  const authors = db.select({ id: users.id, name: users.displayName, login: users.loginNormalized })
    .from(users).where(inArray(users.id, ids)).all();
  return new Map(authors.map((author) => [author.id, author.name || author.login]));
}

export function countWorldEntities(db: DbHandle, worldId: number, type?: WorldEntityType): number {
  return db.select({ id: worldEntities.id }).from(worldEntities).where(type
    ? and(eq(worldEntities.worldId, worldId), eq(worldEntities.type, type))
    : eq(worldEntities.worldId, worldId)).all().length;
}
