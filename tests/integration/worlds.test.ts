import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  expectTrpcError,
  newContext,
  registerUser,
  teardownTempDb,
  useTempDb,
  type TestDb,
} from "./helpers";

let testDb: TestDb;

beforeEach(() => {
  testDb = useTempDb();
});

afterEach(() => {
  teardownTempDb(testDb);
});

describe("bundled world wiki", () => {
  it("imports every supplied record and image into an empty world", async () => {
    const master = await registerUser("master");
    const session = await newContext(master.cookie);
    const world = await session.caller.worlds.create({
      name: "Прайм",
      comment: "Для Прайма",
      chronologyName: "Летосчисление Прайма",
      zeroYearName: "Нулевой год",
      isPrimary: true,
    });
    const wikiRoot = path.resolve("public/wiki");
    const manifest = JSON.parse(fs.readFileSync(path.join(wikiRoot, "manifest.json"), "utf8")) as { images: string[] };
    const input = {
      worldId: world.id,
      dataJs: fs.readFileSync(path.join(wikiRoot, "data.js"), "utf8"),
      imagePathsJs: fs.readFileSync(path.join(wikiRoot, "imagePaths.js"), "utf8"),
      images: manifest.images.map((name) => ({
        path: `images/${name}`,
        dataBase64: fs.readFileSync(path.join(wikiRoot, name)).toString("base64"),
      })),
    };

    const result = await session.caller.worlds.importWiki(input);
    const importedCount = Object.values(result.imported).reduce((sum, count) => sum + count, 0);
    expect(importedCount).toBe(492);
    expect(result.attachedImages).toBe(3);
    expect(result.skippedImages).toEqual([]);
    const snapshot = await session.caller.worlds.get({ id: world.id });
    expect(snapshot.entities).toHaveLength(importedCount);
    expect(snapshot.entities.filter((entity) => entity.mapKeys.length > 0)).toHaveLength(2);

    await expectTrpcError(session.caller.worlds.importWiki(input), "CONFLICT");
  }, 30_000);
});
