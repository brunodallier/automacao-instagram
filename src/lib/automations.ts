import { Prisma } from "@/generated/prisma/client";
import type {
  AutomationScope,
  AutomationStatus,
  PrismaClient,
} from "@/generated/prisma/client";
import {
  automationDraftSchema,
  idSchema,
  normalizeAutomationKeyword,
} from "@/lib/validation";

export class AutomationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const include = {
  keywords: { orderBy: { createdAt: "asc" as const } },
  steps: true,
};

function errorFromDatabase(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      throw new AutomationError(
        "Essa palavra-chave já está cadastrada nesta automação.",
        409,
      );
    if (error.code === "P2025")
      throw new AutomationError("Automação não encontrada.", 404);
  }
  throw error;
}

function parse(input: unknown) {
  const result = automationDraftSchema.safeParse(input);
  if (!result.success)
    throw new AutomationError(result.error.issues[0].message, 400);
  return result.data;
}

function payload(value: ReturnType<typeof parse>) {
  return {
    name: value.name,
    scope: value.scope as AutomationScope,
    keywords: value.keywords.map((keyword) => ({
      value: keyword,
      normalizedValue: normalizeAutomationKeyword(keyword),
    })),
    steps: value.steps.map((step, position) => ({
      position,
      kind: step.kind,
      text: "text" in step ? step.text : null,
      delaySeconds: "delaySeconds" in step ? step.delaySeconds : null,
      tagId: "tagId" in step ? step.tagId : null,
      buttons: "buttons" in step ? step.buttons : undefined,
    })),
  };
}

async function ensureWorkspaceTags(
  client: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
  steps: ReturnType<typeof payload>["steps"],
) {
  const tagIds = steps.flatMap((step) =>
    step.kind === "ADD_TAG" && step.tagId ? [step.tagId] : [],
  );
  if (tagIds.length === 0) return;
  const tags = await client.tag.findMany({
    where: { workspaceId, id: { in: tagIds } },
    select: { id: true },
  });
  if (tags.length !== new Set(tagIds).size)
    throw new AutomationError(
      "A tag selecionada não pertence a este espaço.",
      400,
    );
}

function validateId(id: string) {
  if (!idSchema.safeParse(id).success)
    throw new AutomationError("Automação inválida.", 400);
}

type AutomationWithDetails = Prisma.AutomationGetPayload<{
  include: { keywords: true; steps: true };
}>;

function mapAutomation(automation: AutomationWithDetails) {
  return {
    id: automation.id,
    name: automation.name,
    status: automation.status as AutomationStatus,
    scope: automation.scope as AutomationScope,
    createdAt: automation.createdAt.toISOString(),
    updatedAt: automation.updatedAt.toISOString(),
    lastExecutedAt: automation.lastExecutedAt?.toISOString() ?? null,
    keywords: automation.keywords.map((keyword) => ({
      id: keyword.id,
      value: keyword.value,
    })),
    steps: [...automation.steps]
      .sort((a, b) => a.position - b.position)
      .map((step) => ({
        id: step.id,
        position: step.position,
        kind: step.kind as "SEND_DM" | "BUTTONS" | "ADD_TAG" | "DELAY" | "PUBLIC_REPLY",
        text: step.text,
        delaySeconds: step.delaySeconds,
        tagId: step.tagId,
        buttons: step.buttons,
      })),
  };
}

export function automationService(client: PrismaClient) {
  return {
    async list(workspaceId: string) {
      const items = await client.automation.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        include,
      });
      return items.map(mapAutomation);
    },
    async get(workspaceId: string, id: string) {
      validateId(id);
      try {
        const item = await client.automation.findFirstOrThrow({
          where: { id, workspaceId },
          include,
        });
        return mapAutomation(item);
      } catch (error) {
        errorFromDatabase(error);
      }
    },
    async create(workspaceId: string, input: unknown) {
      const value = parse(input);
      const data = payload(value);
      await ensureWorkspaceTags(client, workspaceId, data.steps);
      try {
        const item = await client.automation.create({
          data: {
            workspaceId,
            name: data.name,
            scope: data.scope,
            keywords: { create: data.keywords },
            steps: { create: data.steps },
          },
          include,
        });
        return mapAutomation(item);
      } catch (error) {
        errorFromDatabase(error);
      }
    },
    async update(workspaceId: string, id: string, input: unknown) {
      validateId(id);
      const value = parse(input);
      const data = payload(value);
      try {
        return await client.$transaction(async (tx) => {
          await tx.automation.findFirstOrThrow({
            where: { id, workspaceId },
            select: { id: true, status: true },
          });
          await ensureWorkspaceTags(tx, workspaceId, data.steps);
          await tx.automationKeyword.deleteMany({
            where: { automationId: id },
          });
          await tx.automationStep.deleteMany({ where: { automationId: id } });
          const item = await tx.automation.update({
            where: { id },
            data: {
              name: data.name,
              scope: data.scope,
              status: "DRAFT",
              keywords: { create: data.keywords },
              steps: { create: data.steps },
            },
            include,
          });
          return mapAutomation(item);
        });
      } catch (error) {
        errorFromDatabase(error);
      }
    },
    async remove(workspaceId: string, id: string) {
      validateId(id);
      try {
        await client.automation.delete({ where: { id, workspaceId } });
      } catch (error) {
        errorFromDatabase(error);
      }
    },
  };
}
