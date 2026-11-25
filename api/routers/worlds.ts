import { authedProcedure, createRouter, masterProcedure } from "../middleware";
import {
  worldApproveInputSchema,
  worldCreateInputSchema,
  worldEntityCreateInputSchema,
  worldEntityUpdateInputSchema,
  worldIdInputSchema,
  worldPermissionInputSchema,
  worldRejectInputSchema,
  worldReviewInputSchema,
  worldUpdateInputSchema,
  worldWikiImportInputSchema,
} from "../../contracts/worlds";
import { getDb } from "../../db/connection";
import { ensureBundledWorld } from "../services/defaultWorldService";
import {
  approveWorldEntity,
  createWorld,
  createWorldEntity,
  getWorld,
  importWorldWiki,
  listWorlds,
  rejectWorldEntity,
  removeWorld,
  removeWorldEntity,
  removeWorldPermission,
  setWorldPermission,
  submitWorldEntity,
  updateWorld,
  updateWorldEntity,
} from "../services/worldService";

export const worldsRouter = createRouter({
  initialize: masterProcedure.mutation(({ ctx }) => ensureBundledWorld(getDb(), ctx.user)),
  list: authedProcedure.query(({ ctx }) => listWorlds(getDb(), ctx.user)),
  get: authedProcedure.input(worldIdInputSchema).query(({ ctx, input }) => getWorld(getDb(), ctx.user, input.id)),
  create: masterProcedure.input(worldCreateInputSchema).mutation(({ ctx, input }) => createWorld(getDb(), ctx.user, input)),
  update: masterProcedure.input(worldUpdateInputSchema).mutation(({ ctx, input }) => updateWorld(getDb(), ctx.user, input)),
  remove: masterProcedure.input(worldIdInputSchema).mutation(({ ctx, input }) => removeWorld(getDb(), ctx.user, input.id)),
  importWiki: masterProcedure.input(worldWikiImportInputSchema).mutation(({ ctx, input }) => importWorldWiki(getDb(), ctx.user, input)),

  createEntity: authedProcedure.input(worldEntityCreateInputSchema).mutation(({ ctx, input }) => createWorldEntity(getDb(), ctx.user, input)),
  updateEntity: authedProcedure.input(worldEntityUpdateInputSchema).mutation(({ ctx, input }) => updateWorldEntity(getDb(), ctx.user, input)),
  removeEntity: authedProcedure.input(worldReviewInputSchema).mutation(({ ctx, input }) => removeWorldEntity(getDb(), ctx.user, input.id)),
  submitReview: authedProcedure.input(worldReviewInputSchema).mutation(({ ctx, input }) => submitWorldEntity(getDb(), ctx.user, input.id)),
  approve: masterProcedure.input(worldApproveInputSchema).mutation(({ ctx, input }) => approveWorldEntity(getDb(), ctx.user, input)),
  reject: masterProcedure.input(worldRejectInputSchema).mutation(({ ctx, input }) => rejectWorldEntity(getDb(), ctx.user, input.id, input.comment)),

  setPermission: masterProcedure.input(worldPermissionInputSchema).mutation(({ ctx, input }) => setWorldPermission(getDb(), ctx.user, input)),
  removePermission: masterProcedure.input(worldReviewInputSchema).mutation(({ ctx, input }) => removeWorldPermission(getDb(), ctx.user, input.id)),
});
