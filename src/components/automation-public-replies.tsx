"use client";

import { Plus, Trash2 } from "lucide-react";
import { EDITOR_LIMITS, type PublicReplyConfig } from "@/lib/automation-draft";
import { characterCount } from "@/lib/automation-rules";
import { PUBLIC_REPLY_LIMIT, publicReplyIssues } from "@/lib/public-replies";

export function AutomationPublicReplies({
  config,
  onChange,
  showErrors,
}: {
  config: PublicReplyConfig;
  onChange: (config: PublicReplyConfig) => void;
  showErrors: boolean;
}) {
  const issues = publicReplyIssues(config);
  const error = (path: string, filled = false) => {
    const issue = issues.find((item) => item.path === path);
    return issue && (showErrors || filled) ? (
      <p className="field-error">{issue.message}</p>
    ) : null;
  };
  return (
    <section
      className="card editor-section public-reply-section"
      aria-label="Configure as respostas públicas"
    >
      <div className="editor-section-heading">
        <span className="editor-step-number">3</span>
        <div>
          <h2>Configure as respostas públicas</h2>
          <p>Respostas ao comentário, separadas da conversa privada.</p>
        </div>
      </div>
      <label className="public-reply-toggle">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) =>
            onChange({ ...config, enabled: event.target.checked })
          }
        />
        Ativar respostas públicas automáticas
      </label>
      <p className="editor-hint">
        As variações preenchidas se alternam em rotação. A ordem de configuração
        não define quando a resposta será enviada em relação à DM.
      </p>
      <div className="public-reply-variations">
        {config.variations.map((text, index) => (
          <div className="public-reply-field" key={index}>
            <div className="public-reply-label">
              <label htmlFor={`public-reply-${index}`}>
                Resposta pública {index + 1}
              </label>
              <span className="button-title-count">
                {characterCount(text)}/{PUBLIC_REPLY_LIMIT}
              </span>
              {index >= 5 ? (
                <button
                  type="button"
                  className="icon-button danger-icon"
                  aria-label={`Remover variação ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...config,
                      variations: config.variations.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
            <textarea
              id={`public-reply-${index}`}
              rows={2}
              value={text}
              maxLength={8000}
              placeholder="Escreva sua resposta"
              aria-invalid={
                config.enabled && characterCount(text) > PUBLIC_REPLY_LIMIT
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  variations: config.variations.map((value, i) =>
                    i === index ? event.target.value : value,
                  ),
                })
              }
            />
            {error(`publicReplies.variations.${index}`, !!text)}
          </div>
        ))}
      </div>
      {error("publicReplies.variations")}
      <button
        type="button"
        className="editor-add-button"
        disabled={config.variations.length >= EDITOR_LIMITS.publicReplies}
        onClick={() =>
          onChange({ ...config, variations: [...config.variations, ""] })
        }
      >
        <Plus size={14} /> Adicionar variação
      </button>
      <div className="public-reply-fallback">
        <label className="public-reply-toggle">
          <input
            type="checkbox"
            checked={config.fallback.enabled}
            onChange={(event) =>
              onChange({
                ...config,
                fallback: { ...config.fallback, enabled: event.target.checked },
              })
            }
          />
          Ativar resposta alternativa para falha definitiva da DM
        </label>
        <div className="public-reply-label">
          <label htmlFor="public-reply-fallback">
            Resposta pública alternativa
          </label>
          <span className="button-title-count">
            {characterCount(config.fallback.text)}/{PUBLIC_REPLY_LIMIT}
          </span>
        </div>
        <textarea
          id="public-reply-fallback"
          rows={2}
          value={config.fallback.text}
          maxLength={8000}
          placeholder="Escreva a resposta alternativa"
          aria-invalid={
            config.fallback.enabled &&
            characterCount(config.fallback.text) > PUBLIC_REPLY_LIMIT
          }
          onChange={(event) =>
            onChange({
              ...config,
              fallback: { ...config.fallback, text: event.target.value },
            })
          }
        />
        {error("publicReplies.fallback.text", !!config.fallback.text)}
        <p className="editor-hint">
          Usada somente com erro definitivo identificado que justifique a
          alternativa. Atraso ou aceitação da API não confirmam entrega nem
          falha definitiva.
        </p>
      </div>
      <p className="editor-hint">
        Limite do editor: 500 caracteres por resposta. Campos vazios ou
        pendentes podem ser salvos como rascunho.
      </p>
    </section>
  );
}
