"use client";
import { TriangleAlert } from "lucide-react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="card page-error" role="alert">
      <TriangleAlert size={30} aria-hidden="true" />
      <h1>Não foi possível carregar o espaço</h1>
      <p>
        Tente novamente em instantes. Se continuar, verifique a disponibilidade
        do serviço.
      </p>
      <button className="button button-primary" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
