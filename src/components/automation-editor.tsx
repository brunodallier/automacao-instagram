"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock3,
  Copy,
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
import { AutomationMessageEditor } from "@/components/automation-message-editor";
import { AutomationConversationPreview } from "@/components/automation-conversation-preview";
import {
  automationDraftSchema,
  EDITOR_LIMITS,
  emptyMessage,
  normalizeAutomationKeyword,
  readStoredStep,
  type AutomationDraft,
  type AutomationStepDraft,
  type StoredStep,
} from "@/lib/automation-draft";
import {
  activationIssues,
  characterCount,
  utf8Bytes,
} from "@/lib/automation-rules";

type TagOption = { id: string; name: string };
type EditorStep = AutomationStepDraft & { editorKey: string };
type EditorState = Omit<AutomationDraft, "steps"> & { steps: EditorStep[] };
type SavedAutomation = {
  id: string;
  name: string;
  scope: AutomationDraft["scope"];
  keywords: { id: string; value: string }[];
  steps: StoredStep[];
};
const stepLabels = {
  SEND_DM: "Mensagem privada",
  BUTTONS: "Mensagem privada",
  PUBLIC_REPLY: "Resposta pública",
  DELAY: "Atraso",
  ADD_TAG: "Adicionar tag",
} as const;
const scopeLabels = {
  GLOBAL: "Global",
  FUTURE_REELS: "Reels futuros",
  SPECIFIC_REELS: "Reels específicos",
} as const;
function fromAutomation(automation?: SavedAutomation): EditorState {
  if (!automation)
    return { name: "", scope: "GLOBAL", keywords: [], steps: [] };
  return {
    name: automation.name,
    scope: automation.scope,
    keywords: automation.keywords.map((keyword) => keyword.value),
    steps: automation.steps.map((step) => ({
      ...readStoredStep(step),
      editorKey: step.id,
    })),
  };
}
function toDraft(state: EditorState): AutomationDraft {
  return {
    ...state,
    steps: state.steps.map((step) => {
      const { editorKey, ...data } = step;
      void editorKey;
      return data;
    }),
  };
}
export function AutomationEditor({
  automation,
  tags,
}: {
  automation?: SavedAutomation;
  tags: TagOption[];
}) {
  const [state, setState] = useState<EditorState>(() =>
    fromAutomation(automation),
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [savedId, setSavedId] = useState(automation?.id ?? "");
  const [saved, setSaved] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const revision = useRef(0);
  const draft = toDraft(state);
  const issues = activationIssues(draft);
  function updateState(update: Partial<EditorState>) {
    revision.current++;
    setState((current) => ({ ...current, ...update }));
    setFeedback(null);
    setSaved(false);
  }
  function addKeyword() {
    const value = keywordInput.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!value) return;
    if (state.keywords.length >= 10 || value.length > 40) {
      setFeedback({
        type: "error",
        text: "Use até 10 palavras-chave de no máximo 40 caracteres.",
      });
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
    updateState({ keywords: [...state.keywords, value] });
    setKeywordInput("");
  }
  function addStep(kind: AutomationStepDraft["kind"]) {
    if (state.steps.length >= EDITOR_LIMITS.steps) return;
    const editorKey = crypto.randomUUID();
    const data: AutomationStepDraft =
      kind === "SEND_DM" || kind === "BUTTONS"
        ? { kind, ...emptyMessage() }
        : kind === "PUBLIC_REPLY"
          ? { kind, text: "" }
          : kind === "DELAY"
            ? { kind, delaySeconds: null }
            : { kind, tagId: "" };
    updateState({ steps: [...state.steps, { ...data, editorKey }] });
    setActiveStep(editorKey);
  }
  function updateStep(key: string, update: Partial<AutomationStepDraft>) {
    revision.current++;
    setState((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.editorKey === key ? ({ ...step, ...update } as EditorStep) : step,
      ),
    }));
    setFeedback(null);
    setSaved(false);
  }
  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= state.steps.length) return;
    const steps = [...state.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    updateState({ steps });
  }
  function duplicateStep(index: number) {
    if (state.steps.length >= EDITOR_LIMITS.steps) return;
    const steps = [...state.steps];
    const copy = {
      ...structuredClone(steps[index]),
      editorKey: crypto.randomUUID(),
    };
    steps.splice(index + 1, 0, copy);
    updateState({ steps });
    setActiveStep(copy.editorKey);
  }
  async function save() {
    const savingRevision = revision.current;
    const result = automationDraftSchema.safeParse(draft);
    if (!result.success) {
      setFeedback({ type: "error", text: result.error.issues[0].message });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        savedId ? "/api/automacoes/" + savedId : "/api/automacoes",
        {
          method: savedId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: window.location.origin,
          },
          body: JSON.stringify(result.data),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.error ?? "Não foi possível salvar o rascunho.");
      setSavedId(data.id);
      const currentVersionSaved = revision.current === savingRevision;
      setSaved(currentVersionSaved);
      setFeedback({
        type: "success",
        text: currentVersionSaved
          ? "Rascunho salvo com segurança."
          : "Rascunho salvo. Há alterações recentes ainda não salvas.",
      });
      if (!savedId)
        window.history.replaceState(null, "", "/automacoes/" + data.id);
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
    setTestMode(true);
    setShowErrors(true);
    setFeedback({
      type: "info",
      text: "Simulação disponível na prévia da conversa. Você pode testar mesmo com campos incompletos.",
    });
  }
  function fieldIssue(path: string) {
    const issue = showErrors
      ? issues.find((item) => item.path === path)
      : undefined;
    return issue ? <p className="field-error">{issue.message}</p> : null;
  }
  const firstMessage = state.steps.findIndex(
    (step) => step.kind === "SEND_DM" || step.kind === "BUTTONS",
  );
  return (
    <>
      <div className="editor-topline">
        <Link href="/automacoes" className="back-link">
          <ArrowLeft size={16} /> Automações
        </Link>
        <div className="editor-actions">
          <span className="draft-state">
            {pending ? "Salvando…" : saved ? "Salvo agora" : "Rascunho"}
          </span>
          <button className="button button-secondary" onClick={testFlow}>
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
          <h1>
            {automation || savedId ? "Editar automação" : "Nova automação"}
          </h1>
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
          className={"editor-feedback editor-feedback-" + feedback.type}
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
                placeholder="Dê um nome quando quiser"
                maxLength={80}
              />
              <span>{characterCount(state.name)}/80</span>
            </div>
            {fieldIssue("name")}
            <p className="editor-hint">
              O nome é opcional enquanto você organiza o rascunho.
            </p>
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
                  disabled
                  readOnly
                />
                <span>
                  <strong>
                    Reels específicos <em>Em breve</em>
                  </strong>
                  <small>Escolha publicações depois da conexão.</small>
                </span>
              </label>
            </fieldset>
            {fieldIssue("scope")}
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
                    addKeyword();
                  }
                }}
                placeholder="Digite e pressione Enter"
                maxLength={40}
              />
              <button
                className="button button-secondary"
                type="button"
                onClick={addKeyword}
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
                      aria-label={"Remover palavra-chave " + keyword}
                      onClick={() =>
                        updateState({
                          keywords: state.keywords.filter(
                            (value) => value !== keyword,
                          ),
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="editor-hint">
                Você pode adicionar até 10 palavras-chave, quando estiver
                pronto.
              </p>
            )}
            {fieldIssue("keywords")}
          </section>
          <section className="card editor-section">
            <div className="editor-section-heading">
              <span className="editor-step-number">3</span>
              <div>
                <h2>Monte a conversa</h2>
                <p>Adicione etapas na ordem em que devem acontecer.</p>
              </div>
              <span className="step-count-badge">
                {state.steps.length}{" "}
                {state.steps.length === 1 ? "etapa" : "etapas"}
              </span>
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
                    className={
                      "editor-step " +
                      (activeStep === step.editorKey ? "is-active" : "")
                    }
                    key={step.editorKey}
                  >
                    <button
                      className="step-summary"
                      type="button"
                      aria-expanded={activeStep === step.editorKey}
                      onClick={() =>
                        setActiveStep(
                          activeStep === step.editorKey ? null : step.editorKey,
                        )
                      }
                    >
                      <span className="step-index">{index + 1}</span>
                      <span>
                        <strong>{stepLabels[step.kind]}</strong>
                        <small>
                          {step.kind === "DELAY"
                            ? step.delaySeconds
                              ? "Aguardar " + step.delaySeconds + "s"
                              : "Defina o tempo de espera"
                            : step.kind === "ADD_TAG"
                              ? tags.find((tag) => tag.id === step.tagId)
                                  ?.name || "Escolha uma tag"
                              : step.text || "Conteúdo ainda vazio"}
                        </small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                    {activeStep === step.editorKey ? (
                      <div className="step-editor">
                        {step.kind === "SEND_DM" || step.kind === "BUTTONS" ? (
                          <AutomationMessageEditor
                            message={step}
                            path={"steps." + index}
                            initial={index === firstMessage}
                            showErrors={showErrors}
                            onChange={(message) =>
                              updateStep(step.editorKey, message)
                            }
                          />
                        ) : step.kind === "PUBLIC_REPLY" ? (
                          <>
                            <label htmlFor={"step-text-" + index}>
                              Resposta pública
                            </label>
                            <textarea
                              id={"step-text-" + index}
                              value={step.text}
                              onChange={(event) =>
                                updateStep(step.editorKey, {
                                  text: event.target.value,
                                })
                              }
                              placeholder="Escreva a resposta pública"
                              maxLength={8000}
                            />
                            <p className="message-count">
                              {characterCount(step.text)} caracteres ·{" "}
                              {utf8Bytes(step.text)} bytes UTF-8
                            </p>
                            {fieldIssue("steps." + index + ".text")}
                          </>
                        ) : step.kind === "DELAY" ? (
                          <>
                            <label htmlFor={"step-delay-" + index}>
                              Esperar antes da próxima etapa
                            </label>
                            <div className="delay-input">
                              <Clock3 size={17} />
                              <input
                                id={"step-delay-" + index}
                                type="number"
                                min={1}
                                max={86400}
                                value={step.delaySeconds ?? ""}
                                placeholder="Defina o tempo"
                                onChange={(event) =>
                                  updateStep(step.editorKey, {
                                    delaySeconds:
                                      event.target.value === ""
                                        ? null
                                        : Number(event.target.value),
                                  })
                                }
                              />
                              <span>segundos</span>
                            </div>
                            {fieldIssue("steps." + index + ".delaySeconds")}
                            <p className="editor-hint">
                              O atraso não estende a janela de mensagens
                              permitida pelo Instagram.
                            </p>
                          </>
                        ) : (
                          <>
                            <label htmlFor={"step-tag-" + index}>
                              Tag para adicionar
                            </label>
                            <select
                              id={"step-tag-" + index}
                              value={step.tagId ?? ""}
                              onChange={(event) =>
                                updateStep(step.editorKey, {
                                  tagId: event.target.value,
                                })
                              }
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
                            {fieldIssue("steps." + index + ".tagId")}
                            {!tags.length ? (
                              <Link href="/tags" className="editor-inline-link">
                                Criar uma tag <ArrowRight size={13} />
                              </Link>
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
                            className="icon-button"
                            onClick={() => duplicateStep(index)}
                            disabled={state.steps.length >= EDITOR_LIMITS.steps}
                            aria-label="Duplicar mensagem ou etapa"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button danger-icon"
                            onClick={() => {
                              updateState({
                                steps: state.steps.filter(
                                  (item) => item.editorKey !== step.editorKey,
                                ),
                              });
                              setActiveStep(null);
                            }}
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
            {fieldIssue("steps")}
            <div className="step-type-picker">
              <span>Adicionar etapa</span>
              <button
                type="button"
                disabled={state.steps.length >= EDITOR_LIMITS.steps}
                onClick={() => addStep("SEND_DM")}
              >
                <Send size={15} /> DM
              </button>
              <button
                type="button"
                disabled={state.steps.length >= EDITOR_LIMITS.steps}
                onClick={() => addStep("ADD_TAG")}
              >
                <Tag size={15} /> Tag
              </button>
              <button
                type="button"
                disabled={state.steps.length >= EDITOR_LIMITS.steps}
                onClick={() => addStep("DELAY")}
              >
                <Clock3 size={15} /> Atraso
              </button>
              <button
                type="button"
                disabled={state.steps.length >= EDITOR_LIMITS.steps}
                onClick={() => addStep("PUBLIC_REPLY")}
              >
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
              <strong>{scopeLabels[state.scope]}</strong>
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
                Você pode salvar campos incompletos. A conexão com o Instagram
                será necessária para ativar a automação.
              </p>
            </div>
            <button
              className="editor-add-button"
              type="button"
              onClick={() => {
                setShowErrors(true);
                setTestMode(true);
                setFeedback({
                  type: "info",
                  text: issues.length
                    ? "Revise " +
                      issues.length +
                      " pendência(s) na prévia. O rascunho pode ser salvo."
                    : "Campos completos. A ativação ainda depende da integração com o Instagram.",
                });
              }}
            >
              Verificar para ativação
            </button>
          </section>
          <AutomationConversationPreview
            draft={draft}
            tags={tags}
            testMode={testMode}
          />
        </aside>
      </div>
    </>
  );
}
