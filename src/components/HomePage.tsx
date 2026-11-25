import { Link } from "react-router";
import { BookOpen, Map } from "lucide-react";
import { BrandMark } from "@/components/game/FullScreenState";

export function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="mb-10 flex items-center gap-3 text-center">
        <BrandMark className="size-10" />
        <div>
          <h1 className="text-2xl font-light tracking-[0.12em] text-[#b8d0f0]">DnD WormsBoard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Общее игровое пространство</p>
        </div>
      </div>
      <nav className="grid w-full max-w-xl gap-5 sm:grid-cols-2" aria-label="Разделы приложения">
        <Link to="/worlds" className="group flex min-h-44 flex-col items-center justify-center gap-4 rounded-2xl border border-[#2a3a5c] bg-[#1e2a4a] p-8 text-[#d4e2ff] shadow-xl transition duration-200 hover:-translate-y-1 hover:bg-[#2a3f66]">
          <BookOpen className="size-12 text-[#7fc9ff] transition group-hover:scale-110" />
          <span className="text-xl font-semibold">Мир</span>
          <span className="text-center text-sm text-[#aab8d8]">Локации, персонажи и хронология</span>
        </Link>
        <Link to="/table" className="group flex min-h-44 flex-col items-center justify-center gap-4 rounded-2xl border border-[#2a3a5c] bg-[#1e2a4a] p-8 text-[#d4e2ff] shadow-xl transition duration-200 hover:-translate-y-1 hover:bg-[#2a3f66]">
          <Map className="size-12 text-[#7fc9ff] transition group-hover:scale-110" />
          <span className="text-xl font-semibold">Доска</span>
          <span className="text-center text-sm text-[#aab8d8]">Поля, токены и инициатива</span>
        </Link>
      </nav>
    </main>
  );
}
