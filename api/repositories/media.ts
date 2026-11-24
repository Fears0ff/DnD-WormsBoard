import { and, eq, lt, sql } from "drizzle-orm";
import type { DbHandle } from "../../db/connection";
import {
  boards,
  characters,
  compendiumItems,
  mediaAssets,
  tokens,
  worldEntities,
  worldEntityMaps,
  type MediaAssetRow,
} from "../../db/schema";
import type { MediaAssetDto } from "../../contracts/media";

type Db = DbHandle;

/** Safe DTO (plan §5.1): keys only, never URLs. */
export function toMediaAssetDto(
  row: MediaAssetRow,
  width: number,
  height: number,
): MediaAssetDto {
  return {
    key: row.key,
    backend: row.backend,
    mime: row.mime as MediaAssetDto["mime"],
    size: row.size,
    width,
    height,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function findMediaAsset(db: Db, key: string): MediaAssetRow | undefined {
  return db.select().from(mediaAssets).where(eq(mediaAssets.key, key)).get();
}

export function insertMediaAsset(
  db: Db,
  values: Omit<typeof mediaAssets.$inferInsert, "createdAt">,
): MediaAssetRow {
  return db
    .insert(mediaAssets)
    .values({ ...values, createdAt: Date.now() })
    .returning()
    .get();
}

/**
 * Number of live references to a media key. References exist ONLY in the
 * explicit columns boards.background_key, tokens.image_key,
 * compendium_items.image_key and characters.portrait_key.
 */
export function countMediaReferences(db: Db, key: string): number {
  const viaBoards = db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.backgroundKey, key))
    .all().length;
  const viaTokens = db
    .select({ id: tokens.id })
    .from(tokens)
    .where(eq(tokens.imageKey, key))
    .all().length;
  const viaCompendium = db
    .select({ id: compendiumItems.id })
    .from(compendiumItems)
    .where(eq(compendiumItems.imageKey, key))
    .all().length;
  const viaCharacters = db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.portraitKey, key))
    .all().length;
  const viaWorldEntities = db
    .select({ id: worldEntities.id })
    .from(worldEntities)
    .where(eq(worldEntities.imageKey, key))
    .all().length;
  const viaWorldMaps = db
    .select({ entityId: worldEntityMaps.entityId })
    .from(worldEntityMaps)
    .where(eq(worldEntityMaps.imageKey, key))
    .all().length;
  return viaBoards + viaTokens + viaCompendium + viaCharacters + viaWorldEntities + viaWorldMaps;
}

// Raw SQL is used for the NOT EXISTS anti-joins: Drizzle has no type-safe
// equivalent for correlated subqueries (plan §3.1 allows raw SQL here).
const unreferencedSql = (keyColumn: typeof mediaAssets.key) => sql`
  NOT EXISTS (SELECT 1 FROM ${boards} WHERE ${boards.backgroundKey} = ${keyColumn})
  AND NOT EXISTS (SELECT 1 FROM ${tokens} WHERE ${tokens.imageKey} = ${keyColumn})
  AND NOT EXISTS (SELECT 1 FROM ${compendiumItems} WHERE ${compendiumItems.imageKey} = ${keyColumn})
  AND NOT EXISTS (SELECT 1 FROM ${characters} WHERE ${characters.portraitKey} = ${keyColumn})
  AND NOT EXISTS (SELECT 1 FROM ${worldEntities} WHERE ${worldEntities.imageKey} = ${keyColumn})
  AND NOT EXISTS (SELECT 1 FROM ${worldEntityMaps} WHERE ${worldEntityMaps.imageKey} = ${keyColumn})
`;

/** Assets with no live references created before cutoffMs (orphan cleanup). */
export function listUnreferencedAssetsOlderThan(
  db: Db,
  cutoffMs: number,
): MediaAssetRow[] {
  return db
    .select()
    .from(mediaAssets)
    .where(and(lt(mediaAssets.createdAt, cutoffMs), unreferencedSql(mediaAssets.key)))
    .all();
}

/**
 * Deletes the row ONLY when it is still unreferenced — the check and the
 * delete run as one statement, so a reference created concurrently with the
 * cleanup can never be orphaned. Returns true when the row was deleted.
 */
export function deleteMediaAssetRowIfUnreferenced(db: Db, key: string): boolean {
  const res = db
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.key, key), unreferencedSql(mediaAssets.key)))
    .run();
  return Number(res.changes) > 0;
}

export function isWorldMediaVisible(db: Db, key: string, userId: number, isMaster: boolean): boolean {
  if (isMaster) return true;
  const direct = db.select().from(worldEntities).where(eq(worldEntities.imageKey, key)).all();
  const maps = db.select({ entityId: worldEntityMaps.entityId }).from(worldEntityMaps)
    .where(eq(worldEntityMaps.imageKey, key)).all();
  const viaMaps = maps.flatMap((map) => {
    const row = db.select().from(worldEntities).where(eq(worldEntities.id, map.entityId)).get();
    return row ? [row] : [];
  });
  const references = [...direct, ...viaMaps];
  if (references.length === 0) return true;
  return references.some((row) => row.authorId === userId || (row.reviewStatus === "published" && row.visibility === "all"));
}

export function deleteMediaAssetRow(db: Db, key: string): void {
  db.delete(mediaAssets).where(eq(mediaAssets.key, key)).run();
}
