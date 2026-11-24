import { useRef, useState } from "react";
import { FileJson, Images, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fileToBase64 } from "@/lib/media";
import { trpcErrorMessage } from "@/lib/api";
import type { WorldDto, WorldWikiImportResultDto } from "@contracts/worlds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidateWorlds } from "./WorldsDialog";

export function WorldWikiImportDialog({ open, onOpenChange, world }: { open: boolean; onOpenChange: (open: boolean) => void; world: WorldDto }) {
  const dataRef = useRef<HTMLInputElement>(null);
  const pathsRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<WorldWikiImportResultDto | null>(null);
  const importWiki = trpc.worlds.importWiki.useMutation();
  const run = async () => {
    const dataFile = dataRef.current?.files?.[0];
    const pathsFile = pathsRef.current?.files?.[0];
    if (!dataFile || !pathsFile) { toast.error("Выберите data.js и imagePaths.js"); return; }
    setPending(true); setResult(null);
    try {
      const images = await Promise.all(Array.from(imagesRef.current?.files ?? []).map(async (file) => ({ path: `images/${file.name}`, dataBase64: await fileToBase64(file) })));
      const imported = await importWiki.mutateAsync({ worldId: world.id, dataJs: await dataFile.text(), imagePathsJs: await pathsFile.text(), images });
      setResult(imported); invalidateWorlds(); toast.success("Импорт завершён");
    } catch (error) { toast.error(trpcErrorMessage(error, "Не удалось импортировать Wiki")); }
    finally { setPending(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle className="text-sm">Импорт Wiki в «{world.name}»</DialogTitle><DialogDescription className="text-xs">Импорт доступен только в пустой мир. Данные появятся как опубликованные, прежние скрытые записи останутся доступны только мастеру.</DialogDescription></DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1.5"><Label className="flex items-center gap-1.5 text-xs"><FileJson className="size-3.5" /> data.js</Label><Input ref={dataRef} type="file" accept=".js,text/javascript" /></div>
      <div className="space-y-1.5"><Label className="flex items-center gap-1.5 text-xs"><FileJson className="size-3.5" /> imagePaths.js</Label><Input ref={pathsRef} type="file" accept=".js,text/javascript" /></div>
      <div className="space-y-1.5"><Label className="flex items-center gap-1.5 text-xs"><Images className="size-3.5" /> Изображения из папки images</Label><Input ref={imagesRef} type="file" accept="image/png,image/jpeg,image/webp" multiple /><p className="text-[10px] text-muted-foreground">Будут перенесены только файлы, на которые есть ссылки в imagePaths.js. Остальные не сопоставляются автоматически.</p></div>
      {result ? <div className="rounded-md border p-3 text-xs"><p className="font-medium">Перенесено: {Object.values(result.imported).reduce((sum, count) => sum + count, 0)} записей</p><p className="mt-1 text-muted-foreground">Изображений: {result.attachedImages}{result.skippedImages.length ? ` · без файлов: ${result.skippedImages.length}` : ""}</p></div> : null}
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button><Button disabled={pending} onClick={() => void run()}><Upload className="size-4" /> {pending ? "Импорт…" : "Импортировать"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
