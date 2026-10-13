"use client";
import { useState } from "react";
import { Film } from "lucide-react";
import type { ReelOption } from "@/lib/instagram/reel-types";

function ReelThumbnail({ reel }: { reel: ReelOption }) {
  const [failed, setFailed] = useState(false);
  return reel.thumbnailUrl && !failed ? (
    // Meta thumbnail URLs expire; display directly without persisting an optimized copy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="reel-thumbnail"
      src={reel.thumbnailUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="reel-thumbnail reel-thumbnail-empty"
      aria-label="Miniatura indisponível"
    >
      <Film size={22} />
    </span>
  );
}
export function ReelList({
  items,
  selectedIds,
  onSelectionChange,
}: {
  items: ReelOption[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(30);
  const query = search.normalize("NFKC").toLocaleLowerCase("pt-BR").trim();
  const filtered = items.filter((reel) =>
    [reel.caption ?? "", reel.externalId, reel.username ?? ""].some((value) =>
      value.normalize("NFKC").toLocaleLowerCase("pt-BR").includes(query),
    ),
  );
  function toggle(id: string, checked: boolean) {
    onSelectionChange?.(
      checked
        ? [...(selectedIds ?? []), id]
        : (selectedIds ?? []).filter((selected) => selected !== id),
    );
  }
  return (
    <div className="reel-browser">
      <label className="sr-only" htmlFor="reel-search">
        Pesquisar Reels
      </label>
      <input
        id="reel-search"
        type="search"
        placeholder="Pesquisar legenda ou ID"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setLimit(30);
        }}
      />
      <p className="field-hint">
        {filtered.length}{" "}
        {filtered.length === 1 ? "Reel encontrado" : "Reels encontrados"}
        {selectedIds ? ` · ${selectedIds.length} selecionados` : ""}
      </p>
      {!filtered.length ? (
        <p className="muted">
          {items.length
            ? "Nenhum Reel corresponde à pesquisa."
            : "Nenhum Reel sincronizado. Use Sincronizar Reels para consultar sua conta."}
        </p>
      ) : null}
      <ul className="reel-list">
        {filtered.slice(0, limit).map((reel) => (
          <li
            key={reel.id}
            className={
              selectedIds?.includes(reel.id) ? "reel-row selected" : "reel-row"
            }
          >
            {onSelectionChange ? (
              <label className="reel-select-control">
                <input
                  type="checkbox"
                  aria-label={`Selecionar Reel ${reel.externalId}`}
                  checked={selectedIds?.includes(reel.id) ?? false}
                  disabled={
                    !selectedIds?.includes(reel.id) &&
                    (selectedIds?.length ?? 0) >= 1000
                  }
                  onChange={(event) => toggle(reel.id, event.target.checked)}
                />
              </label>
            ) : null}
            <ReelThumbnail reel={reel} />
            <div className="reel-copy">
              <p title={reel.caption ?? undefined}>
                {reel.caption
                  ? Array.from(reel.caption).slice(0, 160).join("") +
                    (Array.from(reel.caption).length > 160 ? "…" : "")
                  : "Legenda não disponível"}
              </p>
              <small>
                {reel.username ? `@${reel.username} · ` : ""}
                {reel.publishedAt ? (
                  <time dateTime={reel.publishedAt}>
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(reel.publishedAt))}
                  </time>
                ) : (
                  "Data não disponível"
                )}
              </small>
              <small>ID {reel.externalId}</small>
            </div>
            {reel.permalink ? (
              <a
                className="text-link"
                href={reel.permalink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver no Instagram
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {filtered.length > limit ? (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setLimit((current) => current + 30)}
        >
          Mostrar mais Reels
        </button>
      ) : null}
    </div>
  );
}
