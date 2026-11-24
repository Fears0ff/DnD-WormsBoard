import { TRPCError } from "@trpc/server";
import type { AppDatabase, DbHandle } from "../../db/connection";
import { eq } from "drizzle-orm";
import { worldEntities as worldEntitiesTable, worlds as worldsTable, type UserRow, type WorldEntityRow, type WorldRow } from "../../db/schema";
import type {
  worldApproveInputSchema,
  WorldDto,
  WorldEntityCreateInput,
  WorldEntityDto,
  WorldEntityUpdateInput,
  WorldPermissionDto,
  WorldSnapshotDto,
  WorldWikiImportInput,
  WorldWikiImportResultDto,
} from "../../contracts/worlds";
import type { z } from "zod";
import {
  authorNames,
  copyEventCharacters,
  countWorldEntities,
  deleteWorldEntityRow,
  deleteWorldPermission,
  deleteWorldRow,
  findOwnedDraft,
  findWorld,
  findWorldEntity,
  insertWorld,
  insertWorldEntity,
  listEntityChildren,
  listEntityDrafts,
  listEventCharacterIds,
  listMapKeys,
  listUserPermissionRows,
  listWorldEntityRows,
  listWorldPermissionRows,
  listWorldRows,
  replaceEventCharacters,
  replaceMapKeys,
  replaceWorldPermission,
  toWorldDto,
  updateWorldEntityRow,
  updateWorldRow,
} from "../repositories/worlds";
import { uploadImage } from "./mediaService";

type ApproveInput = z.infer<typeof worldApproveInputSchema>;

const locationTypes = new Set(["territory", "region", "city", "place"]);

function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "Запись мира не найдена" });
}

function forbidden(message = "Недостаточно прав"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function requireMaster(user: UserRow): void {
  if (user.gameRole !== "master") forbidden("Требуется роль мастера");
}

function requireWorld(db: DbHandle, id: number): WorldRow {
  const world = findWorld(db, id);
  if (!world) notFound();
  return world;
}

function isVisible(row: WorldEntityRow, user: UserRow): boolean {
  if (user.gameRole === "master" || row.authorId === user.id) return true;
  return row.reviewStatus === "published" && row.visibility === "all";
}

function requireVisibleEntity(db: DbHandle, id: number, user: UserRow): WorldEntityRow {
  const row = findWorldEntity(db, id);
  if (!row || !isVisible(row, user)) notFound();
  return row;
}

function ancestorIds(db: DbHandle, entityId: number | null): Array<number | null> {
  const result: Array<number | null> = [null];
  const seen = new Set<number>();
  let current = entityId ? findWorldEntity(db, entityId) : undefined;
  while (current && !seen.has(current.id)) {
    result.push(current.id);
    seen.add(current.id);
    current = current.parentId ? findWorldEntity(db, current.parentId) : undefined;
  }
  return result;
}

function hasPermission(
  db: DbHandle,
  user: UserRow,
  worldId: number,
  entityId: number | null,
  kind: "canAdd" | "canEdit",
): boolean {
  if (user.gameRole === "master") return true;
  const scopes = new Set(ancestorIds(db, entityId));
  return listUserPermissionRows(db, worldId, user.id).some((permission) =>
    scopes.has(permission.entityId) && permission[kind]
  );
}

function toEntityDto(
  db: DbHandle,
  row: WorldEntityRow,
  user: UserRow,
  authors: Map<number, string>,
): WorldEntityDto {
  const ownDraft = row.reviewStatus !== "published" && row.authorId === user.id;
  const canEdit = user.gameRole === "master" || ownDraft || (row.reviewStatus === "published" && hasPermission(db, user, row.worldId, row.id, "canEdit"));
  const visibleReference = (id: number | null): number | null => {
    if (!id) return null;
    const related = findWorldEntity(db, id);
    return related && isVisible(related, user) ? id : null;
  };
  const visibleCharacterIds = row.type === "event"
    ? listEventCharacterIds(db, row.id).filter((id) => visibleReference(id) !== null)
    : [];
  return {
    id: row.id,
    worldId: row.worldId,
    type: row.type,
    parentId: visibleReference(row.parentId),
    factionId: visibleReference(row.factionId),
    authorId: row.authorId,
    authorName: authors.get(row.authorId) ?? `Пользователь #${row.authorId}`,
    name: row.name,
    description: row.description,
    race: row.race,
    role: row.role,
    statusText: row.statusText,
    day: row.day,
    month: row.month,
    year: row.year,
    era: row.era,
    imageKey: row.imageKey,
    mapKeys: listMapKeys(db, row.id),
    characterIds: visibleCharacterIds,
    reviewStatus: row.reviewStatus,
    visibility: row.visibility,
    reviewComment: row.reviewComment,
    draftOfId: row.draftOfId,
    version: row.version,
    isMine: row.authorId === user.id,
    canEdit,
    canDelete: canEdit,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function validateRelations(db: DbHandle, user: UserRow, input: {
  worldId: number; type: WorldEntityRow["type"]; parentId?: number | null; factionId?: number | null; characterIds?: number[];
}): void {
  const parent = input.parentId ? requireVisibleEntity(db, input.parentId, user) : null;
  if (parent && parent.worldId !== input.worldId) throw new TRPCError({ code: "BAD_REQUEST", message: "Локация принадлежит другому миру" });
  const expectedParent: Partial<Record<WorldEntityRow["type"], string[]>> = {
    region: ["territory"], city: ["region"], place: ["city"], character: ["city", "place"], event: ["city", "place"],
  };
  if (input.type === "territory" || input.type === "faction") {
    if (input.parentId) throw new TRPCError({ code: "BAD_REQUEST", message: "У этой записи не может быть родительской локации" });
  } else if (["region", "city", "place"].includes(input.type)) {
    if (!parent || !expectedParent[input.type]?.includes(parent.type)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Неверный родительский уровень" });
    }
  } else if (parent && !expectedParent[input.type]?.includes(parent.type)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Здесь допустимы только город или место" });
  }
  if (input.factionId) {
    const faction = requireVisibleEntity(db, input.factionId, user);
    if (faction.worldId !== input.worldId || faction.type !== "faction") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Неверная фракция" });
    }
  }
  for (const characterId of input.characterIds ?? []) {
    const character = requireVisibleEntity(db, characterId, user);
    if (character.worldId !== input.worldId || character.type !== "character") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Неверный участник события" });
    }
  }
}

function patchFromInput(input: WorldEntityUpdateInput): Partial<WorldEntityRow> {
  return {
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    ...(input.factionId !== undefined ? { factionId: input.factionId } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.race !== undefined ? { race: input.race } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.statusText !== undefined ? { statusText: input.statusText } : {}),
    ...(input.day !== undefined ? { day: input.day } : {}),
    ...(input.month !== undefined ? { month: input.month } : {}),
    ...(input.year !== undefined ? { year: input.year } : {}),
    ...(input.era !== undefined ? { era: input.era } : {}),
    ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
  };
}

export function listWorlds(db: DbHandle, user: UserRow): WorldDto[] {
  return listWorldRows(db).map((row) => {
    const dto = toWorldDto(db, row);
    return user.gameRole === "master" ? dto : { ...dto, reviewCount: 0 };
  });
}

export function getWorld(db: DbHandle, user: UserRow, id: number): WorldSnapshotDto {
  const world = requireWorld(db, id);
  const rows = listWorldEntityRows(db, id).filter((row) => isVisible(row, user));
  const authors = authorNames(db, rows);
  const permissions: WorldPermissionDto[] = user.gameRole === "master"
    ? listWorldPermissionRows(db, id).map((row) => ({ ...row }))
    : [];
  const worldDto = toWorldDto(db, world);
  return {
    world: user.gameRole === "master" ? worldDto : { ...worldDto, reviewCount: 0 },
    entities: rows.map((row) => toEntityDto(db, row, user, authors)),
    permissions,
  };
}

export function createWorld(db: AppDatabase, user: UserRow, input: {
  name: string; comment: string; chronologyName: string; zeroYearName: string; isPrimary?: boolean;
}): WorldDto {
  requireMaster(user);
  return db.transaction((tx) => {
    if (input.isPrimary) tx.update(worldsTable).set({ isPrimary: false, updatedAt: Date.now() }).run();
    const row = insertWorld(tx, { ...input, isPrimary: input.isPrimary ?? false, createdBy: user.id });
    return toWorldDto(tx, row);
  });
}

export function updateWorld(db: AppDatabase, user: UserRow, input: {
  id: number; name?: string; comment?: string; chronologyName?: string; zeroYearName?: string;
}): WorldDto {
  requireMaster(user);
  requireWorld(db, input.id);
  const row = updateWorldRow(db, input.id, input);
  if (!row) notFound();
  return toWorldDto(db, row);
}

export function removeWorld(db: AppDatabase, user: UserRow, id: number): { removedId: number } {
  requireMaster(user);
  const world = requireWorld(db, id);
  if (world.isPrimary) throw new TRPCError({ code: "BAD_REQUEST", message: "Основной мир нельзя удалить" });
  deleteWorldRow(db, id);
  return { removedId: id };
}

export function createWorldEntity(
  db: AppDatabase,
  user: UserRow,
  input: WorldEntityCreateInput,
): WorldEntityDto {
  requireWorld(db, input.worldId);
  validateRelations(db, user, input);
  if (input.parentId && !hasPermission(db, user, input.worldId, input.parentId, "canAdd")) {
    const parent = findWorldEntity(db, input.parentId);
    if (!parent || (parent.reviewStatus === "published" && parent.authorId !== user.id)) {
      forbidden("Для добавления в эту ветку нужно разрешение мастера");
    }
  }
  return db.transaction((tx) => {
    const master = user.gameRole === "master";
    const row = insertWorldEntity(tx, {
      worldId: input.worldId,
      type: input.type,
      parentId: input.parentId,
      factionId: input.factionId,
      authorId: user.id,
      name: input.name,
      description: input.description,
      race: input.race,
      role: input.role,
      statusText: input.statusText,
      day: input.day,
      month: input.month,
      year: input.year,
      era: input.era,
      imageKey: input.imageKey,
      visibility: input.visibility,
      reviewStatus: master ? "published" : "draft",
    });
    replaceMapKeys(tx, row.id, locationTypes.has(row.type) ? input.mapKeys : []);
    if (row.type === "event") replaceEventCharacters(tx, row.id, input.characterIds);
    return toEntityDto(tx, row, user, authorNames(tx, [row]));
  });
}

export function updateWorldEntity(
  db: AppDatabase,
  user: UserRow,
  input: WorldEntityUpdateInput,
): WorldEntityDto {
  return db.transaction((tx) => {
    const row = requireVisibleEntity(tx, input.id, user);
    const patch = patchFromInput(input);
    if (user.gameRole !== "master" && row.reviewStatus !== "published" && row.authorId !== user.id) forbidden();
    if (row.reviewStatus === "published" && !hasPermission(tx, user, row.worldId, row.id, "canEdit")) forbidden();
    const next = { ...row, ...patch };
    validateRelations(tx, user, {
      worldId: row.worldId,
      type: row.type,
      parentId: next.parentId,
      factionId: next.factionId,
      characterIds: input.characterIds,
    });

    let target = row;
    if (user.gameRole !== "master" && row.reviewStatus === "published") {
      target = findOwnedDraft(tx, row.id, user.id) ?? insertWorldEntity(tx, {
        worldId: row.worldId,
        type: row.type,
        parentId: row.parentId,
        factionId: row.factionId,
        authorId: user.id,
        name: row.name,
        description: row.description,
        race: row.race,
        role: row.role,
        statusText: row.statusText,
        day: row.day,
        month: row.month,
        year: row.year,
        era: row.era,
        imageKey: row.imageKey,
        visibility: row.visibility,
        reviewStatus: "draft",
        draftOfId: row.id,
      });
    }
    const updated = updateWorldEntityRow(tx, target.id, {
      ...patch,
      ...(target.reviewStatus === "rejected" ? { reviewStatus: "draft", reviewComment: "" } : {}),
    });
    if (!updated) notFound();
    if (input.mapKeys !== undefined) replaceMapKeys(tx, updated.id, locationTypes.has(updated.type) ? input.mapKeys : []);
    if (input.characterIds !== undefined && updated.type === "event") replaceEventCharacters(tx, updated.id, input.characterIds);
    if (target.id !== row.id && input.mapKeys === undefined) replaceMapKeys(tx, target.id, listMapKeys(tx, row.id));
    if (target.id !== row.id && input.characterIds === undefined && row.type === "event") copyEventCharacters(tx, row.id, target.id);
    return toEntityDto(tx, updated, user, authorNames(tx, [updated]));
  });
}

export function submitWorldEntity(db: AppDatabase, user: UserRow, id: number): WorldEntityDto {
  const row = requireVisibleEntity(db, id, user);
  if (row.authorId !== user.id || row.reviewStatus === "published") forbidden("Отправить можно только собственный черновик");
  const updated = updateWorldEntityRow(db, id, { reviewStatus: "review", reviewComment: "" });
  if (!updated) notFound();
  return toEntityDto(db, updated, user, authorNames(db, [updated]));
}

export function approveWorldEntity(db: AppDatabase, user: UserRow, input: ApproveInput): WorldEntityDto {
  requireMaster(user);
  return db.transaction((tx) => {
    const draft = requireVisibleEntity(tx, input.id, user);
    if (draft.reviewStatus !== "review") throw new TRPCError({ code: "BAD_REQUEST", message: "Запись не ожидает ревью" });
    if (draft.draftOfId) {
      const published = findWorldEntity(tx, draft.draftOfId);
      if (!published) notFound();
      const updated = updateWorldEntityRow(tx, published.id, {
        parentId: draft.parentId,
        factionId: draft.factionId,
        name: draft.name,
        description: draft.description,
        race: draft.race,
        role: draft.role,
        statusText: draft.statusText,
        day: draft.day,
        month: draft.month,
        year: draft.year,
        era: draft.era,
        imageKey: draft.imageKey,
        visibility: input.visibility,
        reviewComment: "",
      });
      if (!updated) notFound();
      replaceMapKeys(tx, published.id, listMapKeys(tx, draft.id));
      if (draft.type === "event") copyEventCharacters(tx, draft.id, published.id);
      deleteWorldEntityRow(tx, draft.id);
      return toEntityDto(tx, updated, user, authorNames(tx, [updated]));
    }
    const updated = updateWorldEntityRow(tx, draft.id, {
      reviewStatus: "published", visibility: input.visibility, reviewComment: "",
    });
    if (!updated) notFound();
    return toEntityDto(tx, updated, user, authorNames(tx, [updated]));
  });
}

export function rejectWorldEntity(db: AppDatabase, user: UserRow, id: number, comment: string): WorldEntityDto {
  requireMaster(user);
  const row = requireVisibleEntity(db, id, user);
  if (row.reviewStatus !== "review") throw new TRPCError({ code: "BAD_REQUEST", message: "Запись не ожидает ревью" });
  const updated = updateWorldEntityRow(db, id, { reviewStatus: "rejected", reviewComment: comment });
  if (!updated) notFound();
  return toEntityDto(db, updated, user, authorNames(db, [updated]));
}

export function removeWorldEntity(db: AppDatabase, user: UserRow, id: number): { removedId: number } {
  return db.transaction((tx) => {
    const row = requireVisibleEntity(tx, id, user);
    const ownDraft = row.reviewStatus !== "published" && row.authorId === user.id;
    if (!ownDraft && !hasPermission(tx, user, row.worldId, row.id, "canEdit")) forbidden();
    if (locationTypes.has(row.type) && listEntityChildren(tx, row.id).length > 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Сначала переместите или удалите дочерние записи" });
    }
    for (const draft of listEntityDrafts(tx, id)) deleteWorldEntityRow(tx, draft.id);
    if (row.type === "faction") {
      tx.update(worldEntitiesTable).set({ factionId: null }).where(eq(worldEntitiesTable.factionId, id)).run();
    }
    deleteWorldEntityRow(tx, id);
    return { removedId: id };
  });
}

export function setWorldPermission(
  db: AppDatabase,
  user: UserRow,
  input: { worldId: number; entityId: number | null; userId: number; canAdd: boolean; canEdit: boolean },
): WorldPermissionDto {
  requireMaster(user);
  requireWorld(db, input.worldId);
  if (input.entityId) {
    const entity = findWorldEntity(db, input.entityId);
    if (!entity || entity.worldId !== input.worldId) notFound();
  }
  const row = replaceWorldPermission(db, input);
  return { ...row };
}

export function removeWorldPermission(db: AppDatabase, user: UserRow, id: number): { removedId: number } {
  requireMaster(user);
  deleteWorldPermission(db, id);
  return { removedId: id };
}

interface WikiRecord {
  id: string; name?: string; title?: string; description?: string; masterOnly?: boolean;
  territoryId?: string; regionId?: string; cityId?: string; placeId?: string | null;
  faction?: string | null; race?: string; role?: string; status?: string;
  day?: string; month?: string; year?: string; era?: string; characterIds?: string[];
}
interface WikiData {
  territories: WikiRecord[]; regions: WikiRecord[]; cities: WikiRecord[]; places: WikiRecord[];
  characters: WikiRecord[]; factions: WikiRecord[]; events: WikiRecord[];
}

function parseAssignedJson(source: string, variable: string): unknown {
  const match = source.match(new RegExp(`window\\.${variable}\\s*=\\s*([\\s\\S]*?);?\\s*$`));
  if (!match?.[1]) throw new TRPCError({ code: "BAD_REQUEST", message: `Не найден объект window.${variable}` });
  try { return JSON.parse(match[1].replace(/;\s*$/, "")); }
  catch { throw new TRPCError({ code: "BAD_REQUEST", message: `Файл ${variable} содержит неверный JSON` }); }
}

function requireWikiData(value: unknown): WikiData {
  const data = value as Partial<WikiData> | null;
  const keys: Array<keyof WikiData> = ["territories", "regions", "cities", "places", "characters", "factions", "events"];
  if (!data || keys.some((key) => !Array.isArray(data[key]))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "В Wiki отсутствуют обязательные списки" });
  }
  for (const key of keys) {
    for (const item of data[key]!) {
      if (!item || typeof item.id !== "string" || typeof (item.name ?? item.title) !== "string") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Неверная запись в списке ${key}` });
      }
    }
  }
  return data as WikiData;
}

export async function importWorldWiki(
  db: AppDatabase,
  user: UserRow,
  input: WorldWikiImportInput,
): Promise<WorldWikiImportResultDto> {
  requireMaster(user);
  requireWorld(db, input.worldId);
  if (countWorldEntities(db, input.worldId) > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "Импорт возможен только в пустой мир" });
  }
  const data = requireWikiData(parseAssignedJson(input.dataJs, "WIKI_DATA"));
  const paths = parseAssignedJson(input.imagePathsJs, "IMAGE_PATHS") as Record<string, Record<string, string>>;
  const supplied = new Map(input.images.map((image) => [image.path, image.dataBase64]));
  const uploaded = new Map<string, string>();
  const referenced = new Set<string>();
  for (const group of Object.values(paths)) {
    if (group && typeof group === "object") for (const path of Object.values(group)) if (typeof path === "string") referenced.add(path);
  }
  for (const path of referenced) {
    const dataBase64 = supplied.get(path);
    if (dataBase64) uploaded.set(path, (await uploadImage(db, user, { dataBase64, purpose: "world" })).key);
  }

  return db.transaction((tx) => {
    if (countWorldEntities(tx, input.worldId) > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Импорт возможен только в пустой мир" });
    }
    const ids = new Map<string, number>();
    const imported: Record<string, number> = {};
    const groups: Array<[keyof WikiData, WorldEntityRow["type"]]> = [
      ["territories", "territory"], ["regions", "region"], ["cities", "city"], ["places", "place"],
      ["factions", "faction"], ["characters", "character"], ["events", "event"],
    ];
    for (const [key, type] of groups) {
      imported[key] = 0;
      for (const item of data[key]) {
        const parentOldId = type === "region" ? item.territoryId : type === "city" ? item.regionId
          : type === "place" || type === "character" || type === "event" ? item.placeId || item.cityId : undefined;
        const parentId = parentOldId ? ids.get(parentOldId) : undefined;
        if (parentOldId && parentId === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Не найдена родительская запись для «${item.name ?? item.title}»` });
        }
        if (["region", "city", "place"].includes(type) && parentId === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Не указана родительская локация для «${item.name ?? item.title}»` });
        }
        const factionId = item.faction ? ids.get(item.faction) : undefined;
        if (item.faction && factionId === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Не найдена фракция для «${item.name ?? item.title}»` });
        }
        const eventCharacterIds = type === "event" ? item.characterIds?.map((id) => ids.get(id)) : undefined;
        if (eventCharacterIds?.some((id) => id === undefined)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Не найден участник события «${item.name ?? item.title}»` });
        }
        const imagePath = paths[type]?.[item.id];
        const row = insertWorldEntity(tx, {
          worldId: input.worldId,
          type,
          parentId: parentId ?? null,
          factionId: factionId ?? null,
          authorId: user.id,
          name: item.name ?? item.title ?? "Без названия",
          description: item.description ?? "",
          race: item.race ?? "",
          role: item.role ?? "",
          statusText: item.status ?? "",
          day: item.day ?? "",
          month: item.month ?? "",
          year: item.year ?? "",
          era: item.era === "ДО" ? "before" : "after",
          imageKey: imagePath ? uploaded.get(imagePath) ?? null : null,
          reviewStatus: "published",
          visibility: item.masterOnly ? "master" : "all",
        });
        ids.set(item.id, row.id);
        imported[key] += 1;
        if (eventCharacterIds?.length) {
          replaceEventCharacters(tx, row.id, eventCharacterIds as number[]);
        }
      }
    }
    return {
      worldId: input.worldId,
      imported,
      attachedImages: uploaded.size,
      skippedImages: [...referenced].filter((path) => !uploaded.has(path)),
    };
  });
}
