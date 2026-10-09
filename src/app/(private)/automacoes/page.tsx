import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, Plus } from "lucide-react";
import { Badge, PageHeading } from "@/components/ui";
import { requireOwner } from "@/lib/session";
import { automationService } from "@/lib/automations";
import { db } from "@/lib/db";
import { AutomationTable } from "@/components/automation-table";

export const metadata: Metadata = { title: "Automações" };

export default async function AutomationsPage() {
  const { workspace } = await requireOwner();
  const automations = await automationService(db).list(workspace.id);
  return (
    <>
      <PageHeading
        eyebrow="ORGANIZAÇÃO"
        title="Automações"
        description="Transforme comentários em conversas. Configure cada passo com clareza."
        action={
          <Link href="/automacoes/nova" className="button button-primary">
            <Plus size={17} /> Nova automação
          </Link>
        }
      />
      {automations.length === 0 ? (
        <section className="card automation-empty">
          <div className="automation-empty-copy">
            <span className="automation-empty-number">01</span>
            <div>
              <h2>Comece com uma conversa bem pensada.</h2>
              <p>
                Defina uma palavra-chave, escreva a primeira mensagem e adicione
                os próximos passos.
              </p>
            </div>
            <Link href="/automacoes/nova" className="button button-primary">
              Criar primeira automação <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      ) : (
        <AutomationTable initialItems={automations} />
      )}
      <div className="automation-info">
        <div className="info-block">
          <Info size={20} aria-hidden="true" />
          <div>
            <h3>Uma regra para manter tudo organizado</h3>
            <p>
              Automações específicas de um Reel terão prioridade sobre
              automações globais.
            </p>
          </div>
        </div>
        <div className="scope-guide">
          <div>
            <span className="tiny-label">STATUS</span>
            <p>
              <Badge>Rascunho</Badge> <Badge tone="green">Ativa</Badge>{" "}
              <Badge tone="amber">Pausada</Badge> <Badge>Erro</Badge>
            </p>
          </div>
          <div>
            <span className="tiny-label">ESCOPO</span>
            <p>Global · Reels futuros · Reels específicos</p>
          </div>
        </div>
      </div>
    </>
  );
}
