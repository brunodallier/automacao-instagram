"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/ui";
import { normalizeTagName, tagSchema } from "@/lib/validation";

type TagItem = { id: string; name: string; createdAt: string };
type DialogState = { kind: "rename" | "delete"; tag: TagItem } | null;

async function requestTag(url: string, method: string, name?: string) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: name !== undefined ? JSON.stringify({ name }) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error ?? "Não foi possível concluir. Tente novamente.",
    );
  }
  return response.status === 204 ? null : (response.json() as Promise<TagItem>);
}

export function TagManager({ initialTags }: { initialTags: TagItem[] }) {
  const [tags, setTags] = useState(initialTags);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [editName, setEditName] = useState("");
  const [dialogError, setDialogError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialogState) dialog.current?.showModal();
    else dialog.current?.close();
  }, [dialogState]);

  function validate(value: string, exceptId?: string) {
    const parsed = tagSchema.safeParse({ name: value });
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    if (
      tags.some(
        (tag) =>
          tag.id !== exceptId &&
          normalizeTagName(tag.name) === normalizeTagName(parsed.data.name),
      )
    )
      throw new Error("Já existe uma tag com esse nome.");
    return parsed.data.name;
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const validName = validate(name);
      setPending(true);
      const tag = await requestTag("/api/tags", "POST", validName);
      if (tag) setTags((items) => [tag, ...items]);
      setName("");
      setMessage("Tag criada com sucesso.");
      input.current?.focus();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível criar a tag. Verifique sua conexão.",
      );
    } finally {
      setPending(false);
    }
  }

  function openDialog(kind: "rename" | "delete", tag: TagItem) {
    setDialogError("");
    setEditName(tag.name);
    setDialogState({ kind, tag });
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialogState) return;
    setDialogError("");
    setMessage("");
    try {
      const value =
        dialogState.kind === "rename"
          ? validate(editName, dialogState.tag.id)
          : undefined;
      setPending(true);
      const result = await requestTag(
        `/api/tags/${dialogState.tag.id}`,
        dialogState.kind === "rename" ? "PATCH" : "DELETE",
        value,
      );
      if (dialogState.kind === "delete")
        setTags((items) =>
          items.filter((item) => item.id !== dialogState.tag.id),
        );
      else if (result)
        setTags((items) =>
          items.map((item) => (item.id === result.id ? result : item)),
        );
      setMessage(
        dialogState.kind === "delete"
          ? "Tag excluída com sucesso."
          : "Tag renomeada com sucesso.",
      );
      setDialogState(null);
    } catch (reason) {
      setDialogError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar. Verifique sua conexão.",
      );
    } finally {
      setPending(false);
    }
  }

  const visibleTags = tags.filter((tag) =>
    normalizeTagName(tag.name).includes(normalizeTagName(search.trim())),
  );
  return (
    <>
      <section className="card create-tag-card">
        <div>
          <span className="form-icon">
            <Tag size={21} aria-hidden="true" />
          </span>
          <h2>Criar uma tag</h2>
          <p>Escolha um nome que faça sentido para seu negócio.</p>
        </div>
        <form onSubmit={create} noValidate>
          <label className="sr-only" htmlFor="tag-name">
            Nome da nova tag
          </label>
          <div className="input-with-button">
            <input
              ref={input}
              id="tag-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da tag"
              maxLength={50}
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? "tag-error" : "tag-hint"}
              disabled={pending}
            />
            <button className="button button-primary" disabled={pending}>
              {pending ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Plus size={17} />
              )}{" "}
              Criar tag
            </button>
          </div>
          <p className="field-hint" id="tag-hint">
            Até 50 caracteres. Você pode renomear depois.
          </p>
          {error ? (
            <p role="alert" id="tag-error" className="form-error">
              {error}
            </p>
          ) : null}
        </form>
      </section>
      <div className="feedback-message" role="status" aria-live="polite">
        {message ? (
          <>
            <Check size={16} aria-hidden="true" />
            {message}
          </>
        ) : null}
      </div>
      <section className="card tags-list">
        <div className="section-heading">
          <div className="inline-heading">
            <h2>Suas tags</h2>
            <span className="count-pill">{tags.length}</span>
          </div>
          {tags.length > 0 ? (
            <div className="search-field">
              <Search size={16} aria-hidden="true" />
              <label htmlFor="tag-search" className="sr-only">
                Buscar tags
              </label>
              <input
                id="tag-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar tag"
              />
            </div>
          ) : null}
        </div>
        {tags.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Um espaço para suas próprias tags"
            description="Nenhuma tag por aqui ainda. Crie a primeira no campo acima e organize do seu jeito."
          />
        ) : visibleTags.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhuma tag encontrada"
            description="Tente buscar outro nome ou limpe a busca."
          >
            <button
              className="button button-secondary"
              onClick={() => setSearch("")}
            >
              Limpar busca
            </button>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Tags cadastradas no seu espaço
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nome da tag</th>
                  <th scope="col">Criada em</th>
                  <th scope="col" className="align-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTags.map((tag) => (
                  <tr key={tag.id}>
                    <td>
                      <span className="tag-chip">
                        <Tag size={14} aria-hidden="true" />
                        {tag.name}
                      </span>
                    </td>
                    <td className="muted">
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "medium",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(tag.createdAt))}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Renomear tag ${tag.name}`}
                          title="Renomear tag"
                          disabled={pending}
                          onClick={() => openDialog("rename", tag)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="icon-button danger-icon"
                          aria-label={`Excluir tag ${tag.name}`}
                          title="Excluir tag"
                          disabled={pending}
                          onClick={() => openDialog("delete", tag)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="tag-explanation">
        <Tag size={18} aria-hidden="true" />
        <p>
          Suas tags poderão ser reutilizadas em contatos e automações. Ao
          renomear, o identificador da tag é preservado.
        </p>
      </div>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="tag-dialog-title"
        onCancel={(event) => {
          if (pending) event.preventDefault();
          else setDialogState(null);
        }}
        onClose={() => {
          if (!pending) setDialogState(null);
        }}
      >
        <form onSubmit={confirm} noValidate>
          <div className="modal-heading">
            <span
              className={`modal-icon ${dialogState?.kind === "delete" ? "modal-icon-danger" : ""}`}
            >
              {dialogState?.kind === "delete" ? (
                <Trash2 size={23} />
              ) : (
                <Pencil size={23} />
              )}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Fechar janela"
              disabled={pending}
              onClick={() => setDialogState(null)}
            >
              <X size={20} />
            </button>
          </div>
          <h2 id="tag-dialog-title">
            {dialogState?.kind === "delete"
              ? "Excluir esta tag?"
              : "Renomear tag"}
          </h2>
          {dialogState?.kind === "delete" ? (
            <p>
              A tag <strong>“{dialogState.tag.name}”</strong> será removida do
              seu espaço. Esta ação não pode ser desfeita.
            </p>
          ) : (
            <>
              <p>
                Dê um novo nome. O identificador e as futuras associações serão
                preservados.
              </p>
              <label htmlFor="edit-tag-name">Nome da tag</label>
              <input
                id="edit-tag-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                maxLength={50}
                disabled={pending}
                aria-invalid={!!dialogError}
                aria-describedby={dialogError ? "dialog-error" : undefined}
              />
            </>
          )}
          {dialogError ? (
            <p className="form-error" role="alert" id="dialog-error">
              {dialogError}
            </p>
          ) : null}
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={pending}
              onClick={() => setDialogState(null)}
            >
              Cancelar
            </button>
            <button
              className={`button ${dialogState?.kind === "delete" ? "button-danger" : "button-primary"}`}
              disabled={pending}
            >
              {pending ? <LoaderCircle size={16} className="spin" /> : null}
              {dialogState?.kind === "delete" ? "Excluir tag" : "Salvar nome"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
