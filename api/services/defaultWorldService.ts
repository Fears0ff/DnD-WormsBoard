import fs from "node:fs";
import path from "node:path";
import type { AppDatabase } from "../../db/connection";
import type { UserRow } from "../../db/schema";
import type { WorldDto } from "../../contracts/worlds";
import { countWorldEntities, listWorldRows } from "../repositories/worlds";
import { createWorld, importWorldWiki, listWorlds } from "./worldService";

const initializations = new WeakMap<AppDatabase, Promise<WorldDto>>();

function bundledWikiRoot(): string {
  const candidates = [
    path.resolve(import.meta.dirname, "public/wiki"),
    path.resolve(import.meta.dirname, "../../public/wiki"),
  ];
  const root = candidates.find((candidate) => fs.existsSync(path.join(candidate, "data.js")));
  if (!root) throw new Error("Встроенная Wiki не найдена в поставке");
  return root;
}

async function initialize(db: AppDatabase, user: UserRow): Promise<WorldDto> {
  const existing = listWorldRows(db);
  const primary = existing.find((world) => world.isPrimary) ?? existing[0];
  const world = primary ? listWorlds(db, user).find((item) => item.id === primary.id)! : createWorld(db, user, {
    name: "Прайм",
    comment: "Для Прайма",
    chronologyName: "Летосчисление Прайма",
    zeroYearName: "Нулевой год",
    isPrimary: true,
  });
  if (countWorldEntities(db, world.id) > 0) return world;

  const root = bundledWikiRoot();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")) as { images: string[] };
  await importWorldWiki(db, user, {
    worldId: world.id,
    dataJs: fs.readFileSync(path.join(root, "data.js"), "utf8"),
    imagePathsJs: fs.readFileSync(path.join(root, "imagePaths.js"), "utf8"),
    images: manifest.images.map((name) => ({
      path: `images/${name}`,
      dataBase64: fs.readFileSync(path.join(root, name)).toString("base64"),
    })),
  });
  return listWorlds(db, user).find((item) => item.id === world.id) ?? world;
}

export function ensureBundledWorld(db: AppDatabase, user: UserRow): Promise<WorldDto> {
  let initialization = initializations.get(db);
  if (!initialization) {
    initialization = initialize(db, user).catch((error) => {
      initializations.delete(db);
      throw error;
    });
    initializations.set(db, initialization);
  }
  return initialization;
}
