import { randomUUID, createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createDatabaseClient } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";
import { encode } from "next-auth/jwt";

const client = createDatabaseClient(process.env.DATABASE_URL!);
const email = `e2e-${randomUUID()}@example.com`;
const password = process.env.E2E_PASSWORD!;
let userId: string;
let workspaceId: string;
let otherWorkspaceId: string;

test.beforeEach(async () => {
  const user = await client.user.create({
    data: {
      name: "Proprietário de teste",
      email,
      passwordHash: await hashPassword(password),
      memberships: {
        create: { workspace: { create: { name: "Espaço de teste" } } },
      },
    },
    include: { memberships: true },
  });
  userId = user.id;
  workspaceId = user.memberships[0].workspaceId;
  otherWorkspaceId = (
    await client.workspace.create({ data: { name: `outro-${randomUUID()}` } })
  ).id;
});
test.afterEach(async () => {
  if (userId) await client.user.deleteMany({ where: { id: userId } });
  await client.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } },
  });
  await client.loginRateLimit.deleteMany({
    where: { key: createHash("sha256").update(email).digest("hex") },
  });
});
test.afterAll(async () => {
  await client.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
  await expect(page).toHaveURL(/\/painel$/);
}

test("protege todas as páginas e APIs sem sessão", async ({
  page,
  request,
}) => {
  for (const route of [
    "/painel",
    "/automacoes",
    "/tags",
    "/saude",
    "/configuracoes",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  expect((await request.get("/api/tags")).status()).toBe(401);
  expect(
    (
      await request.post("/api/tags", {
        headers: { Origin: "http://localhost:3100" },
        data: { name: "Sem acesso" },
      })
    ).status(),
  ).toBe(401);
});

test("valida login e mostra métricas zeradas e estado real de preparação", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
  await expect(
    page.getByText("Informe um e-mail válido.", { exact: true }),
  ).toBeVisible();
  await login(page);
  await expect(page.locator(".metric-value")).toHaveText(["0", "0", "0", "0"]);
  await expect(
    page.getByText("Não conectado", { exact: true }).first(),
  ).toBeVisible();
});

test("cria, rejeita duplicação, renomeia e persiste após recarregar", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Tags", exact: true }).click();
  await expect(
    page.getByText("Um espaço para suas próprias tags"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Criar tag", exact: true }).click();
  await expect(page.locator("#tag-error")).toHaveText(
    "Informe um nome para a tag.",
  );
  await page.getByLabel("Nome da nova tag").fill("Cliente VIP");
  await page.getByRole("button", { name: "Criar tag", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Tag criada com sucesso.",
  );
  const original = await client.tag.findFirstOrThrow({
    where: { workspaceId, name: "Cliente VIP" },
  });
  await page.getByLabel("Nome da nova tag").fill("cliente vip");
  await page.getByRole("button", { name: "Criar tag", exact: true }).click();
  await expect(page.locator("#tag-error")).toHaveText(
    "Já existe uma tag com esse nome.",
  );
  await page
    .getByRole("button", { name: "Renomear tag Cliente VIP", exact: true })
    .click();
  await page
    .getByLabel("Nome da tag", { exact: true })
    .fill("Interesse confirmado");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Tag renomeada com sucesso.",
  );
  await page.reload();
  await expect(
    page.getByText("Interesse confirmado", { exact: true }),
  ).toBeVisible();
  expect(
    (await client.tag.findUniqueOrThrow({ where: { id: original.id } })).name,
  ).toBe("Interesse confirmado");
});

test("busca tags e exige confirmação antes de excluir", async ({ page }) => {
  await client.tag.create({
    data: {
      workspaceId,
      name: "Interesse confirmado",
      normalizedName: "interesse confirmado",
    },
  });
  await login(page);
  await page.goto("/tags");
  await page.getByLabel("Buscar tags").fill("semresultado");
  await expect(
    page.getByText("Nenhuma tag encontrada", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await page
    .getByRole("button", {
      name: "Excluir tag Interesse confirmado",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByText("Interesse confirmado", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Excluir tag Interesse confirmado",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Excluir tag", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Tag excluída com sucesso.",
  );
  await page.reload();
  await expect(
    page.getByText("Um espaço para suas próprias tags"),
  ).toBeVisible();
});

test("backend valida entrada, impede CSRF e acesso a tags de outro espaço", async ({
  page,
}) => {
  await login(page);
  const request = page.request;
  const headers = { Origin: "http://localhost:3100" };
  expect(
    (
      await request.post("/api/tags", { headers, data: { name: " " } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/tags", {
        headers,
        data: { name: "a".repeat(51) },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/tags", {
        headers,
        data: { name: "Teste", workspaceId: otherWorkspaceId },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/tags", {
        headers: { Origin: "https://origem-externa.example" },
        data: { name: "CSRF" },
      })
    ).status(),
  ).toBe(403);
  const tag = await client.tag.create({
    data: {
      workspaceId: otherWorkspaceId,
      name: "Privada",
      normalizedName: "privada",
    },
  });
  expect(
    (
      await request.patch(`/api/tags/${tag.id}`, {
        headers,
        data: { name: "Alterada" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (await request.delete(`/api/tags/${tag.id}`, { headers })).status(),
  ).toBe(404);
  expect((await request.get("/api/tags")).status()).toBe(200);
  const created = await request.post("/api/tags", {
    headers,
    data: { name: "Concorrência" },
  });
  expect(created.status()).toBe(201);
  expect(
    (
      await request.post("/api/tags", {
        headers,
        data: { name: "CONCORRÊNCIA" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.delete(`/api/tags/${(await created.json()).id}`, {
        headers,
      })
    ).status(),
  ).toBe(204);
});

test("navegação móvel e páginas futuras funcionam sem ultrapassar a tela", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Automações" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Automações", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Nova automação" }),
  ).toBeVisible();
  await page.goto("/saude");
  await expect(
    page.getByText("Nenhuma verificação realizada", { exact: true }),
  ).toBeVisible();
  await page.goto("/configuracoes");
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/configuracoes-mobile.png",
    fullPage: true,
  });
});

test("cria um rascunho no editor sequencial e revisa a prévia", async ({ page }) => {
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByLabel("Nome da automação").fill("Catálogo por comentário");
  await page.getByLabel("Adicionar palavra-chave").fill("quero");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page.getByLabel("Mensagem da DM").fill("Oi! Aqui está o catálogo.");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo com segurança.");
  await page.getByRole("button", { name: "Testar rascunho" }).click();
  await expect(page.locator(".preview-message", { hasText: "Oi! Aqui está o catálogo." })).toBeVisible();
  await page.goto("/automacoes");
  await expect(page.getByText("Catálogo por comentário", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mais ações para Catálogo por comentário" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Catálogo por comentário", { exact: true })).toHaveCount(0);
});

test("salva prévias da interface desktop e mobile", async ({ page }) => {
  await page.goto("/login");
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await login(page);
  await page.screenshot({
    path: "test-results/painel-desktop.png",
    fullPage: true,
  });
  await page.goto("/tags");
  await page.screenshot({
    path: "test-results/tags-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/painel");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/painel-mobile.png",
    fullPage: true,
  });
});

test("revoga a sessão quando a versão de segurança muda", async ({ page }) => {
  await login(page);
  await client.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
  await page.goto("/tags");
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/tags")).status()).toBe(401);
});

test("sessão é HttpOnly, expira em oito horas e encerra no logout", async ({
  page,
  context,
}) => {
  await login(page);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "next-auth.session-token",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  const expired = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      sub: userId,
      sessionVersion: 0,
      authenticatedAt: Date.now() - 9 * 60 * 60 * 1000,
    },
  });
  await context.addCookies([{ ...cookie!, value: expired }]);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/tags")).status()).toBe(401);
  await login(page);
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/tags");
  await expect(page).toHaveURL(/\/login$/);
});

test("limita tentativas de senha no banco", async ({ request }) => {
  await client.loginRateLimit.deleteMany({
    where: { key: createHash("sha256").update(email).digest("hex") },
  });
  for (let attempt = 0; attempt < 11; attempt++) {
    const csrf = await (await request.get("/api/auth/csrf")).json();
    const result = await request.post("/api/auth/callback/credentials", {
      form: {
        csrfToken: csrf.csrfToken,
        email,
        password: randomUUID(),
        json: "true",
        callbackUrl: "http://localhost:3100/painel",
      },
    });
    expect((await result.json()).url).toContain("error=CredentialsSignin");
  }
  const state = await client.loginRateLimit.findUniqueOrThrow({
    where: { key: createHash("sha256").update(email).digest("hex") },
  });
  expect(state.attempts).toBe(11);
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const response = await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      json: "true",
      callbackUrl: "http://localhost:3100/painel",
    },
  });
  expect((await response.json()).url).toContain("error=CredentialsSignin");
  const key = createHash("sha256").update(email).digest("hex");
  await client.$executeRaw`UPDATE "LoginRateLimit" SET "expiresAt" = NOW() - INTERVAL '1 minute' WHERE "key" = ${key}`;
  const renewedCsrf = await (await request.get("/api/auth/csrf")).json();
  const renewed = await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: renewedCsrf.csrfToken,
      email,
      password,
      json: "true",
      callbackUrl: "http://localhost:3100/painel",
    },
  });
  expect((await renewed.json()).url).toBe("http://localhost:3100/painel");
  expect(await client.loginRateLimit.findUnique({ where: { key } })).toBeNull();
});
