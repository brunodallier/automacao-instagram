// Contrato de apresentação para a Etapa 2. Nenhum motor é executado nesta etapa.
export type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR";
export type AutomationScope = "GLOBAL" | "FUTURE_REELS" | "SPECIFIC_REELS";
export type AutomationSummary = {
  id: string;
  name: string;
  status: AutomationStatus;
  scope: AutomationScope;
  createdAt: string;
  lastExecutedAt: string | null;
};

// Regra de domínio a preservar na implementação futura:
// SPECIFIC_REELS tem prioridade sobre GLOBAL para o mesmo Reel.
// The future engine must first filter workspace, account, Reel and keyword eligibility.
export function prioritizeEligibleAutomations<
  T extends { scope: AutomationScope },
>(eligible: T[]): T[] {
  const specific = eligible.filter(
    (automation) => automation.scope === "SPECIFIC_REELS",
  );
  return specific.length ? specific : eligible;
}
