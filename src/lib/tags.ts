import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { idSchema, normalizeTagName, tagSchema } from "@/lib/validation";

export class TagError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function tagService(client: PrismaClient) {
  function validate(input: unknown) {
    const result = tagSchema.safeParse(input);
    if (!result.success)
      throw new TagError(result.error.issues[0].message, 400);
    return {
      name: result.data.name,
      normalizedName: normalizeTagName(result.data.name),
    };
  }
  function validateId(id: string) {
    if (!idSchema.safeParse(id).success)
      throw new TagError("Tag inválida.", 400);
  }
  function translate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        throw new TagError("Já existe uma tag com esse nome.", 409);
      if (error.code === "P2025")
        throw new TagError("Tag não encontrada.", 404);
    }
    throw error;
  }
  return {
    list(workspaceId: string) {
      return client.tag.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
    },
    async create(workspaceId: string, input: unknown) {
      const data = validate(input);
      try {
        return await client.tag.create({ data: { ...data, workspaceId } });
      } catch (error) {
        translate(error);
      }
    },
    async rename(workspaceId: string, id: string, input: unknown) {
      validateId(id);
      const data = validate(input);
      // ID estável mantém as futuras relações; workspace é parte de toda mutação.
      try {
        return await client.tag.update({ where: { id, workspaceId }, data });
      } catch (error) {
        translate(error);
      }
    },
    async remove(workspaceId: string, id: string) {
      validateId(id);
      try {
        return await client.tag.delete({ where: { id, workspaceId } });
      } catch (error) {
        translate(error);
      }
    },
  };
}
