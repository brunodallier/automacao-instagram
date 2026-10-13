"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ReelLibrary } from "@/lib/instagram/reel-types";

export function ReelSyncButton({
  onLibraryChange,
}: {
  onLibraryChange: (library: ReelLibrary) => void;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  async function sync() {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/instagram/reels", {
        method: "POST",
        headers: { Origin: window.location.origin },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setFeedback({
          error: true,
          text:
            result.error ??
            "Não foi possível sincronizar. Os dados anteriores foram preservados.",
        });
        return;
      }
      const list = await fetch("/api/instagram/reels", { cache: "no-store" });
      if (!list.ok) {
        setFeedback({
          error: true,
          text: "Os Reels foram sincronizados, mas a lista não pôde ser atualizada. Recarregue esta página.",
        });
        return;
      }
      onLibraryChange(await list.json());
      setFeedback({
        error: false,
        text: `${result.synchronized} Reels sincronizados em ${result.pages} página(s). ${result.unclassifiedVideos ? `${result.unclassifiedVideos} vídeos não puderam ser classificados como Reels. ` : ""}${result.unavailableFields?.length ? "Alguns campos opcionais não foram disponibilizados pela Meta. " : ""}`,
      });
    } catch {
      setFeedback({
        error: true,
        text: "A conexão foi interrompida. Os Reels já armazenados permanecem disponíveis; recarregue a lista para consultar o resultado.",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="reel-sync-control">
      <button
        type="button"
        className="button button-secondary"
        disabled={pending}
        onClick={sync}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {pending ? "Sincronizando…" : "Sincronizar Reels"}
      </button>
      {feedback ? (
        <p
          className={feedback.error ? "field-error" : "field-hint"}
          role={feedback.error ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
