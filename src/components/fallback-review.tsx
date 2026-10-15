"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function FallbackReview({ outboundId }: { outboundId: string }) {
  const [open, setOpen] = useState(false),
    [justification, setJustification] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function approve() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/atividades/${outboundId}/alternativa`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ justification }),
        },
      );
      if (!response.ok)
        throw Error(
          (await response.json()).error ?? "Não foi possível confirmar.",
        );
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível confirmar.",
      );
    } finally {
      setPending(false);
    }
  }
  return open ? (
    <div>
      <label className="field-label" htmlFor={`reason-${outboundId}`}>
        Por que esse erro definitivo justifica a alternativa pública?
      </label>
      <textarea
        id={`reason-${outboundId}`}
        value={justification}
        maxLength={500}
        onChange={(event) => setJustification(event.target.value)}
        rows={2}
      />
      <p className="muted">
        Ao confirmar, a resposta alternativa configurada será colocada na fila.
        Isso não comprova uma entrega anterior.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="button button-primary"
        disabled={pending || !justification.trim()}
        onClick={approve}
      >
        Confirmar alternativa pública
      </button>{" "}
      <button
        className="button button-secondary"
        disabled={pending}
        onClick={() => setOpen(false)}
      >
        Cancelar
      </button>
    </div>
  ) : (
    <button className="button button-secondary" onClick={() => setOpen(true)}>
      Revisar alternativa
    </button>
  );
}
