import { useState } from "react";
import { Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/api";
import type { WorldSnapshotDto } from "@contracts/worlds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidateWorlds } from "./WorldsDialog";

export function WorldPermissionsDialog({ open, onOpenChange, snapshot }: { open: boolean; onOpenChange: (open: boolean) => void; snapshot: WorldSnapshotDto }) {
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: open, retry: 1 });
  const [userId, setUserId] = useState("");
  const [scope, setScope] = useState("world");
  const [canAdd, setCanAdd] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const setPermission = trpc.worlds.setPermission.useMutation();
  const removePermission = trpc.worlds.removePermission.useMutation();
  const users = (usersQuery.data ?? []).filter((user) => user.gameRole !== "master");
  const scopes = snapshot.entities.filter((entity) => ["territory", "region", "city", "place"].includes(entity.type) && entity.reviewStatus === "published");
  const userName = (id: number) => usersQuery.data?.find((user) => user.id === id)?.displayName || `Пользователь #${id}`;
  const scopeName = (id: number | null) => id === null ? "Весь мир" : snapshot.entities.find((entity) => entity.id === id)?.name ?? `Запись #${id}`;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
    <DialogHeader><DialogTitle className="flex items-center gap-2 text-sm"><Shield className="size-4 text-primary" /> Права в мире «{snapshot.world.name}»</DialogTitle><DialogDescription className="text-xs">Права на ветку автоматически распространяются на все дочерние записи.</DialogDescription></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label className="text-xs">Аккаунт</Label><Select value={userId} onValueChange={setUserId}><SelectTrigger className="w-full"><SelectValue placeholder="Выберите пользователя" /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={String(user.id)}>{user.displayName || user.login}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label className="text-xs">Область прав</Label><Select value={scope} onValueChange={setScope}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="world">Весь мир</SelectItem>{scopes.map((entity) => <SelectItem key={entity.id} value={String(entity.id)}>{entity.name}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="flex gap-5"><label className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={canAdd} onCheckedChange={(value) => setCanAdd(value === true)} /> Добавление</label><label className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={canEdit} onCheckedChange={(value) => setCanEdit(value === true)} /> Редактирование и удаление</label></div>
    <Button size="sm" disabled={!userId || (!canAdd && !canEdit) || setPermission.isPending} onClick={() => setPermission.mutate({ worldId: snapshot.world.id, userId: Number(userId), entityId: scope === "world" ? null : Number(scope), canAdd, canEdit }, { onSuccess: () => { invalidateWorlds(); toast.success("Права сохранены"); }, onError: (error) => toast.error(trpcErrorMessage(error, "Не удалось сохранить права")) })}>Выдать права</Button>
    <ScrollArea className="max-h-56 rounded-md border"><div className="divide-y">{snapshot.permissions.map((permission) => <div key={permission.id} className="flex items-center gap-2 p-2 text-xs"><div className="min-w-0 flex-1"><p className="font-medium">{userName(permission.userId)}</p><p className="truncate text-[10px] text-muted-foreground">{scopeName(permission.entityId)}</p></div><span>{[permission.canAdd ? "добавление" : "", permission.canEdit ? "редактирование" : ""].filter(Boolean).join(", ")}</span><Button variant="ghost" size="icon" className="size-7" aria-label="Отозвать права" onClick={() => removePermission.mutate({ id: permission.id }, { onSuccess: invalidateWorlds, onError: (error) => toast.error(trpcErrorMessage(error, "Не удалось отозвать права")) })}><Trash2 className="size-3.5" /></Button></div>)}{!snapshot.permissions.length ? <p className="p-4 text-center text-xs text-muted-foreground">Дополнительные права ещё не выданы.</p> : null}</div></ScrollArea>
    <DialogFooter><Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Закрыть</Button></DialogFooter>
  </DialogContent></Dialog>;
}
