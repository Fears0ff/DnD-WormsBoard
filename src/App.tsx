import { Toaster } from "@/components/ui/sonner";
import { api, isUnauthorizedError, trpcErrorMessage } from "@/lib/api";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { Game } from "@/components/game/Game";
import { FullScreenError, FullScreenLoader } from "@/components/game/FullScreenState";
import { Navigate, Route, Routes } from "react-router";
import { WorldsPage } from "@/components/worlds/WorldsPage";
import { HomePage } from "@/components/HomePage";

export default function App() {
  const me = api.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  let content: React.ReactNode;
  if (me.isLoading) {
    content = <FullScreenLoader />;
  } else if (me.isError && !isUnauthorizedError(me.error)) {
    content = (
      <FullScreenError
        title="Сервер недоступен"
        message={trpcErrorMessage(me.error, "Не удалось связаться с сервером")}
        onRetry={() => void me.refetch()}
      />
    );
  } else if (me.isError || !me.data) {
    content = <AuthScreen />;
  } else {
    content = (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/table" element={<Game />} />
        <Route path="/worlds" element={<WorldsPage me={me.data} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <>
      {content}
      <Toaster position="bottom-right" />
    </>
  );
}
