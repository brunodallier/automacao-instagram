"use client";
import { useState } from "react";
import { ReelList } from "./reel-list";
import { ReelSyncButton } from "./reel-sync-button";
import type { ReelLibrary } from "@/lib/instagram/reel-types";

export function ReelLibraryView({ initial }: { initial: ReelLibrary }) {
  const [library, setLibrary] = useState(initial);
  return (
    <section className="card" aria-label="Meus Reels">
      <div className="reel-toolbar">
        <p className="muted">
          {library.items.length} Reels armazenados
          {library.lastSyncedAt
            ? ` · Última sincronização: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(library.lastSyncedAt))}`
            : ""}
        </p>
        <ReelSyncButton onLibraryChange={setLibrary} />
      </div>
      <ReelList items={library.items} />
    </section>
  );
}
