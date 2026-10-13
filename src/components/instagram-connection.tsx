"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera as Instagram } from "lucide-react";
import { Badge } from "@/components/ui";
import type { InstagramConnectionResult } from "@/lib/instagram/types";

const labels: Record<InstagramConnectionResult["status"], string> = {
  NOT_CONFIGURED: "Não conectado",
  CONFIGURATION_ERROR: "Revise a configuração",
  CONNECTED: "Leitura verificada",
  TOKEN_EXPIRED: "Token expirado",
  AUTHENTICATION_ERROR: "Token recusado",
  PERMISSION_ERROR: "Acesso recusado",
  RATE_LIMITED: "Limite de consultas",
  UNAVAILABLE: "Consulta indisponível",
  INVALID_RESPONSE: "Resposta inválida",
};

export function InstagramConnection({
  initial,
}: {
  initial: InstagramConnectionResult;
}) {
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");
  async function verify() {
    setPending(true);
    setRequestError("");
    try {
      const response = await fetch("/api/instagram/conexao", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch {
      setRequestError(
        "Não foi possível atualizar a verificação. Confira sua sessão e tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="card connection-card"
      id="instagram"
      aria-label="Conexão Instagram"
      aria-busy={pending}
    >
      <div className="section-heading">
        <div className="section-heading-icon">
          <Instagram size={21} aria-hidden="true" />
          <h2>Conexão Instagram</h2>
        </div>
        <Badge
          tone={
            result.status === "CONNECTED"
              ? "green"
              : result.status === "NOT_CONFIGURED"
                ? "neutral"
                : "amber"
          }
        >
          {labels[result.status]}
        </Badge>
      </div>
      <div className="connection-content">
        <span className="connection-symbol">
          <Instagram size={31} strokeWidth={1.4} aria-hidden="true" />
        </span>
        <div aria-live="polite" aria-atomic="true">
          <h3>
            {result.account
              ? `@${result.account.username}`
              : "Sua conta, conectada ao seu espaço."}
          </h3>
          <p>{result.message}</p>
          {result.account ? <p>ID da conta: {result.account.id}</p> : null}
          {result.checkedAt ? (
            <p>
              Última consulta:{" "}
              <time dateTime={result.checkedAt}>
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "America/Sao_Paulo",
                }).format(new Date(result.checkedAt))}
              </time>
            </p>
          ) : null}
          {result.status === "NOT_CONFIGURED" ||
          result.status === "CONFIGURATION_ERROR" ? (
            <p>
              Configure o token no arquivo de ambiente local e reinicie o
              servidor.
            </p>
          ) : null}
        </div>
      </div>
      {requestError ? (
        <p className="field-error" role="alert">
          {requestError} O resultado exibido permanece o da última consulta.
        </p>
      ) : null}
      <div className="card-bottom">
        {result.status === "CONNECTED" ? (
          <Link href="/reels">
            Meus Reels <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : null}
        <button
          className="button button-secondary"
          onClick={verify}
          disabled={pending}
        >
          {pending ? "Verificando…" : "Verificar conexão"}
        </button>
        <Link href="/configuracoes">
          Ver configurações <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
