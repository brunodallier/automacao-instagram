import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page-error">
      <p className="eyebrow">404</p>
      <h1>Esta página não está por aqui</h1>
      <p>Volte ao seu espaço para continuar.</p>
      <Link href="/painel" className="button button-primary">
        Ir para o painel
      </Link>
    </main>
  );
}
