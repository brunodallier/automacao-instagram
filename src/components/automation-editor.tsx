"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock3,
  LoaderCircle,
  MessageCircle,
  MessageSquare,
  Plus,
  Save,
  Send,
  Tag,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  automationDraftSchema,
  normalizeAutomationKeyword,
} from "@/lib/validation";

type TagOption = { id: string; name: string };
type ButtonValue = { label: string; url: string };
type Step =
  | { id?: string; kind: "SEND_DM"; text: string }
  | { id?: string; kind: "PUBLIC_REPLY"; text: string }
  | { id?: string; kind: "DELAY"; delaySeconds: number }
  | { id?: string; kind: "ADD_TAG"; tagId: string }
  | { id?: string; kind: "BUTTONS"; text: string; buttons: ButtonValue[] };
type AutomationState = {
  name: string;
  scope: "GLOBAL" | "FUTURE_REELS" | "SPECIFIC_REELS";
  keywords: string[];
  steps: Step[];
};

type PersistedStep = {
  id: string;
  position: number;
  kind: Step["kind"];
  text: string | null;
  delaySeconds: number | null;
  tagId: string | null;
  buttons: unknown;
};
type SavedAutomation = Omit<AutomationState, "keywords" | "steps"> & {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt: string | null;
  keywords: { id: string; value: string }[];
  steps: PersistedStep[];
};

const defaultState: AutomationState = {
  name: "",
  scope: "GLOBAL",
  keywords: [],
  steps: [],
};
const stepLabels = {
  SEND_DM: "Mensagem privada",
  PUBLIC_REPLY: "Resposta pública",
  DELAY: "Atraso",
  ADD_TAG: "Adicionar tag",
  BUTTONS: "Botões",
} as const;
const stepDescriptions = {
  SEND_DM: "Envie uma DM quando a palavra-chave for identificada.",
  PUBLIC_REPLY: "Responda no comentário publicamente.",
  DELAY: "Espere antes de continuar a conversa.",
  ADD_TAG: "Marque a pessoa para organizar a conversa.",
  BUTTONS: "Ofereça caminhos para a pessoa seguir.",
} as const;

function fromAutomation(automation?: SavedAutomation): AutomationState {
  if (!automation) return defaultState;
  return {
    name: automation.name,
    scope: automation.scope,
    keywords: automation.keywords.map((keyword) => keyword.value),
    steps: automation.steps.map((step): Step => {
      if (step.kind === "SEND_DM" || step.kind === "PUBLIC_REPLY") {
        return { id: step.id, kind: step.kind, text: step.text ?? "" };
      }
      if (step.kind === "DELAY") {
        return { id: step.id, kind: step.kind, delaySeconds: step.delaySeconds ?? 1 };
      }
      if (step.kind === "ADD_TAG") {
        return { id: step.id, kind: step.kind, tagId: step.tagId ?? "" };
      }
      const buttons = Array.isArray(step.buttons)
        ? step.buttons.filter(
            (button): button is ButtonValue =>
              typeof button === "object" &&
              button !== null &&
              "label" in button &&
              typeof button.label === "string" &&
              "url" in button &&
              typeof button.url === "string",
          )
        : [];
      return { id: step.id, kind: "BUTTONS", text: step.text ?? "", buttons };
    }),
  };
}

function displayDelay(seconds: number) {
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}min`;
  return `${seconds}s`;
}

export function AutomationEditor({
  automation,
  tags,
}: {
  automation?: SavedAutomation;
  tags: TagOption[];
}) {
  const [state, setState] = useState<AutomationState>(() =>
    fromAutomation(automation),
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [savedId, setSavedId] = useState(automation?.id ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const visibleId = savedId || automation?.id;

  const stepCountLabel = useMemo(
    () =>
      `${state.steps.length} ${state.steps.length === 1 ? "etapa" : "etapas"}`,
    [state.steps.length],
  );
  function updateState(update: Partial<AutomationState>) {
    setState((current) => ({ ...current, ...update }));
    setFeedback(null);
  }
  function addKeyword(raw: string) {
    const value = raw.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!value) return;
    if (state.keywords.length >= 10) {
      setFeedback({ type: "error", text: "Use no máximo 10 palavras-chave." });
      return;
    }
    if (
      state.keywords.some(
        (keyword) =>
          normalizeAutomationKeyword(keyword) ===
          normalizeAutomationKeyword(value),
      )
    ) {
      setFeedback({
        type: "error",
        text: "Essa palavra-chave já foi adicionada.",
      });
      return;
    }
    if (value.length > 40) {
      setFeedback({
        type: "error",
        text: "Use no máximo 40 caracteres por palavra-chave.",
      });
      return;
    }
    updateState({ keywords: [...state.keywords, value] });
    setKeywordInput("");
  }
  function removeKeyword(keyword: string) {
    updateState({
      keywords: state.keywords.filter((value) => value !== keyword),
    });
  }
  function addStep(kind: Step["kind"]) {
    const step: Step =
      kind === "SEND_DM"
        ? { kind, text: "" }
        : kind === "PUBLIC_REPLY"
          ? { kind, text: "" }
          : kind === "DELAY"
            ? { kind, delaySeconds: 5 }
            : kind === "ADD_TAG"
              ? { kind, tagId: tags[0]?.id ?? "" }
              : { kind, text: "", buttons: [{ label: "", url: "" }] };
    setState((current) => ({ ...current, steps: [...current.steps, step] }));
    setActiveStep(state.steps.length);
    setFeedback(null);
  }
  function updateStep(index: number, update: Partial<Step>) {
    setState((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? ({ ...step, ...update } as Step) : step,
      ),
    }));
    setFeedback(null);
  }
  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= state.steps.length) return;
    const steps = [...state.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    updateState({ steps });
    setActiveStep(target);
  }
  function removeStep(index: number) {
    updateState({
      steps: state.steps.filter((_, stepIndex) => stepIndex !== index),
    });
    setActiveStep(null);
  }
  function validate() {
    const result = automationDraftSchema.safeParse(state);
    return result.success ? null : result.error.issues[0].message;
  }
  async function save() {
    const issue = validate();
    if (issue) {
      setFeedback({ type: "error", text: issue });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        visibleId ? `/api/automacoes/${visibleId}` : "/api/automacoes",
        {
          method: visibleId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: window.location.origin,
          },
          body: JSON.stringify(state),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.error ?? "Não foi possível salvar o rascunho.");
      setSavedId(data.id);
      setFeedback({ type: "success", text: "Rascunho salvo com segurança." });
      if (!visibleId)
        window.history.replaceState(null, "", `/automacoes/${data.id}`);
    } catch (reason) {
      setFeedback({
        type: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Não foi possível salvar o rascunho.",
      });
    } finally {
      setPending(false);
    }
  }
  function testFlow() {
    const issue = validate();
    setFeedback(
      issue
        ? { type: "error", text: issue }
        : { type: "success", text: "O rascunho está pronto para uma revisão." },
    );
    setShowPreview(!issue);
  }

  return (
    <>
      <div className="editor-topline">
        <Link href="/automacoes" className="back-link">
          <ArrowLeft size={16} /> Automações
        </Link>
        <div className="editor-actions">
          <span className="draft-state">
            {pending
              ? "Salvando…"
              : feedback?.type === "success"
                ? "Salvo agora"
                : "Rascunho"}
          </span>
          <button
            className="button button-secondary"
            onClick={testFlow}
            disabled={pending}
          >
            <WandSparkles size={16} /> Testar rascunho
          </button>
          <button
            className="button button-primary"
            onClick={save}
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Save size={16} />
            )}{" "}
            Salvar rascunho
          </button>
        </div>
      </div>
      <div className="editor-heading">
        <div>
          <p className="eyebrow">EDITOR POR ETAPAS</p>
          <h1>{automation ? "Editar automação" : "Nova automação"}</h1>
          <p className="page-description">
            Uma conversa clara começa com um gatilho bem definido.
          </p>
        </div>
        <span className="editor-stage">
          <span>01</span>
          <small>
            Rascunho local
            <br />
            sem conexão ativa
          </small>
        </span>
      </div>
      {feedback ? (
        <div
          className={`editor-feedback editor-feedback-${feedback.type}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.text}
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setFeedback(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="editor-layout">
        <main className="editor-main">
          <section className="card editor-section">
            <div className="editor-section-heading">
              <span className="editor-step-number">1</span>
              <div>
                <h2>Defina a automação</h2>
                <p>
                  Um nome para você encontrar depois e o alcance desta conversa.
                </p>
              </div>
            </div>
            <div className="editor-field">
              <label htmlFor="automation-name">Nome da automação</label>
              <input
                id="automation-name"
                value={state.name}
                onChange={(event) => updateState({ name: event.target.value })}
                placeholder="Ex.: Enviar catálogo"
                maxLength={80}
              />
              <span>{state.name.length}/80</span>
            </div>
            <fieldset className="scope-options">
              <legend>Onde ela deve funcionar?</legend>
              <label className={state.scope === "GLOBAL" ? "selected" : ""}>
                <input
                  type="radio"
                  name="scope"
                  checked={state.scope === "GLOBAL"}
                  onChange={() => updateState({ scope: "GLOBAL" })}
                />
                <span>
                  <strong>Global</strong>
                  <small>Em qualquer Reel da conta.</small>
                </span>
              </label>
              <label
                className={state.scope === "FUTURE_REELS" ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="scope"
                  checked={state.scope === "FUTURE_REELS"}
                  onChange={() => updateState({ scope: "FUTURE_REELS" })}
                />
                <span>
                  <strong>Reels futuros</strong>
                  <small>Nos próximos Reels que você publicar.</small>
                </span>
              </label>
              <label className="scope-disabled">
                <input
                  type="radio"
                  name="scope"
                  checked={state.scope === "SPECIFIC_REELS"}
                  onChange={() =>
                    setFeedback({
                      type: "info",
                      text: "Conecte o Instagram para selecionar Reels específicos.",
                    })
                  }
                  disabled
                />
                <span>
                  <strong>
                    Reels específicos <em>Em breve</em>
                  </strong>
                  <small>Escolha publicações depois da conexão.</small>
                </span>
              </label>
            </fieldset>
          </section>
          <section className="card editor-section">
            <div className="editor-section-heading">
              <span className="editor-step-number">2</span>
              <div>
                <h2>Escolha as palavras-chave</h2>
                <p>Quando alguém comentar uma delas, a conversa começa.</p>
              </div>
            </div>
            <div className="keyword-input">
              <label className="sr-only" htmlFor="keyword">
                Adicionar palavra-chave
              </label>
              <input
                id="keyword"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addKeyword(keywordInput);
                  }
                }}
                placeholder="Digite e pressione Enter"
                maxLength={40}
              />
              <button
                className="button button-secondary"
                type="button"
                onClick={() => addKeyword(keywordInput)}
              >
                <Plus size={16} /> Adicionar
              </button>
            </div>
            {state.keywords.length ? (
              <div
                className="keyword-chips"
                aria-label="Palavras-chave adicionadas"
              >
                {state.keywords.map((keyword) => (
                  <span key={keyword}>
                    {keyword}
                    <button
                      type="button"
                      aria-label={`Remover palavra-chave ${keyword}`}
                      onClick={() => removeKeyword(keyword)}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="editor-hint">
                Você pode adicionar até 10 palavras-chave. Ex.: quero, catálogo,
                preço.
              </p>
            )}
          </section>
          <section className="card editor-section">
            <div className="editor-section-heading">
              <span className="editor-step-number">3</span>
              <div>
                <h2>Monte a conversa</h2>
                <p>Adicione etapas na ordem em que devem acontecer.</p>
              </div>
              <span className="step-count-badge">{stepCountLabel}</span>
            </div>
            {state.steps.length === 0 ? (
              <div className="steps-empty">
                <MessageSquare size={22} />
                <p>Comece com uma mensagem privada ou outra etapa abaixo.</p>
              </div>
            ) : (
              <div className="editor-steps">
                {state.steps.map((step, index) => (
                  <div
                    className={`editor-step ${activeStep === index ? "is-active" : ""}`}
                    key={`${step.kind}-${index}`}
                  >
                    <button
                      className="step-summary"
                      type="button"
                      onClick={() =>
                        setActiveStep(activeStep === index ? null : index)
                      }
                    >
                      <span className="step-index">{index + 1}</span>
                      <span>
                        <strong>{stepLabels[step.kind]}</strong>
                        <small>
                          {step.kind === "DELAY"
                            ? `Aguardar ${displayDelay(step.delaySeconds)}`
                            : step.kind === "ADD_TAG"
                              ? tags.find((tag) => tag.id === step.tagId)
                                  ?.name || "Escolha uma tag"
                              : step.kind === "BUTTONS"
                                ? `${step.buttons.length} ${step.buttons.length === 1 ? "botão" : "botões"}`
                                : step.text || stepDescriptions[step.kind]}
                        </small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                    {activeStep === index ? (
                      <div className="step-editor">
                        {step.kind === "SEND_DM" ||
                        step.kind === "PUBLIC_REPLY" ? (
                          <>
                            <label htmlFor={`step-text-${index}`}>
                              {step.kind === "SEND_DM"
                                ? "Mensagem da DM"
                                : "Resposta pública"}
                            </label>
                            <textarea
                              id={`step-text-${index}`}
                              value={step.text}
                              onChange={(event) =>
                                updateStep(index, { text: event.target.value })
                              }
                              placeholder={
                                step.kind === "SEND_DM"
                                  ? "Oi! Vi que você comentou…"
                                  : "Obrigado por comentar!"
                              }
                              maxLength={step.kind === "SEND_DM" ? 2000 : 500}
                            />
                            <span className="textarea-count">
                              {step.text.length}/
                              {step.kind === "SEND_DM" ? 2000 : 500}
                            </span>
                          </>
                        ) : step.kind === "DELAY" ? (
                          <>
                            <label htmlFor={`step-delay-${index}`}>
                              Esperar antes da próxima etapa
                            </label>
                            <div className="delay-input">
                              <Clock3 size={17} />
                              <input
                                id={`step-delay-${index}`}
                                type="number"
                                min={1}
                                max={86400}
                                value={step.delaySeconds}
                                onChange={(event) =>
                                  updateStep(index, {
                                    delaySeconds: Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  })
                                }
                              />
                              <span>segundos</span>
                            </div>
                            <p className="editor-hint">
                              O atraso será aplicado entre as etapas.
                            </p>
                          </>
                        ) : step.kind === "ADD_TAG" ? (
                          <>
                            <label htmlFor={`step-tag-${index}`}>
                              Tag para adicionar
                            </label>
                            <select
                              id={`step-tag-${index}`}
                              value={step.tagId}
                              onChange={(event) =>
                                updateStep(index, { tagId: event.target.value })
                              }
                              disabled={!tags.length}
                            >
                              <option value="">
                                {tags.length
                                  ? "Selecione uma tag"
                                  : "Crie uma tag primeiro"}
                              </option>
                              {tags.map((tag) => (
                                <option key={tag.id} value={tag.id}>
                                  {tag.name}
                                </option>
                              ))}
                            </select>
                            {!tags.length ? (
                              <Link href="/tags" className="editor-inline-link">
                                Criar uma tag <ArrowRight size={13} />
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <label htmlFor={`step-buttons-text-${index}`}>
                              Mensagem acima dos botões
                            </label>
                            <textarea
                              id={`step-buttons-text-${index}`}
                              value={step.text}
                              onChange={(event) =>
                                updateStep(index, { text: event.target.value })
                              }
                              placeholder="Escolha uma opção para continuar"
                              maxLength={500}
                            />
                            <div className="button-fields">
                              {step.buttons.map((button, buttonIndex) => (
                                <div
                                  className="button-field-row"
                                  key={buttonIndex}
                                >
                                  <input
                                    aria-label={`Texto do botão ${buttonIndex + 1}`}
                                    value={button.label}
                                    onChange={(event) =>
                                      updateStep(index, {
                                        buttons: step.buttons.map(
                                          (item, itemIndex) =>
                                            itemIndex === buttonIndex
                                              ? {
                                                  ...item,
                                                  label: event.target.value,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                    placeholder="Texto do botão"
                                    maxLength={30}
                                  />
                                  <input
                                    aria-label={`Link do botão ${buttonIndex + 1}`}
                                    value={button.url}
                                    onChange={(event) =>
                                      updateStep(index, {
                                        buttons: step.buttons.map(
                                          (item, itemIndex) =>
                                            itemIndex === buttonIndex
                                              ? {
                                                  ...item,
                                                  url: event.target.value,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                    placeholder="https://…"
                                    maxLength={500}
                                  />
                                  <button
                                    type="button"
                                    className="icon-button danger-icon"
                                    aria-label={`Remover botão ${buttonIndex + 1}`}
                                    onClick={() =>
                                      updateStep(index, {
                                        buttons: step.buttons.filter(
                                          (_, itemIndex) =>
                                            itemIndex !== buttonIndex,
                                        ),
                                      })
                                    }
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              ))}
                            </div>
                            {step.buttons.length < 3 ? (
                              <button
                                type="button"
                                className="editor-add-button"
                                onClick={() =>
                                  updateStep(index, {
                                    buttons: [
                                      ...step.buttons,
                                      { label: "", url: "" },
                                    ],
                                  })
                                }
                              >
                                <Plus size={14} /> Adicionar botão
                              </button>
                            ) : null}
                          </>
                        )}
                        <div className="step-controls">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => moveStep(index, -1)}
                            disabled={index === 0}
                            aria-label="Mover etapa para cima"
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => moveStep(index, 1)}
                            disabled={index === state.steps.length - 1}
                            aria-label="Mover etapa para baixo"
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button danger-icon"
                            onClick={() => removeStep(index)}
                            aria-label="Excluir etapa"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className="step-type-picker">
              <span>Adicionar etapa</span>
              <button type="button" onClick={() => addStep("SEND_DM")}>
                <Send size={15} /> DM
              </button>
              <button type="button" onClick={() => addStep("BUTTONS")}>
                <WandSparkles size={15} /> Botões
              </button>
              <button
                type="button"
                onClick={() => addStep("ADD_TAG")}
                disabled={!tags.length}
              >
                <Tag size={15} /> Tag
              </button>
              <button type="button" onClick={() => addStep("DELAY")}>
                <Clock3 size={15} /> Atraso
              </button>
              <button type="button" onClick={() => addStep("PUBLIC_REPLY")}>
                <MessageCircle size={15} /> Resposta pública
              </button>
            </div>
          </section>
        </main>
        <aside className="editor-sidebar">
          <section className="card editor-summary">
            <div className="editor-summary-heading">
              <WandSparkles size={18} />
              <h2>Resumo</h2>
            </div>
            <div className="summary-row">
              <span>Nome</span>
              <strong>{state.name || "Sem nome ainda"}</strong>
            </div>
            <div className="summary-row">
              <span>Escopo</span>
              <strong>
                {state.scope === "GLOBAL" ? "Global" : "Reels futuros"}
              </strong>
            </div>
            <div className="summary-row">
              <span>Gatilhos</span>
              <strong>{state.keywords.length || "Nenhum"}</strong>
            </div>
            <div className="summary-row">
              <span>Etapas</span>
              <strong>{state.steps.length}</strong>
            </div>
            <div className="editor-sidebar-note">
              <MessageSquare size={16} />
              <p>
                Esta etapa salva um rascunho. A conexão com o Instagram será
                necessária para ativar a automação.
              </p>
            </div>
          </section>
          <section className="card editor-preview">
            <div className="editor-summary-heading">
              <MessageSquare size={18} />
              <h2>Prévia da conversa</h2>
            </div>
            {showPreview && state.steps.length ? (
              <div className="preview-messages">
                {state.steps.map((step, index) => (
                  <div
                    className={`preview-message preview-${step.kind}`}
                    key={index}
                  >
                    {step.kind === "DELAY" ? (
                      <>
                        <Clock3 size={14} /> Aguardar{" "}
                        {displayDelay(step.delaySeconds)}
                      </>
                    ) : step.kind === "ADD_TAG" ? (
                      <>
                        <Tag size={14} /> Adicionar “
                        {tags.find((tag) => tag.id === step.tagId)?.name ||
                          "tag"}
                        ”
                      </>
                    ) : step.kind === "BUTTONS" ? (
                      <>
                        <span>{step.text || "Mensagem com opções"}</span>
                        <div>
                          {step.buttons
                            .filter((button) => button.label)
                            .map((button) => (
                              <small key={button.label}>{button.label}</small>
                            ))}
                        </div>
                      </>
                    ) : (
                      step.text ||
                      (step.kind === "SEND_DM"
                        ? "Sua mensagem privada"
                        : "Sua resposta pública")
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="preview-placeholder">
                <MessageSquare size={22} />
                <p>
                  Preencha as etapas e clique em testar para visualizar a
                  sequência.
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
