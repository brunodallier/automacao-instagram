"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  Tag,
} from "lucide-react";
import {
  type AutomationDraft,
  type MessageDraft,
} from "@/lib/automation-draft";
import {
  activationIssues,
  isHttpsUrl,
  matchingKeywords,
} from "@/lib/automation-rules";
import {
  fallbackPublicReply,
  rotatingPublicReply,
  type DmOutcome,
} from "@/lib/public-replies";

type Entry = { path: string; message: MessageDraft; initial: boolean };

export function AutomationConversationPreview({
  draft,
  tags,
  testMode,
}: {
  draft: AutomationDraft;
  tags: { id: string; name: string }[];
  testMode: boolean;
}) {
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [urlChoice, setUrlChoice] = useState<{
    path: string;
    index: number;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [tested, setTested] = useState(false);
  const [replied, setReplied] = useState(false);
  const [publicCursor, setPublicCursor] = useState(-1);
  const [dmOutcome, setDmOutcome] = useState<DmOutcome["kind"]>("UNCONFIRMED");
  const alternative = testMode
    ? fallbackPublicReply(
        draft.publicReplies,
        dmOutcome === "DEFINITIVE_FAILURE"
          ? {
              kind: dmOutcome,
              identifiedError:
                "Erro definitivo fictício selecionado no simulador",
              fallbackJustified: true,
            }
          : { kind: dmOutcome },
      )
    : null;
  const publicText =
    alternative ??
    rotatingPublicReply(draft.publicReplies, Math.max(0, publicCursor));
  const matches = matchingKeywords(comment, draft.keywords);
  const issues = activationIssues(draft);
  const triggered = !testMode || !tested || matches.length > 0;
  const entries: Entry[] = [];
  const annotations: { path: string; kind: string; text: string }[] = [];
  let first = true;
  let blocked = false;
  draft.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    if (step.kind === "SEND_DM" || step.kind === "BUTTONS") {
      if (!first && !replied) {
        blocked = true;
        return;
      }
      entries.push({ path, message: step, initial: first });
      first = false;
      let parent = path;
      let message: MessageDraft = step;
      for (let depth = 0; depth < 8; depth++) {
        const button = message.buttons[choices[parent]];
        if (!button || button.action !== "NEXT_MESSAGE" || !button.nextMessage)
          break;
        parent = `${parent}.buttons.${choices[parent]}.nextMessage`;
        message = button.nextMessage;
        entries.push({ path: parent, message, initial: false });
      }
    } else if (step.kind === "DELAY")
      annotations.push({
        path,
        kind: step.kind,
        text: step.delaySeconds
          ? `Aguardar ${step.delaySeconds} segundos · simulação`
          : "Atraso ainda não definido",
      });
    else if (step.kind === "ADD_TAG")
      annotations.push({
        path,
        kind: step.kind,
        text: `Adicionar tag: ${tags.find((tag) => tag.id === step.tagId)?.name || "ainda não selecionada"} · simulação`,
      });
  });
  const chosenUrl = urlChoice
    ? entries.find((entry) => entry.path === urlChoice.path)?.message.buttons[
        urlChoice.index
      ]
    : null;
  const safeUrl =
    chosenUrl?.action === "OPEN_URL" && isHttpsUrl(chosenUrl.url)
      ? chosenUrl.url.trim()
      : null;

  function restart() {
    setChoices({});
    setUrlChoice(null);
    setReplied(false);
    setTested(false);
    setPublicCursor(-1);
    setDmOutcome("UNCONFIRMED");
  }
  function choose(entry: Entry, index: number) {
    const button = entry.message.buttons[index];
    if (button.action === "OPEN_URL") {
      setUrlChoice({ path: entry.path, index });
      return;
    }
    setUrlChoice(null);
    setChoices((current) => ({
      ...Object.fromEntries(
        Object.entries(current).filter(
          ([path]) => path !== entry.path && !path.startsWith(`${entry.path}.`),
        ),
      ),
      [entry.path]: index,
    }));
  }
  function back() {
    if (urlChoice) {
      setUrlChoice(null);
      return;
    }
    const paths = Object.keys(choices);
    const deepest = paths.sort((a, b) => b.length - a.length)[0];
    if (deepest)
      setChoices((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([path]) => path !== deepest),
        ),
      );
    setUrlChoice(null);
  }
  return (
    <section className="card editor-preview" aria-label="Simulador de conversa">
      <div className="editor-summary-heading">
        <MessageSquare size={18} />
        <h2>Prévia da conversa</h2>
      </div>
      <div className="conversation-header">
        <span className="conversation-avatar">
          <MessageSquare size={16} />
        </span>
        <div>
          <strong>Sua conversa</strong>
          <small>Simulação local · nenhum envio real</small>
        </div>
      </div>
      {testMode ? (
        <div className="comment-simulator">
          <label htmlFor="simulated-comment">Comentário fictício</label>
          <textarea
            id="simulated-comment"
            value={comment}
            placeholder="Escreva um comentário para testar"
            maxLength={2000}
            onChange={(event) => {
              setComment(event.target.value);
              setTested(false);
            }}
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setTested(true);
              setChoices({});
              setUrlChoice(null);
              setReplied(false);
              setPublicCursor((current) => current + 1);
              setDmOutcome("UNCONFIRMED");
            }}
          >
            Simular comentário
          </button>
          {tested ? (
            <p
              role="status"
              className={`trigger-result ${matches.length ? "is-match" : ""}`}
            >
              {matches.length
                ? `O comentário acionaria a automação. Palavra-chave: ${matches.join(", ")}.`
                : draft.keywords.length
                  ? "O comentário não acionaria a automação: nenhuma palavra-chave foi encontrada."
                  : "Nenhuma palavra-chave cadastrada. O comentário não acionaria a automação."}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="preview-messages" aria-live="polite">
        {triggered
          ? entries.map((entry) => (
              <div className="conversation-entry" key={entry.path}>
                <small className="conversation-message-context">
                  {entry.initial
                    ? "Primeira resposta privada ao comentário"
                    : "Mensagem após interação · hipótese da simulação"}
                </small>
                <div className="preview-message preview-SEND_DM">
                  <span className="conversation-text">
                    {entry.message.text || <em>Mensagem ainda vazia</em>}
                  </span>
                  {entry.message.buttons.length ? (
                    <div className="conversation-buttons">
                      {entry.message.buttons.map((button, index) => (
                        <button
                          key={index}
                          type="button"
                          className={
                            choices[entry.path] === index &&
                            button.action === "NEXT_MESSAGE"
                              ? "is-selected"
                              : ""
                          }
                          onClick={() => choose(entry, index)}
                        >
                          {button.label || "Botão sem título"}
                          {button.action === "OPEN_URL" ? (
                            <ExternalLink size={12} />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {entry.message.buttons.some(
                  (button) =>
                    button.action === "NEXT_MESSAGE" && !button.nextMessage,
                ) ? (
                  <p className="editor-hint">
                    Há um botão com próxima mensagem ainda não configurada.
                  </p>
                ) : null}
                {entry.initial && entry.message.buttons.length ? (
                  <p className="editor-hint">
                    Prévia do conteúdo. Botões nesta primeira resposta ainda
                    dependem de confirmação pela Meta.
                  </p>
                ) : null}
              </div>
            ))
          : null}
        {triggered && !entries.length ? (
          <div className="preview-placeholder">
            <MessageSquare size={22} />
            <p>Adicione uma mensagem para acompanhar a prévia em tempo real.</p>
          </div>
        ) : null}
      </div>
      {chosenUrl?.action === "OPEN_URL" ? (
        <div className="simulated-url" role="status">
          <strong>
            {safeUrl
              ? "URL que seria aberta"
              : "URL ainda incompleta ou inválida"}
          </strong>
          <p>{chosenUrl.url || "Nenhum endereço informado"}</p>
          {safeUrl ? (
            <a href={safeUrl} target="_blank" rel="noopener noreferrer">
              Abrir site em nova aba <ExternalLink size={12} />
            </a>
          ) : null}
          <small>
            Este clique não autoriza outra mensagem. No Instagram, o aplicativo
            controla a abertura do site.
          </small>
        </div>
      ) : null}
      {triggered && blocked ? (
        <div className="simulation-wait">
          <p>
            As outras DMs da sequência aguardam uma resposta elegível e a janela
            de 24 horas.
          </p>
          <button
            className="editor-add-button"
            type="button"
            onClick={() => setReplied(true)}
          >
            Simular resposta recebida
          </button>
        </div>
      ) : null}
      {triggered && annotations.length ? (
        <div className="simulation-actions">
          <h3>Outras etapas · apenas simulação</h3>
          {annotations.map((item) => (
            <div
              className={`preview-message preview-${item.kind}`}
              key={item.path}
            >
              {item.kind === "DELAY" ? (
                <Clock3 size={14} />
              ) : item.kind === "ADD_TAG" ? (
                <Tag size={14} />
              ) : (
                <MessageSquare size={14} />
              )}
              {item.text}
            </div>
          ))}
        </div>
      ) : null}
      {triggered &&
      (draft.publicReplies.enabled || draft.publicReplies.fallback.enabled) ? (
        <div
          className="public-reply-preview"
          aria-label="Prévia das respostas públicas"
        >
          <h3>
            {alternative
              ? "Resposta alternativa · falha definitiva simulada"
              : "Resposta pública · prévia independente"}
          </h3>
          {testMode && draft.publicReplies.fallback.enabled ? (
            <>
              <label htmlFor="simulated-dm-outcome">
                Situação fictícia da DM
              </label>
              <select
                id="simulated-dm-outcome"
                value={dmOutcome}
                onChange={(event) =>
                  setDmOutcome(event.target.value as DmOutcome["kind"])
                }
              >
                <option value="UNCONFIRMED">Sem erro identificado</option>
                <option value="API_ACCEPTED">
                  API aceitou · entrega não confirmada
                </option>
                <option value="DELAYED">Atraso no envio</option>
                <option value="TEMPORARY_FAILURE">Falha temporária</option>
                <option value="DEFINITIVE_FAILURE">
                  Falha definitiva identificada que justifica a alternativa
                </option>
              </select>
            </>
          ) : null}
          <p>
            {publicText ||
              (draft.publicReplies.enabled
                ? "Nenhuma variação preenchida e válida."
                : "Respostas públicas automáticas desativadas.")}
          </p>
          <small className="conversation-message-context">
            Prévia separada da DM; não estabelece a ordem de envio.
          </small>
        </div>
      ) : null}
      <div className="simulation-controls">
        <button
          type="button"
          className="editor-add-button"
          disabled={!Object.keys(choices).length && !urlChoice}
          onClick={back}
        >
          <ArrowLeft size={13} /> Voltar
        </button>
        <button type="button" className="editor-add-button" onClick={restart}>
          <RotateCcw size={13} /> Reiniciar simulação
        </button>
      </div>
      {testMode ? (
        <div className="simulation-review">
          <h3>Revisão antes da ativação</h3>
          {issues.length ? (
            <ul>
              {issues.map((issue, index) => (
                <li key={`${issue.path}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          ) : (
            <p>
              Os campos estão completos. A integração e as condições reais de
              envio ainda precisam ser verificadas.
            </p>
          )}
          <p>
            A continuação mostrada é uma hipótese. Só um evento real e elegível
            recebido pela Meta pode autorizar envios dentro da janela.
          </p>
        </div>
      ) : null}
    </section>
  );
}
