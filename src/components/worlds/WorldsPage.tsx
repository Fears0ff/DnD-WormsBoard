import { useNavigate } from "react-router";
import type { UserDto } from "@/lib/game-contract";
import { WorldsDialog } from "./WorldsDialog";

export function WorldsPage({ me }: { me: UserDto }) {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-background">
      <WorldsDialog open onOpenChange={(open) => { if (!open) navigate("/table"); }} me={me} />
    </main>
  );
}
