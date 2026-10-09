"use client";

import Link from "next/link";
import { useState } from "react";
import { Ellipsis, LoaderCircle, Pencil, Trash2, Workflow } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";

type AutomationItem = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR";
  scope: "GLOBAL" | "FUTURE_REELS" | "SPECIFIC_REELS";
  createdAt: string;
  updatedAt: string;
  lastExecutedAt: string | null;
  keywords: { id: string; value: string }[];
  steps: unknown[];
};
const statusLabels = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ERROR: "Erro",
} as const;
const scopeLabels = {
  GLOBAL: "Global",
  FUTURE_REELS: "Reels futuros",
  SPECIFIC_REELS: "Reels específicos",
} as const;
const tone = {
  DRAFT: "neutral",
  ACTIVE: "green",
  PAUSED: "amber",
  ERROR: "neutral",
} as const;

export function AutomationTable({
  initialItems,
}: {
  initialItems: AutomationItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  async function remove(item: AutomationItem) {
    if (
      !window.confirm(
        `Excluir a automação “${item.name}”? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setPending(item.id);
    setError("");
    try {
      const response = await fetch(`/api/automacoes/${item.id}`, {
        method: "DELETE",
        headers: { Origin: window.location.origin },
      });
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error ??
            "Não foi possível excluir.",
        );
      setItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir a automação.",
      );
    } finally {
      setPending(null);
      setOpenId(null);
    }
  }
  return (
    <section className="card automation-list">
      <div className="section-heading">
        <h2>Suas automações</h2>
        <span className="count-label">
          {items.length} {items.length === 1 ? "automação" : "automações"}
        </span>
      </div>
      {error ? (
        <p className="form-error table-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Automações cadastradas</caption>
          <thead>
            <tr>
              {[
                "Nome",
                "Status",
                "Escopo",
                "Criação",
                "Última execução",
                "Ações",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link
                    className="automation-name"
                    href={`/automacoes/${item.id}`}
                  >
                    <Workflow size={16} aria-hidden="true" />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.keywords.length}{" "}
                        {item.keywords.length === 1
                          ? "palavra-chave"
                          : "palavras-chave"}{" "}
                        · {item.steps.length}{" "}
                        {item.steps.length === 1 ? "etapa" : "etapas"}
                      </small>
                    </span>
                  </Link>
                </td>
                <td>
                  <Badge tone={tone[item.status]}>
                    {statusLabels[item.status]}
                  </Badge>
                </td>
                <td className="muted">{scopeLabels[item.scope]}</td>
                <td className="muted">
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "medium",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(item.createdAt))}
                </td>
                <td className="muted">
                  {item.lastExecutedAt
                    ? new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "medium",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(item.lastExecutedAt))
                    : "Ainda não executada"}
                </td>
                <td>
                  <div className="row-actions automation-actions">
                    <Link
                      className="icon-button"
                      href={`/automacoes/${item.id}`}
                      aria-label={`Editar automação ${item.name}`}
                      title="Editar"
                    >
                      <Pencil size={17} />
                    </Link>
                    <button
                      className="icon-button"
                      aria-label={`Mais ações para ${item.name}`}
                      title="Mais ações"
                      onClick={() =>
                        setOpenId(openId === item.id ? null : item.id)
                      }
                    >
                      <Ellipsis size={17} />
                    </button>
                    {openId === item.id ? (
                      <div className="action-menu">
                        <Link href={`/automacoes/${item.id}`}>
                          <Pencil size={14} /> Editar
                        </Link>
                        <button
                          onClick={() => remove(item)}
                          disabled={pending === item.id}
                        >
                          {pending === item.id ? (
                            <LoaderCircle className="spin" size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}{" "}
                          Excluir
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Nenhuma automação por aqui"
          description="Crie um novo rascunho para começar."
        />
      ) : null}
    </section>
  );
}
