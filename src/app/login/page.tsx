import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  LockKeyhole,
  MessageSquare,
  Tag,
  Workflow,
} from "lucide-react";
import { Brand } from "@/components/ui";
import { LoginForm } from "@/components/login-form";
import { getOwnerContext } from "@/lib/session";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await getOwnerContext()) redirect("/painel");
  const configured =
    !!process.env.DATABASE_URL &&
    (process.env.NEXTAUTH_SECRET?.length ?? 0) >= 32;
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand inverse />
        <span className="login-product-label">AUTOMAÇÃO INSTAGRAM</span>
        <div className="login-story-content">
          <p className="eyebrow">MAIS CONVERSAS. MAIS CLAREZA.</p>
          <h1>
            Uma conexão.
            <br />
            Muitas
            <br />
            <span>possibilidades.</span>
          </h1>
          <p>
            Um espaço simples para organizar suas automações e aproximar seu
            negócio de cada conversa.
          </p>
          <div className="login-story-steps">
            <span>
              <MessageSquare size={16} /> Conversas
            </span>
            <span>
              <Workflow size={16} /> Automações
            </span>
            <span>
              <Tag size={16} /> Organização
            </span>
          </div>
        </div>
        <div className="login-story-footer">
          <span>Feito para dar o próximo passo.</span>
          <ArrowUpRight size={20} aria-hidden="true" />
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-mobile-brand">
          <Brand />
        </div>
        <div className="login-form-content">
          <span className="login-lock">
            <LockKeyhole size={23} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <p className="eyebrow">SEU ESPAÇO, SEU ACESSO</p>
          <h2>Bom ter você por aqui.</h2>
          <p className="login-description">
            Entre para cuidar das suas próximas conversas.
          </p>
          <LoginForm configured={configured} />
          <div className="login-private-note">
            <LockKeyhole size={14} aria-hidden="true" />
            <p>
              Acesso exclusivo do proprietário.
              <br />
              Não há cadastro público.
            </p>
          </div>
        </div>
        <p className="login-footer">Elo · Automação Instagram</p>
      </section>
    </main>
  );
}
