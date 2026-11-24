import { useRef, useState } from "react";
import { Database, FileJson, Images, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fileToBase64 } from "@/lib/media";
import { trpcErrorMessage } from "@/lib/api";
import type { WorldWikiImportInput, WorldWikiImportResultDto, WorldDto } from "@contracts/worlds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidateWorlds } from "./WorldsDialog";

interface BundledWikiManifest {
  images: string[];
}

async function fetchRequired(path: string): Promise<Response> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response;
}

export function WorldWikiImportDialog({ open, onOpenChange, world }: { open: boolean; onOpenChange: (open: boolean) => void; world: WorldDto }) {
  const dataRef = useRef<HTMLInputElement>(null);
  const pathsRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<WorldWikiImportResultDto | null>(null);
  const importWiki = trpc.worlds.importWiki.useMutation();

  const run = async (input: WorldWikiImportInput) => {
    setPending(true);
    setResult(null);
    try {
      const imported = await importWiki.mutateAsync(input);
      setResult(imported);
      invalidateWorlds();
      toast.success("Импорт завершён");
    } catch (error) {
      toast.error(trpcErrorMessage(error, "Не удалось импортировать Wiki"));
    } finally {
      setPending(false);
    }
  };

  const runManual = async () => {
    const dataFile = dataRef.current?.files?.[0];
    const pathsFile = pathsRef.current?.files?.[0];
    if (!dataFile || !pathsFile) {
      toast.error("Выберите data.js и imagePaths.js");
      return;
    }
    const images = await Promise.all(Array.from(imagesRef.current?.files ?? []).map(async (file) => ({
      path: `images/${file.name}`,
      dataBase64: await fileToBase64(file),
    })));
    await run({
      worldId: world.id,
      dataJs: await dataFile.text(),
      imagePathsJs: await pathsFile.text(),
      images,
    });
  };

  const runBundled = async () => {
    setPending(true);
    setResult(null);
    try {
      const [dataResponse, pathsResponse, manifestResponse] = await Promise.all([
        fetchRequired("/wiki/data.js"),
        fetchRequired("/wiki/imagePaths.js"),
        fetchRequired("/wiki/manifest.json"),
      ]);
      const manifest = await manifestResponse.json() as BundledWikiManifest;
      const images = await Promise.all(manifest.images.map(async (name) => {
        const response = await fetchRequired(`/wiki/${name}`);
        const blob = await response.blob();
        return {
          path: `images/${name}`,
          dataBase64: await fileToBase64(new File([blob], name, { type: blob.type })),
        };
      }));
      await run({
        worldId: world.id,
        dataJs: await dataResponse.text(),
        imagePathsJs: await pathsResponse.text(),
        images,
      });
    } catch (error) {
      setPending(false);
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить встроенную Wiki");
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle className="text-sm">Импорт Wiki в «{world.name}»</DialogTitle><DialogDescription className="text-xs">Импорт доступен только в пустой мир. Данные появятся как опубликованные, прежние скрытые записи останутся доступны только мастеру.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <p className="text-xs font-medium">База «Прайм» включена в поставку</p>
        <p className="mt-1 text-[11px] text-muted-foreground">492 записи, изображения и карты локаций загрузятся автоматически.</p>
        <Button className="mt-3 w-full" disabled={pending} onClick={() => void runBundled()}><Database className="size-4" /> {pending ? "Импорт…" : "Импортировать встроенную Wiki"}</Button>
      </div>
      <div className="space-y-3 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">Импорт другой базы вручную</p>
        <div className="space-y-1.5"><Label className="flex items-center gap-1.5 text-xs"><FileJson className="size-3.5" /> data.js</Label><Input ref={dataRef} type="file" accept=".js,text/javascript" /></div>
        <div className="space-y-1.5"><Label className="flex items-center gap-1.5 text-xs"><FileJson className="size-3.5" /> imagePaths.js</Label><Input ref={pathsRef} type="file" accept=".js,text/javascript" /></div>
        <div className="space-y-1.5"><Label className="flex items-center gap-1.5 text-xs"><Images className="size-3.5" /> Изображения из папки images</Label><Input ref={imagesRef} type="file" accept="image/png,image/jpeg,image/webp" multiple /><p className="text-[10px] text-muted-foreground">Будут перенесены только файлы, на которые есть ссылки в imagePaths.js. Остальные не сопоставляются автоматически.</p></div>
      </div>
      {result ? <div className="rounded-md border p-3 text-xs"><p className="font-medium">Перенесено: {Object.values(result.imported).reduce((sum, count) => sum + count, 0)} записей</p><p className="mt-1 text-muted-foreground">Изображений: {result.attachedImages}{result.skippedImages.length ? ` · без файлов: ${result.skippedImages.length}` : ""}</p></div> : null}
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button><Button disabled={pending} onClick={() => void runManual()}><Upload className="size-4" /> Импортировать файлы</Button></DialogFooter>
  </DialogContent></Dialog>;
}
