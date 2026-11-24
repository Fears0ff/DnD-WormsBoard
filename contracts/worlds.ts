import { z } from "zod";
import { mediaKeySchema } from "./game";

export const worldEntityTypes = ["territory", "region", "city", "place", "character", "faction", "event"] as const;
export type WorldEntityType = (typeof worldEntityTypes)[number];
export type WorldReviewStatus = "draft" | "review" | "rejected" | "published";
export type WorldVisibility = "all" | "master";

const idSchema = z.number().int().positive();
const shortText = z.string().trim().max(500);
const nameSchema = z.string().trim().min(1).max(160);
const descriptionSchema = z.string().max(300_000);

export const worldCreateInputSchema = z.object({
  name: nameSchema,
  comment: shortText.default(""),
  chronologyName: nameSchema,
  zeroYearName: nameSchema,
  isPrimary: z.boolean().optional(),
});
export type WorldCreateInput = z.infer<typeof worldCreateInputSchema>;

export const worldUpdateInputSchema = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  comment: shortText.optional(),
  chronologyName: nameSchema.optional(),
  zeroYearName: nameSchema.optional(),
});

export const worldIdInputSchema = z.object({ id: idSchema });

export const worldEntityFieldsSchema = z.object({
  parentId: idSchema.nullable().default(null),
  factionId: idSchema.nullable().default(null),
  name: nameSchema,
  description: descriptionSchema.default(""),
  race: shortText.default(""),
  role: shortText.default(""),
  statusText: shortText.default(""),
  day: z.string().trim().max(20).default(""),
  month: z.string().trim().max(40).default(""),
  year: z.string().trim().max(40).default(""),
  era: z.enum(["before", "after"]).default("after"),
  imageKey: mediaKeySchema.nullable().default(null),
  mapKeys: z.array(mediaKeySchema).max(3).default([]),
  characterIds: z.array(idSchema).max(500).default([]),
  visibility: z.enum(["all", "master"]).default("all"),
});

export const worldEntityCreateInputSchema = worldEntityFieldsSchema.extend({
  worldId: idSchema,
  type: z.enum(worldEntityTypes),
});
export type WorldEntityCreateInput = z.infer<typeof worldEntityCreateInputSchema>;

export const worldEntityUpdateInputSchema = z.object({
  id: idSchema,
  parentId: idSchema.nullable().optional(),
  factionId: idSchema.nullable().optional(),
  name: nameSchema.optional(),
  description: descriptionSchema.optional(),
  race: shortText.optional(),
  role: shortText.optional(),
  statusText: shortText.optional(),
  day: z.string().trim().max(20).optional(),
  month: z.string().trim().max(40).optional(),
  year: z.string().trim().max(40).optional(),
  era: z.enum(["before", "after"]).optional(),
  imageKey: mediaKeySchema.nullable().optional(),
  mapKeys: z.array(mediaKeySchema).max(3).optional(),
  characterIds: z.array(idSchema).max(500).optional(),
  visibility: z.enum(["all", "master"]).optional(),
});
export type WorldEntityUpdateInput = z.infer<typeof worldEntityUpdateInputSchema>;

export const worldReviewInputSchema = z.object({ id: idSchema });
export const worldRejectInputSchema = z.object({
  id: idSchema,
  comment: z.string().trim().min(1).max(5000),
});
export const worldApproveInputSchema = z.object({
  id: idSchema,
  visibility: z.enum(["all", "master"]),
});

export const worldPermissionInputSchema = z.object({
  worldId: idSchema,
  entityId: idSchema.nullable(),
  userId: idSchema,
  canAdd: z.boolean(),
  canEdit: z.boolean(),
});

const wikiImageSchema = z.object({
  path: z.string().trim().min(1).max(500),
  dataBase64: z.string().min(8).max(21_000_000),
});
export const worldWikiImportInputSchema = z.object({
  worldId: idSchema,
  dataJs: z.string().min(2).max(5_000_000),
  imagePathsJs: z.string().min(2).max(1_000_000),
  images: z.array(wikiImageSchema).max(30).default([]),
});
export type WorldWikiImportInput = z.infer<typeof worldWikiImportInputSchema>;

export interface WorldDto {
  id: number;
  name: string;
  comment: string;
  chronologyName: string;
  zeroYearName: string;
  isPrimary: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  reviewCount: number;
}

export interface WorldEntityDto {
  id: number;
  worldId: number;
  type: WorldEntityType;
  parentId: number | null;
  factionId: number | null;
  authorId: number;
  authorName: string;
  name: string;
  description: string;
  race: string;
  role: string;
  statusText: string;
  day: string;
  month: string;
  year: string;
  era: "before" | "after";
  imageKey: string | null;
  mapKeys: string[];
  characterIds: number[];
  reviewStatus: WorldReviewStatus;
  visibility: WorldVisibility;
  reviewComment: string;
  draftOfId: number | null;
  version: number;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorldPermissionDto {
  id: number;
  worldId: number;
  entityId: number | null;
  userId: number;
  canAdd: boolean;
  canEdit: boolean;
}

export interface WorldSnapshotDto {
  world: WorldDto;
  entities: WorldEntityDto[];
  permissions: WorldPermissionDto[];
}

export interface WorldWikiImportResultDto {
  worldId: number;
  imported: Record<string, number>;
  attachedImages: number;
  skippedImages: string[];
}
