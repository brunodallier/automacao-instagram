import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { ReelLibraryView } from "@/components/reel-library";
import { requireOwner } from "@/lib/session";
import { reelService } from "@/lib/instagram/reels";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Meus Reels" };
export default async function ReelsPage() {
  const { workspace } = await requireOwner();
  const library = await reelService(db).list(workspace.id);
  return (
    <>
      <PageHeading
        eyebrow="ORGANIZAÇÃO"
        title="Meus Reels"
        description="Suas publicações reais, disponíveis para escolher nas automações."
        action={
          <Link className="button button-primary" href="/automacoes/nova">
            Criar automação
          </Link>
        }
      />
      <ReelLibraryView initial={library} />
      <p className="data-caption">
        A sincronização consulta publicações e mantém os dados anteriores quando
        a Meta não permite concluir a leitura. Nenhum conteúdo é publicado e
        nenhum envio é habilitado.
      </p>
    </>
  );
}
