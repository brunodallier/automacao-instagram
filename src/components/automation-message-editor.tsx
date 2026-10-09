"use client";

import { Copy, Plus, Trash2, X } from "lucide-react";
import {
  EDITOR_LIMITS,
  emptyButton,
  emptyMessage,
  type MessageDraft,
  type MessageButton,
} from "@/lib/automation-draft";
import {
  characterCount,
  messageIssues,
  utf8Bytes,
} from "@/lib/automation-rules";

export function AutomationMessageEditor({
  message,
  onChange,
  path,
  initial = false,
  showErrors,
  depth = 1,
}: {
  message: MessageDraft;
  onChange: (message: MessageDraft) => void;
  path: string;
  initial?: boolean;
  showErrors: boolean;
  depth?: number;
}) {
  const id = path.replaceAll(".", "-");
  const issues = messageIssues(message, path, initial);
  function error(field: string, filled = true) {
    const issue = issues.find((item) => item.path === `${path}.${field}`);
    return issue && (showErrors || filled) ? (
      <p className="field-error" id={`${id}-${field}-error`}>
        {issue.message}
      </p>
    ) : null;
  }
  function updateButton(index: number, update: Partial<MessageButton>) {
    onChange({
      ...message,
      buttons: message.buttons.map((button, i) =>
        i === index ? { ...button, ...update } : button,
      ),
    });
  }
  return (
    <div
      className="message-editor"
      role="group"
      aria-label={depth === 1 ? "Conteúdo da mensagem" : "Próxima mensagem"}
    >
      <label htmlFor={`${id}-text`}>
        {depth === 1 ? "Mensagem da DM" : "Texto da próxima mensagem"}
      </label>
      <textarea
        id={`${id}-text`}
        value={message.text}
        placeholder="Escreva a mensagem que será enviada"
        maxLength={8000}
        onChange={(event) => onChange({ ...message, text: event.target.value })}
        aria-invalid={
          issues.some((issue) => issue.path === `${path}.text`) &&
          (showErrors || !!message.text)
        }
      />
      <p className="message-count">
        {characterCount(message.text)} caracteres · {utf8Bytes(message.text)}{" "}
        bytes UTF-8
        <span>
          {message.buttons.length
            ? "Modelo com botões: até 640 caracteres"
            : "Texto: até 1.000 bytes no Instagram"}
        </span>
      </p>
      {error("text", !!message.text)}
      {initial ? (
        <p className="editor-hint message-context">
          Primeira DM: resposta privada ao comentário. Ela não abre, por si só,
          a janela para outras mensagens.
        </p>
      ) : (
        <p className="editor-hint message-context">
          Continuação: depende de interação elegível e de uma janela de
          mensagens válida.
        </p>
      )}
      {error("buttons")}
      <div className="message-button-fields">
        {message.buttons.map((button, index) => {
          const buttonId = `${id}-button-${index}`;
          return (
            <div className="message-button-card" key={buttonId}>
              <div className="message-button-heading">
                <strong>Botão {index + 1}</strong>
                <button
                  type="button"
                  className="icon-button danger-icon"
                  aria-label={`Remover botão ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...message,
                      buttons: message.buttons.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X size={15} />
                </button>
              </div>
              <label htmlFor={`${buttonId}-label`}>Título do botão</label>
              <input
                id={`${buttonId}-label`}
                value={button.label}
                maxLength={200}
                placeholder="Escreva o título"
                onChange={(event) =>
                  updateButton(index, { label: event.target.value })
                }
              />
              <span className="button-title-count">
                {characterCount(button.label)}/20 caracteres
              </span>
              {error(`buttons.${index}.label`, !!button.label)}
              <label htmlFor={`${buttonId}-action`}>
                O que acontece quando alguém clicar?
              </label>
              <select
                id={`${buttonId}-action`}
                value={button.action}
                onChange={(event) => {
                  const action = event.target.value as MessageButton["action"];
                  // Keep both branches when changing action so an edit never discards user content.
                  updateButton(index, {
                    action,
                    ...(action === "NEXT_MESSAGE" && !button.nextMessage
                      ? { nextMessage: emptyMessage() }
                      : {}),
                  });
                }}
              >
                <option value="OPEN_URL">Abrir site externo</option>
                <option value="NEXT_MESSAGE">Enviar próxima mensagem</option>
              </select>
              {button.action === "OPEN_URL" ? (
                <>
                  <label htmlFor={`${buttonId}-url`}>URL do site</label>
                  <input
                    id={`${buttonId}-url`}
                    type="text"
                    inputMode="url"
                    value={button.url}
                    placeholder="https://"
                    maxLength={2000}
                    onChange={(event) =>
                      updateButton(index, { url: event.target.value })
                    }
                  />
                  {error(`buttons.${index}.url`, !!button.url)}
                  <p className="editor-hint">
                    O Instagram define onde o link abre. Abrir um site não
                    autoriza uma nova mensagem.
                  </p>
                </>
              ) : (
                <div className="message-continuation">
                  <div className="message-button-heading">
                    <strong>Mensagem após este clique</strong>
                    {button.nextMessage ? (
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="Duplicar próxima mensagem"
                          disabled={
                            message.buttons.length >= EDITOR_LIMITS.buttons
                          }
                          onClick={() =>
                            onChange({
                              ...message,
                              buttons: [
                                ...message.buttons,
                                structuredClone(button),
                              ],
                            })
                          }
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          className="icon-button danger-icon"
                          type="button"
                          aria-label="Remover próxima mensagem"
                          onClick={() =>
                            updateButton(index, { nextMessage: null })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {button.nextMessage ? (
                    <AutomationMessageEditor
                      message={button.nextMessage}
                      path={`${path}.buttons.${index}.nextMessage`}
                      depth={depth + 1}
                      showErrors={showErrors}
                      onChange={(nextMessage) =>
                        updateButton(index, { nextMessage })
                      }
                    />
                  ) : (
                    <>
                      {error(`buttons.${index}.nextMessage`, false)}
                      <button
                        className="editor-add-button"
                        type="button"
                        onClick={() =>
                          updateButton(index, { nextMessage: emptyMessage() })
                        }
                      >
                        <Plus size={14} /> Configurar próxima mensagem
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="editor-add-button"
        disabled={
          message.buttons.length >= EDITOR_LIMITS.buttons ||
          depth >= EDITOR_LIMITS.depth
        }
        onClick={() =>
          onChange({ ...message, buttons: [...message.buttons, emptyButton()] })
        }
      >
        <Plus size={14} /> Adicionar botão
      </button>
      {message.buttons.length >= EDITOR_LIMITS.buttons ? (
        <p className="editor-hint">Limite de três botões por mensagem.</p>
      ) : null}
    </div>
  );
}
