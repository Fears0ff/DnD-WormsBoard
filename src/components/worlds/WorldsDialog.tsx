import { useMemo, useState } from "react";
import {
  BookOpen, Check, ChevronRight, Globe2, Pencil,
  Plus, Search, Send, Settings, Shield, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { queryClient } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/api";
import { boardImageUrl } from "@/lib/media";
import type { UserDto } from "@/lib/game-contract";
import type { WorldDto, WorldEntityDto, WorldEntityType, WorldSnapshotDto } from "@contracts/worlds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WorldEntityDialog } from "./WorldEntityDialog";
import { WorldPermissionsDialog } from "./WorldPermissionsDialog";
import { WorldWikiImportDialog } from "./WorldWikiImportDialog";

// eslint-disable-next-line react-refresh/only-export-components
export const WORLD_TYPE_LABELS: Record<WorldEntityType, string> = {
  territory: "Территория", region: "Регион", city: "Город", place: "Место",
  character: "Персонаж", faction: "Фракция", event: "Событие",
};

const STATUS_LABELS = { draft: "Черновик", review: "На ревью", rejected: "Отклонено", published: "Опубликовано" } as const;

// eslint-disable-next-line react-refresh/only-export-components
export function invalidateWorlds(): void {
  void queryClient.invalidateQueries({ queryKey: [["worlds"]] });
}

export function WorldsDialog({ open, onOpenChange, me }: { open: boolean; onOpenChange: (open: boolean) => void; me: UserDto }) {
  const worldsQuery = trpc.worlds.list.useQuery(undefined, {
    enabled: open, retry: 1, refetchInterval: open ? 4000 : false, refetchOnWindowFocus: true,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const worlds = useMemo(() => worldsQuery.data ?? [], [worldsQuery.data]);

  const activeSelectedId = selectedId !== null && worlds.some((world) => world.id === selectedId)
    ? selectedId
    : open && worlds.length ? worlds[0].id : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] max-w-[calc(100vw-1rem)] flex-col gap-3 p-3 sm:max-w-7xl sm:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><Globe2 className="size-5 text-primary" /> Миры</DialogTitle>
          <DialogDescription className="text-xs">Независимые энциклопедии миров, личные дополнения и общая хронология.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[120px_minmax(0,1fr)] gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-2 border-r pr-2">
            {me.gameRole === "master" ? (
              <Button size="sm" className="ui-hover h-9 gap-1 text-xs" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> <span className="hidden md:inline">Новый мир</span></Button>
            ) : null}
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-1 pr-1">
                {worlds.map((world) => (
                  <button key={world.id} type="button" onClick={() => setSelectedId(world.id)}
                    className={`ui-hover w-full rounded-md border px-2 py-2 text-left ${world.id === activeSelectedId ? "border-primary bg-accent" : "border-transparent hover:bg-accent/50"}`}>
                    <span className="flex items-center gap-1.5 text-xs font-medium"><span className="truncate">{world.name}</span>{world.isPrimary ? <Badge className="hidden px-1 text-[9px] md:inline-flex">основной</Badge> : null}</span>
                    <span className="mt-1 hidden truncate text-[10px] text-muted-foreground md:block">{world.comment || world.chronologyName}</span>
                    {world.reviewCount > 0 && me.gameRole === "master" ? <Badge variant="secondary" className="mt-1 text-[9px]">Ревью: {world.reviewCount}</Badge> : null}
                  </button>
                ))}
              </div>
              {worldsQuery.isLoading ? <p className="p-3 text-xs text-muted-foreground">Загрузка…</p> : null}
              {worldsQuery.isError ? <button type="button" className="ui-hover p-3 text-xs text-primary" onClick={() => void worldsQuery.refetch()}>Повторить загрузку</button> : null}
              {!worldsQuery.isLoading && worlds.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Миров пока нет.</p> : null}
            </ScrollArea>
          </aside>
          {activeSelectedId ? <WorldView key={activeSelectedId} worldId={activeSelectedId} me={me} /> : (
            <div className="flex items-center justify-center text-center text-sm text-muted-foreground">Выберите мир{me.gameRole === "master" ? " или создайте новый" : ""}.</div>
          )}
        </div>
        <WorldFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setSelectedId} />
      </DialogContent>
    </Dialog>
  );
}

export function WorldFormDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: number) => void }) {
  const create = trpc.worlds.create.useMutation();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [chronologyName, setChronologyName] = useState("");
  const [zeroYearName, setZeroYearName] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const reset = () => {
    setName(""); setComment(""); setChronologyName(""); setZeroYearName(""); setIsPrimary(false);
  };
  const submit = () => create.mutate({ name, comment, chronologyName, zeroYearName, isPrimary }, {
    onSuccess: (world) => { toast.success("Мир создан"); invalidateWorlds(); onCreated(world.id); onOpenChange(false); },
    onError: (error) => toast.error(trpcErrorMessage(error, "Не удалось создать мир")),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md" onOpenAutoFocus={reset}>
    <DialogHeader><DialogTitle className="text-sm">Новый мир</DialogTitle><DialogDescription className="text-xs">Хронология мира начинается с именованного нулевого года.</DialogDescription></DialogHeader>
    <div className="space-y-3">
      <Field label="Название мира"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Прайм" /></Field>
      <Field label="Комментарий"><Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например, Для Прайма" /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Название хронологии"><Input value={chronologyName} onChange={(e) => setChronologyName(e.target.value)} /></Field><Field label="Название нулевого года"><Input value={zeroYearName} onChange={(e) => setZeroYearName(e.target.value)} /></Field></div>
      <label className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={isPrimary} onCheckedChange={(value) => setIsPrimary(value === true)} /> Сделать основным миром</label>
    </div>
    <DialogFooter><Button disabled={create.isPending || !name.trim() || !chronologyName.trim() || !zeroYearName.trim()} onClick={submit}>Создать</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function WorldView({ worldId, me }: { worldId: number; me: UserDto }) {
  const snapshotQuery = trpc.worlds.get.useQuery({ id: worldId }, { retry: 1, refetchInterval: 4000, refetchOnWindowFocus: true });
  const snapshot = snapshotQuery.data;
  const [tab, setTab] = useState("locations");
  const [search, setSearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ type: WorldEntityType; entity?: WorldEntityDto } | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (snapshotQuery.isLoading) return <p className="p-6 text-sm text-muted-foreground">Загрузка мира…</p>;
  if (snapshotQuery.isError || !snapshot) return <div className="p-6 text-sm"><p className="text-destructive-foreground">{trpcErrorMessage(snapshotQuery.error, "Мир недоступен")}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void snapshotQuery.refetch()}>Повторить</Button></div>;

  const selected = snapshot.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const isMaster = me.gameRole === "master";
  return <section className="flex min-h-0 min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-start gap-2 border-b pb-3">
      <div className="min-w-40 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-semibold">{snapshot.world.name}</h2>{snapshot.world.isPrimary ? <Badge>Основной</Badge> : null}</div><p className="mt-0.5 text-xs text-muted-foreground">{snapshot.world.comment ? `${snapshot.world.comment} · ` : ""}{snapshot.world.chronologyName} · нулевой год: {snapshot.world.zeroYearName}</p></div>
      <Button variant="outline" size="sm" className="ui-hover gap-1" onClick={() => setEditor({ type: tab === "characters" ? "character" : tab === "factions" ? "faction" : tab === "timeline" ? "event" : "territory" })}><Plus className="size-4" /> Добавить</Button>
      {isMaster ? <>
        <Button variant="outline" size="sm" className="ui-hover gap-1" onClick={() => setPermissionsOpen(true)}><Shield className="size-4" /> Права</Button>
        <Button variant="outline" size="sm" className="ui-hover gap-1" onClick={() => setImportOpen(true)}><Upload className="size-4" /> Импорт</Button>
        <Button variant="ghost" size="icon" className="ui-hover" onClick={() => setSettingsOpen(true)} aria-label="Настройки мира"><Settings className="size-4" /></Button>
      </> : null}
    </div>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Tabs value={tab} onValueChange={(value) => { setTab(value); setSelectedEntityId(null); }}><TabsList className="h-9 max-w-full overflow-x-auto">
        <TabsTrigger value="locations" className="text-xs">Локации</TabsTrigger><TabsTrigger value="characters" className="text-xs">Персонажи</TabsTrigger><TabsTrigger value="factions" className="text-xs">Фракции</TabsTrigger><TabsTrigger value="timeline" className="text-xs">Хронология</TabsTrigger>{isMaster ? <TabsTrigger value="review" className="text-xs">Ревью ({snapshot.world.reviewCount})</TabsTrigger> : null}
      </TabsList></Tabs>
      <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по миру…" className="h-8 pl-8 text-xs" /></div>
    </div>
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-h-0 overflow-hidden rounded-md border"><EntityList snapshot={snapshot} tab={tab} search={search} selectedId={selectedEntityId} onSelect={setSelectedEntityId} /></div>
      <div className="hidden min-h-0 overflow-y-auto rounded-md border lg:block">{selected ? <EntityDetails snapshot={snapshot} entity={selected} me={me} onSelect={setSelectedEntityId} onEdit={() => setEditor({ type: selected.type, entity: selected })} onDeleted={() => setSelectedEntityId(null)} /> : <EmptyDetails />}</div>
    </div>
    {selected ? <div className="rounded-md border p-3 lg:hidden"><EntityDetails snapshot={snapshot} entity={selected} me={me} onSelect={setSelectedEntityId} onEdit={() => setEditor({ type: selected.type, entity: selected })} onDeleted={() => setSelectedEntityId(null)} /></div> : null}
    {editor ? <WorldEntityDialog world={snapshot.world} entities={snapshot.entities} type={editor.type} entity={editor.entity} onClose={() => setEditor(null)} onSaved={(id) => { setSelectedEntityId(id); setEditor(null); }} /> : null}
    {isMaster ? <><WorldPermissionsDialog open={permissionsOpen} onOpenChange={setPermissionsOpen} snapshot={snapshot} /><WorldWikiImportDialog open={importOpen} onOpenChange={setImportOpen} world={snapshot.world} /><WorldSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} world={snapshot.world} /></> : null}
  </section>;
}

function EntityList({ snapshot, tab, search, selectedId, onSelect }: { snapshot: WorldSnapshotDto; tab: string; search: string; selectedId: number | null; onSelect: (id: number) => void }) {
  const [locationFilter, setLocationFilter] = useState("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const entities = snapshot.entities;
  const byId = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities]);
  const query = search.trim().toLocaleLowerCase();
  const base = entities.filter((entity) => {
    if (tab === "review") return entity.reviewStatus === "review";
    if (tab === "locations") return locationTypes.has(entity.type);
    if (tab === "characters") return entity.type === "character";
    if (tab === "factions") return entity.type === "faction";
    return entity.type === "event";
  }).filter((entity) => !query || `${entity.name} ${entity.description} ${entity.race} ${entity.role}`.toLocaleLowerCase().includes(query));
  const filtered = base.filter((entity) => {
    if (tab === "characters") {
      if (factionFilter !== "all" && String(entity.factionId ?? "none") !== factionFilter) return false;
      if (locationFilter === "none") return entity.parentId === null;
      if (locationFilter !== "all") {
        let current: WorldEntityDto | undefined = entity;
        const ids = new Set<number>();
        while (current?.parentId && !ids.has(current.id)) { if (String(current.parentId) === locationFilter) return true; ids.add(current.id); current = byId.get(current.parentId); }
        return false;
      }
    }
    return true;
  });
  if (tab === "timeline") filtered.sort((a, b) => {
    const ay = Number(a.year) || 0; const by = Number(b.year) || 0;
    if (a.era !== b.era) return a.era === "before" ? -1 : 1;
    return a.era === "before" ? by - ay : ay - by;
  });
  const groups = tab === "locations"
    ? ["territory", "region", "city", "place"].map((type) => ({ type, items: filtered.filter((entity) => entity.type === type) }))
    : [{ type: "all", items: filtered }];
  return <div className="flex h-full min-h-0 flex-col">
    {tab === "characters" ? <div className="grid grid-cols-2 gap-2 border-b p-2"><Select value={locationFilter} onValueChange={setLocationFilter}><SelectTrigger size="sm" className="w-full text-xs"><SelectValue placeholder="Локация" /></SelectTrigger><SelectContent><SelectItem value="all">Все локации</SelectItem><SelectItem value="none">Без локации</SelectItem>{entities.filter((e) => locationTypes.has(e.type)).map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent></Select><Select value={factionFilter} onValueChange={setFactionFilter}><SelectTrigger size="sm" className="w-full text-xs"><SelectValue placeholder="Фракция" /></SelectTrigger><SelectContent><SelectItem value="all">Все фракции</SelectItem><SelectItem value="none">Без фракции</SelectItem>{entities.filter((e) => e.type === "faction").map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent></Select></div> : null}
    <ScrollArea className="min-h-0 flex-1"><div className="p-2">
      {groups.map((group) => <div key={group.type} className="mb-2">{group.type !== "all" ? <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{WORLD_TYPE_LABELS[group.type as WorldEntityType]}</p> : null}<div className="space-y-0.5">{group.items.map((entity) => <EntityRow key={entity.id} entity={entity} selected={selectedId === entity.id} onSelect={() => onSelect(entity.id)} />)}</div></div>)}
      {!filtered.length ? <p className="p-6 text-center text-xs text-muted-foreground">Записей не найдено.</p> : null}
    </div></ScrollArea>
  </div>;
}

const locationTypes = new Set<WorldEntityType>(["territory", "region", "city", "place"]);

function EntityRow({ entity, selected, onSelect }: { entity: WorldEntityDto; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`ui-hover flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${selected ? "bg-accent" : "hover:bg-accent/50"}`}>
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-xs font-medium">{entity.name}</span>{entity.visibility === "master" ? <Shield className="size-3 shrink-0 text-primary" /> : null}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{WORLD_TYPE_LABELS[entity.type]}{entity.type === "character" && entity.race ? ` · ${entity.race}` : ""}{entity.type === "event" ? ` · ${entity.year || "без года"} ${entity.era === "before" ? "ДО" : "ПО"}` : ""}</span></span>
    {entity.reviewStatus !== "published" ? <Badge variant={entity.reviewStatus === "rejected" ? "destructive" : "secondary"} className="shrink-0 px-1 text-[9px]">{STATUS_LABELS[entity.reviewStatus]}</Badge> : null}<ChevronRight className="size-3 shrink-0 text-muted-foreground" />
  </button>;
}

export function EntityDetails({ snapshot, entity, me, onSelect, onEdit, onDeleted }: { snapshot: WorldSnapshotDto; entity: WorldEntityDto; me: UserDto; onSelect: (id: number) => void; onEdit: () => void; onDeleted: () => void }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [visibility, setVisibility] = useState<"all" | "master">(entity.visibility);
  const submit = trpc.worlds.submitReview.useMutation();
  const approve = trpc.worlds.approve.useMutation();
  const remove = trpc.worlds.removeEntity.useMutation();
  const byId = new Map(snapshot.entities.map((item) => [item.id, item]));
  const children = snapshot.entities.filter((item) => item.parentId === entity.id && locationTypes.has(item.type));
  const characters = entity.type === "faction" ? snapshot.entities.filter((item) => item.factionId === entity.id) : snapshot.entities.filter((item) => item.parentId === entity.id && item.type === "character");
  const events = snapshot.entities.filter((item) => item.type === "event" && (item.parentId === entity.id || item.characterIds.includes(entity.id)));
  const related = [...children, ...characters, ...events];
  const action = (callback: () => void, success: string) => ({ onSuccess: () => { callback(); invalidateWorlds(); toast.success(success); }, onError: (error: unknown) => toast.error(trpcErrorMessage(error, "Действие не выполнено")) });
  return <div className="space-y-4 p-4">
    <div className="flex flex-wrap items-start gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">{entity.name}</h3><Badge variant="outline">{WORLD_TYPE_LABELS[entity.type]}</Badge>{entity.reviewStatus !== "published" ? <Badge variant="secondary">{STATUS_LABELS[entity.reviewStatus]}</Badge> : null}{entity.visibility === "master" ? <Badge variant="secondary">Только мастеру</Badge> : null}</div><p className="mt-1 text-[11px] text-muted-foreground">Автор: {entity.authorName}</p></div>
      {entity.canEdit ? <Button size="sm" variant="outline" className="ui-hover gap-1" onClick={onEdit}><Pencil className="size-3.5" /> Изменить</Button> : null}
      {entity.reviewStatus !== "published" && entity.isMine ? <Button size="sm" className="ui-hover gap-1" disabled={submit.isPending} onClick={() => submit.mutate({ id: entity.id }, action(() => undefined, "Отправлено на ревью"))}><Send className="size-3.5" /> На ревью</Button> : null}
      {entity.canDelete ? <Button size="sm" variant="ghost" className="ui-hover text-destructive-foreground" onClick={() => { if (window.confirm(`Удалить «${entity.name}»?`)) remove.mutate({ id: entity.id }, action(onDeleted, "Запись удалена")); }} aria-label="Удалить"><Trash2 className="size-4" /></Button> : null}
    </div>
    {entity.reviewStatus === "rejected" && entity.reviewComment ? <div className="rounded-md border border-destructive p-3 text-xs"><b>Комментарий ревью:</b> {entity.reviewComment}</div> : null}
    {entity.imageKey ? <button type="button" onClick={() => setLightbox(entity.imageKey)} className="ui-hover block max-w-full overflow-hidden rounded-md border hover:border-primary"><img src={boardImageUrl(entity.imageKey)} alt={entity.name} className="max-h-64 max-w-full object-contain" /></button> : null}
    {entity.mapKeys.length ? <div><p className="mb-2 text-xs font-medium">Карты</p><div className="grid grid-cols-3 gap-2">{entity.mapKeys.map((key) => <button type="button" key={key} onClick={() => setLightbox(key)} className="ui-hover overflow-hidden rounded border hover:border-primary"><img src={boardImageUrl(key)} alt={`Карта: ${entity.name}`} className="h-24 w-full object-cover" /></button>)}</div></div> : null}
    {entity.description ? <p className="whitespace-pre-wrap text-sm leading-6">{entity.description}</p> : <p className="text-xs text-muted-foreground">Описание пока не добавлено.</p>}
    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{entity.race ? <Meta label="Раса" value={entity.race} /> : null}{entity.role ? <Meta label="Роль" value={entity.role} /> : null}{entity.statusText ? <Meta label="Статус" value={entity.statusText} /> : null}{entity.type === "event" ? <><Meta label="Дата" value={`${entity.day || "—"} ${entity.month || ""} ${entity.year || "—"} ${entity.era === "before" ? "ДО" : "ПО"}`} /></> : null}{entity.parentId && byId.get(entity.parentId) ? <Meta label="Локация" value={byId.get(entity.parentId)!.name} /> : null}{entity.factionId && byId.get(entity.factionId) ? <Meta label="Фракция" value={byId.get(entity.factionId)!.name} /> : null}</dl>
    {related.length ? <div><p className="mb-2 text-xs font-medium">Связанные записи</p><div className="flex flex-wrap gap-1.5">{related.map((item) => <Button key={item.id} variant="outline" size="sm" className="ui-hover h-7 text-xs" onClick={() => onSelect(item.id)}>{item.name}</Button>)}</div></div> : null}
    {me.gameRole === "master" && entity.reviewStatus === "review" ? <div className="space-y-2 border-t pt-3"><Label className="text-xs">Видимость после утверждения</Label><Select value={visibility} onValueChange={(value) => setVisibility(value as "all" | "master")}><SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все пользователи</SelectItem><SelectItem value="master">Только мастер</SelectItem></SelectContent></Select><div className="flex gap-2"><Button size="sm" className="gap-1" disabled={approve.isPending} onClick={() => approve.mutate({ id: entity.id, visibility }, action(() => undefined, "Запись утверждена"))}><Check className="size-4" /> Утвердить</Button><Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}><X className="size-4" /> Отклонить</Button></div></div> : null}
    <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}><DialogContent className="max-w-[90vw] sm:max-w-5xl"><DialogTitle className="sr-only">{entity.name}</DialogTitle>{lightbox ? <img src={boardImageUrl(lightbox)} alt={entity.name} className="max-h-[80dvh] w-full object-contain" /> : null}</DialogContent></Dialog>
    <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} entityId={entity.id} />
  </div>;
}

function RejectDialog({ open, onOpenChange, entityId }: { open: boolean; onOpenChange: (open: boolean) => void; entityId: number }) {
  const [comment, setComment] = useState(""); const reject = trpc.worlds.reject.useMutation();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="text-sm">Отклонить запись</DialogTitle><DialogDescription className="text-xs">Автор увидит комментарий и сможет доработать запись.</DialogDescription></DialogHeader><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что нужно исправить?" /><DialogFooter><Button variant="destructive" disabled={!comment.trim() || reject.isPending} onClick={() => reject.mutate({ id: entityId, comment }, { onSuccess: () => { invalidateWorlds(); onOpenChange(false); setComment(""); }, onError: (error) => toast.error(trpcErrorMessage(error, "Не удалось отклонить запись")) })}>Отклонить</Button></DialogFooter></DialogContent></Dialog>;
}

export function WorldSettingsDialog({ open, onOpenChange, world }: { open: boolean; onOpenChange: (open: boolean) => void; world: WorldDto }) {
  const [name, setName] = useState(world.name); const [comment, setComment] = useState(world.comment); const [chronologyName, setChronologyName] = useState(world.chronologyName); const [zeroYearName, setZeroYearName] = useState(world.zeroYearName);
  const update = trpc.worlds.update.useMutation(); const remove = trpc.worlds.remove.useMutation();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="text-sm">Настройки мира</DialogTitle></DialogHeader><div className="space-y-3"><Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Комментарий"><Input value={comment} onChange={(e) => setComment(e.target.value)} /></Field><Field label="Хронология"><Input value={chronologyName} onChange={(e) => setChronologyName(e.target.value)} /></Field><Field label="Нулевой год"><Input value={zeroYearName} onChange={(e) => setZeroYearName(e.target.value)} /></Field></div><DialogFooter className="flex justify-between">{!world.isPrimary ? <Button variant="destructive" size="sm" onClick={() => { if (window.confirm(`Удалить мир «${world.name}» и все его записи?`)) remove.mutate({ id: world.id }, { onSuccess: () => { invalidateWorlds(); onOpenChange(false); }, onError: (error) => toast.error(trpcErrorMessage(error, "Не удалось удалить мир")) }); }}>Удалить мир</Button> : <span />}<Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: world.id, name, comment, chronologyName, zeroYearName }, { onSuccess: () => { invalidateWorlds(); onOpenChange(false); }, onError: (error) => toast.error(trpcErrorMessage(error, "Не удалось сохранить мир")) })}>Сохранить</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5">{value}</dd></div>; }
function EmptyDetails() { return <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground"><BookOpen className="size-8" /><p className="text-xs">Выберите запись, чтобы увидеть подробности.</p></div>; }
