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
        <Brand />
        <span className="login-product-label">AUTOMAÇÃO INSTAGRAM</span>
        <div className="login-story-content">
          <p className="eyebrow">CADA CONVERSA TEM SEU RITMO</p>
          <h2>
            Mais intenção.
            <br />
            Mais conversa<span className="brand-dot">.</span>
          </h2>
          <p>
            Organize suas automações com clareza. Um espaço para pensar cada
            mensagem e cuidar do próximo passo.
          </p>
          <div className="login-story-steps">
            <span>
              <MessageSquare size={16} /> Conversas bem pensadas
            </span>
            <span>
              <Workflow size={16} /> Um passo de cada vez
            </span>
            <span>
              <Tag size={16} /> Organização do seu jeito
            </span>
          </div>
        </div>
        <div className="login-story-footer">
          <span>Clareza para definir o próximo passo.</span>
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
          <h1>
            Seu espaço,
            <br />
            no seu ritmo.
          </h1>
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
        <p className="login-footer">Pulso · Automação Instagram</p>
      </section>
    </main>
  );
}
