import { useRef, useState } from "react";
import { ClipboardPaste, Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/api";
import { boardImageUrl, fileToBase64, IMAGE_ACCEPT_ATTR, mediaApi, validatePickedImage } from "@/lib/media";
import type { WorldDto, WorldEntityDto, WorldEntityType } from "@contracts/worlds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invalidateWorlds, WORLD_TYPE_LABELS } from "./WorldsDialog";

const locations = new Set<WorldEntityType>(["territory", "region", "city", "place"]);
const allowedParents: Partial<Record<WorldEntityType, WorldEntityType[]>> = {
  region: ["territory"], city: ["region"], place: ["city"], character: ["city", "place"], event: ["city", "place"],
};

export function WorldEntityDialog({ world, entities, type: initialType, entity, onClose, onSaved }: {
  world: WorldDto; entities: WorldEntityDto[]; type: WorldEntityType; entity?: WorldEntityDto;
  onClose: () => void; onSaved: (id: number) => void;
}) {
  const [type, setType] = useState<WorldEntityType>(initialType);
  const [name, setName] = useState(entity?.name ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [parentId, setParentId] = useState<number | null>(entity?.parentId ?? null);
  const [factionId, setFactionId] = useState<number | null>(entity?.factionId ?? null);
  const [race, setRace] = useState(entity?.race ?? "");
  const [role, setRole] = useState(entity?.role ?? "");
  const [statusText, setStatusText] = useState(entity?.statusText ?? "");
  const [day, setDay] = useState(entity?.day ?? "");
  const [month, setMonth] = useState(entity?.month ?? "");
  const [year, setYear] = useState(entity?.year ?? "");
  const [era, setEra] = useState<"before" | "after">(entity?.era ?? "after");
  const [imageKey, setImageKey] = useState<string | null>(entity?.imageKey ?? null);
  const [mapKeys, setMapKeys] = useState<string[]>(entity?.mapKeys ?? []);
  const [characterIds, setCharacterIds] = useState<number[]>(entity?.characterIds ?? []);
  const [visibility, setVisibility] = useState<"all" | "master">(entity?.visibility ?? "all");
  const create = trpc.worlds.createEntity.useMutation();
  const update = trpc.worlds.updateEntity.useMutation();
  const parentRequired = ["region", "city", "place"].includes(type);
  const parents = entities.filter((item) => allowedParents[type]?.includes(item.type) && item.id !== entity?.id);
  const factions = entities.filter((item) => item.type === "faction" && item.id !== entity?.id);
  const characters = entities.filter((item) => item.type === "character" && item.id !== entity?.id);

  const save = () => {
    const fields = {
      parentId: allowedParents[type] ? parentId : null,
      factionId: type === "character" ? factionId : null,
      name, description, race: type === "character" ? race : "", role: type === "character" ? role : "",
      statusText: type === "character" ? statusText : "", day: type === "event" ? day : "",
      month: type === "event" ? month : "", year: type === "event" ? year : "", era,
      imageKey, mapKeys: locations.has(type) ? mapKeys : [], characterIds: type === "event" ? characterIds : [], visibility,
    };
    const options = {
      onSuccess: (saved: WorldEntityDto) => {
        invalidateWorlds();
        toast.success(saved.reviewStatus === "published" ? "Запись сохранена" : "Черновик сохранён");
        onSaved(saved.id);
      },
      onError: (error: unknown) => toast.error(trpcErrorMessage(error, "Не удалось сохранить запись")),
    };
    if (entity) update.mutate({ id: entity.id, ...fields }, options);
    else create.mutate({ worldId: world.id, type, ...fields }, options);
  };
  const pending = create.isPending || update.isPending;

  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[90dvh] max-w-[calc(100vw-1rem)] flex-col sm:max-w-3xl">
    <DialogHeader><DialogTitle className="text-sm">{entity ? `Изменить: ${entity.name}` : "Новая запись"}</DialogTitle><DialogDescription className="text-xs">{entity ? "Изменения общей записи сохранятся отдельным черновиком до ревью." : "Запись сохранится как личный черновик, видимый вам и мастеру."}</DialogDescription></DialogHeader>
    <ScrollArea className="min-h-0 flex-1 pr-3"><div className="space-y-4 pb-2">
      {!entity ? <Field label="Тип записи"><Select value={type} onValueChange={(value) => { setType(value as WorldEntityType); setParentId(null); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(WORLD_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field> : null}
      <Field label="Название"><Input autoFocus value={name} maxLength={160} onChange={(e) => setName(e.target.value)} /></Field>
      {allowedParents[type] ? <Field label={type === "character" || type === "event" ? "Город или место" : "Родительская локация"}><Select value={parentId ? String(parentId) : "none"} onValueChange={(value) => setParentId(value === "none" ? null : Number(value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{!parentRequired ? <SelectItem value="none">Без локации</SelectItem> : null}{parents.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name} · {WORLD_TYPE_LABELS[item.type]}</SelectItem>)}</SelectContent></Select></Field> : null}
      <Field label="Описание"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-28" maxLength={300_000} /></Field>
      {type === "character" ? <>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Раса"><Input value={race} onChange={(e) => setRace(e.target.value)} /></Field><Field label="Роль"><Input value={role} onChange={(e) => setRole(e.target.value)} /></Field><Field label="Статус"><Input value={statusText} onChange={(e) => setStatusText(e.target.value)} /></Field></div>
        <Field label="Фракция"><Select value={factionId ? String(factionId) : "none"} onValueChange={(value) => setFactionId(value === "none" ? null : Number(value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Без фракции</SelectItem>{factions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
      </> : null}
      {type === "event" ? <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Field label="День"><Input value={day} onChange={(e) => setDay(e.target.value)} /></Field><Field label="Месяц"><Input value={month} onChange={(e) => setMonth(e.target.value)} /></Field><Field label="Год"><Input value={year} onChange={(e) => setYear(e.target.value)} /></Field><Field label="Эра"><Select value={era} onValueChange={(value) => setEra(value as "before" | "after")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="before">ДО</SelectItem><SelectItem value="after">ПО</SelectItem></SelectContent></Select></Field></div>
        <Field label="Участники"><div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">{characters.map((character) => <label key={character.id} className="flex min-h-8 cursor-pointer items-center gap-2 text-xs"><Checkbox checked={characterIds.includes(character.id)} onCheckedChange={(checked) => setCharacterIds((ids) => checked === true ? [...ids, character.id] : ids.filter((id) => id !== character.id))} />{character.name}</label>)}{!characters.length ? <p className="text-xs text-muted-foreground">Персонажей пока нет.</p> : null}</div></Field>
      </> : null}
      <ImagePasteField label={type === "character" ? "Портрет" : "Изображение"} value={imageKey} onChange={setImageKey} />
      {locations.has(type) ? <div className="space-y-2"><Label className="text-xs">Карты (до 3)</Label>{mapKeys.map((key, index) => <div key={key} className="flex items-center gap-2"><img src={boardImageUrl(key)} alt="Карта" className="h-16 w-24 rounded border object-cover" /><Button type="button" variant="outline" size="sm" onClick={() => setMapKeys((keys) => keys.filter((_, i) => i !== index))}><Trash2 className="size-3.5" /> Убрать</Button></div>)}{mapKeys.length < 3 ? <ImagePasteField label="Добавить карту" value={null} onChange={(key) => { if (key) setMapKeys((keys) => [...new Set([...keys, key])]); }} compact /> : null}</div> : null}
      <Field label="Видимость после публикации"><Select value={visibility} onValueChange={(value) => setVisibility(value as "all" | "master")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все пользователи</SelectItem><SelectItem value="master">Только мастер</SelectItem></SelectContent></Select></Field>
    </div></ScrollArea>
    <DialogFooter><Button variant="outline" onClick={onClose}>Отмена</Button><Button disabled={pending || !name.trim() || (parentRequired && !parentId)} onClick={save}>{pending ? "Сохранение…" : "Сохранить"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function ImagePasteField({ label, value, onChange, compact = false }: { label: string; value: string | null; onChange: (key: string | null) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const upload = mediaApi.uploadImage.useMutation();
  const accept = async (file?: File) => {
    if (!file) return;
    const problem = validatePickedImage(file);
    if (problem) { toast.error(problem); return; }
    setPending(true);
    try {
      const asset = await upload.mutateAsync({ dataBase64: await fileToBase64(file), purpose: "world" });
      onChange(asset.key); toast.success("Изображение добавлено");
    } catch (error) { toast.error(trpcErrorMessage(error, "Не удалось загрузить изображение")); }
    finally { setPending(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) { toast.error("Браузер не разрешает чтение буфера. Используйте Ctrl+V или выбор файла."); return; }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const mime = ["image/png", "image/jpeg", "image/webp"].find((type) => item.types.includes(type));
        if (mime) { await accept(new File([await item.getType(mime)], "clipboard-image", { type: mime })); return; }
      }
      toast.error("В буфере обмена нет изображения");
    } catch { toast.error("Не удалось прочитать буфер обмена"); }
  };
  return <div className="space-y-1.5" tabIndex={0} onPaste={(event) => { const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/")); if (file) { event.preventDefault(); void accept(file); } }} role="group" aria-label={label}>
    <Label className="text-xs">{label}</Label>
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 focus-within:border-primary">
      {value ? <img src={boardImageUrl(value)} alt="Выбранное изображение" className="h-16 w-24 rounded border object-cover" /> : <ImageIcon className="size-5 text-muted-foreground" />}
      <input ref={inputRef} type="file" accept={IMAGE_ACCEPT_ATTR} className="hidden" onChange={(e) => void accept(e.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}><Upload className="size-3.5" /> Файл</Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void pasteFromClipboard()}><ClipboardPaste className="size-3.5" /> Из буфера</Button>
      {value ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}><Trash2 className="size-3.5" /> Убрать</Button> : null}
      <span className="text-[10px] text-muted-foreground">{pending ? "Загрузка…" : compact ? "Ctrl+V" : "Можно вставить через Ctrl+V"}</span>
      {!value && !compact ? <Plus className="size-3 text-muted-foreground" /> : null}
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>; }
