import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { BookOpen, ChevronRight, Globe2, Map, Plus, Settings, Shield, Upload, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { boardImageUrl } from "@/lib/media";
import { trpcErrorMessage } from "@/lib/api";
import type { UserDto } from "@/lib/game-contract";
import type { WorldDto, WorldEntityDto, WorldEntityType, WorldSnapshotDto } from "@contracts/worlds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorldEntityDialog } from "./WorldEntityDialog";
import { WorldPermissionsDialog } from "./WorldPermissionsDialog";
import { WorldWikiImportDialog } from "./WorldWikiImportDialog";
import { EntityDetails, invalidateWorlds, WorldFormDialog, WorldSettingsDialog, WORLD_TYPE_LABELS } from "./WorldsDialog";

export function WorldsPage({ me }: { me: UserDto }) {
  const isMaster = me.gameRole === "master";
  const initialize = trpc.worlds.initialize.useMutation();
  const initializeMutate = initialize.mutate;
  useEffect(() => {
    if (isMaster) initializeMutate(undefined, { onSettled: invalidateWorlds });
  }, [isMaster, initializeMutate]);
  const worldsQuery = trpc.worlds.list.useQuery(undefined, {
    enabled: !isMaster || initialize.isSuccess || initialize.isError,
    refetchOnWindowFocus: true,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const worlds = useMemo(() => worldsQuery.data ?? [], [worldsQuery.data]);
  const world = worlds.find((item) => item.id === selectedId)
    ?? worlds.find((item) => item.isPrimary)
    ?? worlds[0];

  if (isMaster && initialize.isPending) return <div className="wiki-page"><div className="wiki-loading">Создаём и наполняем мир «Прайм»…</div></div>;
  if (isMaster && initialize.isError) return <div className="wiki-page"><div className="wiki-loading"><p>{trpcErrorMessage(initialize.error, "Не удалось подготовить мир")}</p><Button className="mt-4" onClick={() => initialize.mutate(undefined, { onSettled: invalidateWorlds })}>Повторить</Button></div></div>;
  if (worldsQuery.isLoading) return <div className="wiki-page"><div className="wiki-loading">Загрузка мира…</div></div>;
  if (worldsQuery.isError) return <div className="wiki-page"><div className="wiki-loading">{trpcErrorMessage(worldsQuery.error, "Мир недоступен")}</div></div>;

  return <div className="wiki-page">
    <header className="wiki-header">
      <Link to="/worlds" className="wiki-brand"><BookOpen /> {world?.name ?? "Миры"}</Link>
      <nav className="wiki-top-actions">
        {worlds.length > 1 ? <Select value={String(world?.id)} onValueChange={(value) => setSelectedId(Number(value))}><SelectTrigger className="wiki-world-select"><SelectValue /></SelectTrigger><SelectContent>{worlds.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select> : null}
        {isMaster ? <button onClick={() => setCreateOpen(true)}><Plus /> Новый мир</button> : null}
        <Link to="/table"><Map /> Доска</Link>
      </nav>
    </header>
    {world ? <WorldBrowser key={world.id} world={world} me={me} /> : <div className="wiki-loading">Миры пока не созданы.</div>}
    <WorldFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setSelectedId} />
  </div>;
}

type Page = "home" | "characters" | "factions" | "review";

function WorldBrowser({ world, me }: { world: WorldDto; me: UserDto }) {
  const snapshotQuery = trpc.worlds.get.useQuery({ id: world.id }, { refetchInterval: 4000, refetchOnWindowFocus: true });
  const [page, setPage] = useState<Page>("home");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ type: WorldEntityType; entity?: WorldEntityDto } | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMaster = me.gameRole === "master";
  const snapshot = snapshotQuery.data;
  const selected = snapshot?.entities.find((entity) => entity.id === selectedId) ?? null;

  const navigate = (next: Page) => { setPage(next); setSelectedId(null); setSearch(""); };
  if (snapshotQuery.isLoading || !snapshot) return <div className="wiki-loading">Загрузка энциклопедии…</div>;
  if (snapshotQuery.isError) return <div className="wiki-loading">{trpcErrorMessage(snapshotQuery.error, "Не удалось загрузить мир")}</div>;

  return <>
    <div className="wiki-subheader">
      <nav>
        <button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}><Globe2 /> Главная</button>
        <button className={page === "characters" ? "active" : ""} onClick={() => navigate("characters")}><Users /> Персонажи</button>
        <button className={page === "factions" ? "active" : ""} onClick={() => navigate("factions")}><Shield /> Фракции</button>
        {isMaster ? <button className={page === "review" ? "active" : ""} onClick={() => navigate("review")}>Ревью ({snapshot.world.reviewCount})</button> : null}
      </nav>
      <div className="wiki-master-actions">
        <button onClick={() => setEditor({ type: page === "characters" ? "character" : page === "factions" ? "faction" : "territory" })}><Plus /> Добавить</button>
        {isMaster ? <><button onClick={() => setPermissionsOpen(true)}><Shield /> Права</button><button onClick={() => setImportOpen(true)}><Upload /> Импорт</button><button onClick={() => setSettingsOpen(true)} aria-label="Настройки"><Settings /></button></> : null}
      </div>
    </div>
    <div className="wiki-layout">
      <main className="wiki-main">
        {selected ? <button className="wiki-back" onClick={() => setSelectedId(null)}>← Назад</button> : null}
        <div className="wiki-breadcrumb"><span>{world.name}</span><ChevronRight /><span>{selected?.name ?? (page === "home" ? "Территории" : page === "characters" ? "Персонажи" : page === "factions" ? "Фракции" : "Ревью")}</span></div>
        {selected ? <div className="wiki-detail"><EntityDetails snapshot={snapshot} entity={selected} me={me} onSelect={setSelectedId} onEdit={() => setEditor({ type: selected.type, entity: selected })} onDeleted={() => setSelectedId(null)} /></div> : <>
          <Input className="wiki-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по миру…" />
          <EntityCards snapshot={snapshot} page={page} search={search} onSelect={setSelectedId} />
        </>}
        {selected && locationTypes.has(selected.type) ? <div className="wiki-children"><h3>Связанные локации</h3><EntityCards snapshot={snapshot} page="home" search="" parentId={selected.id} onSelect={setSelectedId} /></div> : null}
      </main>
      <Timeline snapshot={snapshot} onSelect={setSelectedId} />
    </div>
    {editor ? <WorldEntityDialog world={world} entities={snapshot.entities} type={editor.type} entity={editor.entity} onClose={() => setEditor(null)} onSaved={(id) => { setSelectedId(id); setEditor(null); }} /> : null}
    {isMaster ? <><WorldPermissionsDialog open={permissionsOpen} onOpenChange={setPermissionsOpen} snapshot={snapshot} /><WorldWikiImportDialog open={importOpen} onOpenChange={setImportOpen} world={world} /><WorldSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} world={world} /></> : null}
  </>;
}

const locationTypes = new Set(["territory", "region", "city", "place"]);

function EntityCards({ snapshot, page, search, parentId, onSelect }: { snapshot: WorldSnapshotDto; page: Page; search: string; parentId?: number; onSelect: (id: number) => void }) {
  const query = search.trim().toLocaleLowerCase();
  const entities = snapshot.entities.filter((entity) => {
    if (parentId !== undefined) return entity.parentId === parentId;
    if (page === "review") return entity.reviewStatus === "review";
    if (page === "characters") return entity.type === "character";
    if (page === "factions") return entity.type === "faction";
    return entity.type === "territory";
  }).filter((entity) => !query || `${entity.name} ${entity.description} ${entity.race} ${entity.role}`.toLocaleLowerCase().includes(query));
  if (!entities.length) return <p className="wiki-empty">Записи не найдены.</p>;
  return <div className={page === "characters" ? "wiki-character-list" : "wiki-card-grid"}>{entities.map((entity) => <button key={entity.id} className={page === "characters" ? "wiki-character-card" : "wiki-card"} onClick={() => onSelect(entity.id)}>
    {entity.imageKey ? <img src={boardImageUrl(entity.imageKey)} alt="" /> : <span className="wiki-image-placeholder"><Globe2 /></span>}
    <span className="wiki-card-copy"><span className="wiki-card-type">{WORLD_TYPE_LABELS[entity.type]}{entity.visibility === "master" ? " · только мастеру" : ""}</span><strong>{entity.name}</strong><span>{entity.description || [entity.race, entity.role].filter(Boolean).join(" · ") || "Описание пока не добавлено"}</span></span>
    {entity.reviewStatus !== "published" ? <Badge variant="secondary">{entity.reviewStatus}</Badge> : null}
  </button>)}</div>;
}

function Timeline({ snapshot, onSelect }: { snapshot: WorldSnapshotDto; onSelect: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const events = snapshot.entities.filter((entity) => entity.type === "event" && (!search || `${entity.name} ${entity.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  return <aside className="wiki-timeline"><h2>Хронология</h2><p>{snapshot.world.chronologyName} · нулевой год: {snapshot.world.zeroYearName}</p><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по событиям…" />
    <div className="wiki-timeline-list">{events.length ? events.map((event) => <button key={event.id} onClick={() => onSelect(event.id)}><time>{[event.day, event.month, event.year].filter(Boolean).join(" ")} {event.era === "before" ? "до нулевого года" : ""}</time><strong>{event.name}</strong><span>{event.description}</span></button>) : <p className="wiki-empty">События появятся здесь.</p>}</div>
  </aside>;
}
