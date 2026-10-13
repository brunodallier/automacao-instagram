import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  Camera as Instagram,
  KeyRound,
  LockKeyhole,
  Plug,
  UserRound,
} from "lucide-react";
import { Badge, PageHeading } from "@/components/ui";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Configurações" };
export default async function SettingsPage() {
  const { user, workspace } = await requireOwner();
  return (
    <>
      <PageHeading
        eyebrow="GERENCIAMENTO"
        title="Configurações"
        description="As informações do seu espaço, sua conta e as conexões que estão por vir."
      />
      <div className="settings-grid">
        <section className="card settings-card">
          <div className="settings-title">
            <UserRound size={20} aria-hidden="true" />
            <h2>Proprietário</h2>
            <Badge tone="green">Conta privada</Badge>
          </div>
          <p>O acesso a este espaço é exclusivo do proprietário.</p>
          <dl className="details-list">
            <div>
              <dt>Nome</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Espaço de trabalho</dt>
              <dd>{workspace.name}</dd>
            </div>
          </dl>
        </section>
        <section className="card settings-card">
          <div className="settings-title">
            <Instagram size={20} aria-hidden="true" />
            <h2>Contas Instagram</h2>
            <Badge>Verificação no painel</Badge>
          </div>
          <p>
            O acesso de leitura ao perfil é verificado no painel pela API
            oficial da Meta. A credencial é configurada somente no ambiente do
            servidor.
          </p>
          <div className="settings-placeholder">
            <Instagram size={26} aria-hidden="true" />
            <span>Consulte o resultado atual no painel</span>
          </div>
          <Link className="button button-secondary" href="/painel#instagram">
            Verificar conexão
          </Link>
        </section>
        <section className="card settings-card">
          <div className="settings-title">
            <Bell size={20} aria-hidden="true" />
            <h2>Notificações</h2>
            <span className="notice-label">Em breve</span>
          </div>
          <p>
            Defina como receber avisos sobre o funcionamento das suas
            automações.
          </p>
          <div className="future-setting">
            <span>Alertas de falhas</span>
            <span>Ainda não configurado</span>
          </div>
          <div className="future-setting">
            <span>Avisos de conexão</span>
            <span>Ainda não configurado</span>
          </div>
        </section>
        <section className="card settings-card">
          <div className="settings-title">
            <LockKeyhole size={20} aria-hidden="true" />
            <h2>Segurança</h2>
          </div>
          <p>Seu acesso está protegido por autenticação privada.</p>
          <ul className="security-list">
            <li>
              <KeyRound size={16} aria-hidden="true" /> Senha protegida por hash
              seguro
            </li>
            <li>
              <LockKeyhole size={16} aria-hidden="true" /> Sessão com duração
              máxima de 8 horas
            </li>
            <li>
              <UserRound size={16} aria-hidden="true" /> Sem cadastro público
            </li>
          </ul>
          <p className="field-hint">
            A alteração de senha é feita pelo responsável pela instalação do
            espaço.
          </p>
        </section>
      </div>
      <section className="card settings-card integrations-card">
        <div className="settings-title">
          <Plug size={20} aria-hidden="true" />
          <h2>Integrações futuras</h2>
          <span className="notice-label">Em preparação</span>
        </div>
        <p>
          A estrutura permite adicionar outras contas e plataformas nas próximas
          etapas.
        </p>
        <div className="integration-chips">
          <span>
            Instagram <small>Leitura no painel</small>
          </span>
          <span>
            TikTok <small>Futuro</small>
          </span>
          <span>
            Kwai <small>Futuro</small>
          </span>
        </div>
      </section>
    </>
  );
}
