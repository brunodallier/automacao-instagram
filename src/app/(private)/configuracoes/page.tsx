import type { Metadata } from "next";
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
            <Badge>Não conectado</Badge>
          </div>
          <p>
            A conexão com contas Business será feita pela integração oficial da
            Meta.
          </p>
          <div className="settings-placeholder">
            <Instagram size={26} aria-hidden="true" />
            <span>Nenhuma conta conectada</span>
          </div>
          <button
            className="button button-secondary"
            disabled
            title="A conexão será disponibilizada em uma próxima etapa"
          >
            Conectar Instagram <span className="button-soon">Em breve</span>
          </button>
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
            Instagram <small>Não conectado</small>
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
