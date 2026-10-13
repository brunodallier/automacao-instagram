import { randomUUID, createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createDatabaseClient } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";
import { encode } from "next-auth/jwt";
import { resetOwnerPassword } from "../../src/lib/reset-owner-password";

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
  await client.instagramReel.deleteMany({ where: { socialAccount: { workspaceId: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } } } });
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

test("captura todas as telas do redesign em desktop e celular", async ({
  page,
}) => {
  test.setTimeout(60000);
  const set = process.env.PULSO_SCREENSHOT_SET ?? "after";
  const isRedesign = set !== "before";
  const tag = await client.tag.create({
    data: {
      workspaceId,
      name: "Interesse no catálogo",
      normalizedName: "interesse no catálogo",
    },
  });
  const automation = await client.automation.create({
    data: {
      workspaceId,
      name: "Catálogo por comentário",
      publicReplies: {
        enabled: true,
        strategy: "ROTATING",
        variations: [
          "Obrigada pelo interesse. Vamos conversar por mensagem?",
          "Seu comentário chegou. Podemos continuar no privado?",
          "",
          "",
          "",
        ],
        fallback: {
          enabled: true,
          text: "Não foi possível enviar a mensagem. Entre em contato pelo Direct.",
        },
      },
      keywords: {
        create: [
          { value: "catálogo", normalizedValue: "catálogo" },
          { value: "quero", normalizedValue: "quero" },
        ],
      },
      steps: {
        create: [
          {
            position: 0,
            kind: "SEND_DM",
            text: "Obrigada pelo seu interesse. Podemos continuar por aqui?",
            buttons: [],
          },
          {
            position: 1,
            kind: "BUTTONS",
            text: "Escolha como prefere conhecer o catálogo.",
            buttons: [
              {
                label: "Ver catálogo",
                action: "OPEN_URL",
                url: "https://example.com/catalogo",
                nextMessage: null,
              },
              {
                label: "Me conte mais",
                action: "NEXT_MESSAGE",
                url: "",
                nextMessage: {
                  format: "TEXT",
                  text: "Qual produto chamou sua atenção?",
                  buttons: [],
                },
              },
            ],
          },
          { position: 2, kind: "ADD_TAG", tagId: tag.id },
          { position: 3, kind: "DELAY", delaySeconds: 30 },
        ],
      },
    },
  });
  for (const [device, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Entrar no meu espaço" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    if (isRedesign) {
      await expect(page).toHaveTitle("Entrar · Pulso");
      await expect(page.locator(".brand:visible")).toHaveText("pulso.");
      await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
        "href",
        /icon\.svg/,
      );
    }
    await page.screenshot({
      path: `.tmp/pulso-${set}/login-${device}.png`,
      fullPage: true,
    });
  }
  await login(page);
  for (const [device, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [name, route, heading] of [
      ["dashboard", "/painel", "Painel principal"],
      ["automacoes", "/automacoes", "Automações"],
      ["editor", `/automacoes/${automation.id}`, "Editar automação"],
      ["tags", "/tags", "Tags"],
      ["saude", "/saude", "Saúde do sistema"],
      ["configuracoes", "/configuracoes", "Configurações"],
    ]) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".loading-page")).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      if (isRedesign) {
        await expect(page).toHaveTitle(/ · Pulso$/);
        await expect(page.locator(".page-footer")).toContainText("Pulso");
        await expect(page.locator(".nav-soon")).toHaveCount(0);
        const contrast = await page.evaluate(() => {
          const luminance = (color: string) => {
            const rgb = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const c = value / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              });
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
          };
          const visible = (element: HTMLElement) =>
            element.getBoundingClientRect().width &&
            !element.matches(":disabled");
          const ratio = (element: HTMLElement, foreground: string) => {
            let parent: HTMLElement | null = element;
            let background = "rgb(255, 255, 255)";
            while (parent) {
              const bg = getComputedStyle(parent).backgroundColor;
              if (bg !== "rgba(0, 0, 0, 0)") {
                background = bg;
                break;
              }
              parent = parent.parentElement;
            }
            const a = luminance(foreground),
              b = luminance(background);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          };
          return {
            text: [
              ...document.querySelectorAll<HTMLElement>(
                ".page-description, .editor-hint, .badge, .button-primary, .muted, .field-hint",
              ),
            ]
              .filter(visible)
              .map((element) => ratio(element, getComputedStyle(element).color)),
            fields: [
              ...document.querySelectorAll<HTMLElement>(
                'input:not([type="checkbox"]):not([type="radio"]), select, textarea',
              ),
            ]
              .filter(visible)
              .map((element) =>
                ratio(element, getComputedStyle(element).borderTopColor),
              ),
          };
        });
        expect(contrast.text.length).toBeGreaterThan(0);
        expect(Math.min(...contrast.text)).toBeGreaterThanOrEqual(4.5);
        if (contrast.fields.length)
          expect(Math.min(...contrast.fields)).toBeGreaterThanOrEqual(3);
      }
      if (name === "editor") await page.locator(".step-summary").nth(1).click();
      if (isRedesign) {
        const fieldHeights = await page
          .locator(
            'input:not([type="checkbox"]):not([type="radio"]), select, textarea',
          )
          .evaluateAll((elements) =>
            elements
              .filter((element) =>
                element.getBoundingClientRect().width &&
                !element.matches(":disabled"),
              )
              .map((element) => element.getBoundingClientRect().height),
          );
        if (fieldHeights.length)
          expect(Math.min(...fieldHeights)).toBeGreaterThanOrEqual(36);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.tmp/pulso-${set}/${name}-${device}.png`,
        fullPage: true,
      });
      if (name === "editor") {
        await page.screenshot({
          path: `.tmp/pulso-${set}/editor-inicio-${device}.png`,
        });
        await page.evaluate(() => {
          const section = document.querySelector(".public-reply-section")!;
          window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - 88);
        });
        await page.screenshot({
          path: `.tmp/pulso-${set}/respostas-publicas-${device}.png`,
        });
        await page
          .locator(".message-button-card")
          .first()
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `.tmp/pulso-${set}/botoes-${device}.png`,
        });
      }
    }
  }
});

test("organiza quatro etapas, edita respostas públicas e simula somente falha definitiva", async ({
  page,
}) => {
  await login(page);
  await page.goto("/automacoes/nova");
  await expect(page.locator(".editor-main h2")).toHaveText([
    "Defina a automação",
    "Escolha as palavras-chave",
    "Configure as respostas públicas",
    "Monte a conversa",
  ]);
  await expect(page.locator(".editor-step-number")).toHaveText([
    "1",
    "2",
    "3",
    "4",
  ]);
  await expect(
    page
      .locator(".step-type-picker")
      .getByRole("button", { name: "Resposta pública" }),
  ).toHaveCount(0);
  const publicSection = page.getByRole("region", {
    name: "Configure as respostas públicas",
    exact: true,
  });
  await expect(
    publicSection.locator(".public-reply-variations textarea"),
  ).toHaveCount(5);
  for (let i = 1; i <= 5; i++) {
    await expect(
      publicSection.getByLabel(`Resposta pública ${i}`, { exact: true }),
    ).toHaveValue("");
    await publicSection
      .getByLabel(`Resposta pública ${i}`, { exact: true })
      .fill(`Minha resposta ${i}`);
  }
  await publicSection
    .getByLabel("Ativar respostas públicas automáticas", { exact: true })
    .check();
  await publicSection
    .getByRole("button", { name: "Adicionar variação" })
    .click();
  await publicSection
    .getByLabel("Resposta pública 6", { exact: true })
    .fill("Minha sexta resposta");
  await publicSection
    .getByLabel("Ativar resposta alternativa para falha definitiva da DM", {
      exact: true,
    })
    .check();
  await publicSection
    .getByLabel("Resposta pública alternativa", { exact: true })
    .fill("Minha alternativa de falha");
  await page.getByLabel("Adicionar palavra-chave").fill("quero");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("Minha DM preservada");
  await page.getByRole("button", { name: "Testar rascunho" }).click();
  await page.getByLabel("Comentário fictício").fill("quero");
  const preview = page.getByLabel("Prévia das respostas públicas", {
    exact: true,
  });
  await page.getByRole("button", { name: "Simular comentário" }).click();
  await expect(
    preview.getByText("Minha resposta 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Simular comentário" }).click();
  await expect(
    preview.getByText("Minha resposta 2", { exact: true }),
  ).toBeVisible();
  for (const outcome of ["API_ACCEPTED", "DELAYED", "TEMPORARY_FAILURE"]) {
    await page.getByLabel("Situação fictícia da DM").selectOption(outcome);
    await expect(
      preview.getByText("Minha alternativa de falha", { exact: true }),
    ).toHaveCount(0);
  }
  await page
    .getByLabel("Situação fictícia da DM")
    .selectOption("DEFINITIVE_FAILURE");
  await expect(
    preview.getByText("Minha alternativa de falha", { exact: true }),
  ).toBeVisible();
  await publicSection
    .getByLabel("Ativar respostas públicas automáticas", { exact: true })
    .uncheck();
  await expect(
    preview.getByText("Minha alternativa de falha", { exact: true }),
  ).toBeVisible();
  await publicSection
    .getByLabel("Ativar resposta alternativa para falha definitiva da DM", {
      exact: true,
    })
    .uncheck();
  await expect(preview).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  await page.reload();
  await expect(
    publicSection.getByLabel("Ativar respostas públicas automáticas", {
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    publicSection.getByLabel(
      "Ativar resposta alternativa para falha definitiva da DM",
      { exact: true },
    ),
  ).not.toBeChecked();
  for (let i = 1; i <= 5; i++)
    await expect(
      publicSection.getByLabel(`Resposta pública ${i}`, { exact: true }),
    ).toHaveValue(`Minha resposta ${i}`);
  await expect(
    publicSection.getByLabel("Resposta pública 6", { exact: true }),
  ).toHaveValue("Minha sexta resposta");
  await expect(
    publicSection.getByLabel("Resposta pública alternativa", { exact: true }),
  ).toHaveValue("Minha alternativa de falha");
  await page.locator(".step-summary").click();
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "Minha DM preservada",
  );
  await publicSection
    .getByLabel("Ativar respostas públicas automáticas", { exact: true })
    .check();
  await publicSection
    .getByLabel("Resposta pública 1", { exact: true })
    .fill("x".repeat(501));
  await expect(publicSection.locator(".field-error")).toContainText(
    "500 caracteres",
  );
  await publicSection
    .getByLabel("Resposta pública 1", { exact: true })
    .fill("Minha resposta editada");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  await page.reload();
  await expect(
    publicSection.getByLabel("Ativar respostas públicas automáticas", {
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    publicSection.getByLabel("Resposta pública 1", { exact: true }),
  ).toHaveValue("Minha resposta editada");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/public-replies-desktop.png",
    fullPage: true,
  });
});

test("reabre resposta pública antiga e rascunho incompleto na nova etapa", async ({
  page,
}) => {
  const old = await client.automation.create({
    data: {
      workspaceId,
      name: "Legado público",
      steps: {
        create: [
          {
            position: 0,
            kind: "PUBLIC_REPLY",
            text: "Resposta pública personalizada antiga",
          },
          {
            position: 1,
            kind: "BUTTONS",
            text: "DM antiga",
            buttons: [
              { label: "Site antigo", url: "https://example.com/antigo" },
            ],
          },
        ],
      },
    },
  });
  await login(page);
  await page.goto(`/automacoes/${old.id}`);
  await expect(
    page.getByLabel("Resposta pública 1", { exact: true }),
  ).toHaveValue("Resposta pública personalizada antiga");
  await expect(page.locator(".editor-step")).toHaveCount(1);
  await page.locator(".step-summary").click();
  await expect(page.getByLabel("Título do botão", { exact: true })).toHaveValue(
    "Site antigo",
  );
  await page
    .getByLabel("Ativar resposta alternativa para falha definitiva da DM", {
      exact: true,
    })
    .check();
  await page
    .getByLabel("Resposta pública alternativa", { exact: true })
    .fill("");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  await page.reload();
  await expect(
    page.getByLabel("Resposta pública 1", { exact: true }),
  ).toHaveValue("Resposta pública personalizada antiga");
  await expect(
    page.getByLabel("Ativar resposta alternativa para falha definitiva da DM", {
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Resposta pública alternativa", { exact: true }),
  ).toHaveValue("");
  const activation = await page.request.post(
    `/api/automacoes/${old.id}/ativar`,
    { headers: { Origin: "http://localhost:3100" } },
  );
  expect(activation.status()).toBe(400);
  expect((await activation.json()).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "publicReplies.fallback.text" }),
    ]),
  );
});

test("compacta e recolhe botões completos mantendo ações e edição no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("Minha conversa");
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  const cards = page
    .locator(".message-button-fields")
    .first()
    .locator(":scope > .message-button-card");
  await expect(
    cards.nth(0).getByRole("button", { name: "Recolher botão 1" }),
  ).toBeDisabled();
  await cards.nth(0).getByLabel("Título do botão").fill("Meu site");
  await cards.nth(0).getByLabel("URL do site").fill("https://example.com/site");
  const heights = await cards
    .nth(0)
    .locator("input, select")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
  expect(heights).toEqual([36, 36, 36]);
  const expanded = (await cards.nth(0).boundingBox())!.height;
  await cards.nth(0).getByRole("button", { name: "Recolher botão 1" }).click();
  await expect(cards.nth(0).getByLabel("Título do botão")).toHaveCount(0);
  await expect(cards.nth(0)).toHaveText("Meu siteAbrir site externo");
  expect((await cards.nth(0).boundingBox())!.height).toBeLessThan(expanded / 2);
  const simulator = page.getByRole("region", { name: "Simulador de conversa" });
  await simulator
    .getByRole("button", { name: "Meu site", exact: true })
    .click();
  await expect(simulator.locator(".simulated-url")).toContainText(
    "https://example.com/site",
  );
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  await cards
    .nth(1)
    .getByLabel("Título do botão", { exact: true })
    .fill("Continuar");
  await cards
    .nth(1)
    .getByLabel("O que acontece ao clicar?", { exact: true })
    .selectOption("NEXT_MESSAGE");
  await cards
    .nth(1)
    .getByLabel("Texto da próxima mensagem", { exact: true })
    .fill("Minha continuação");
  await cards
    .nth(1)
    .getByRole("button", { name: "Recolher botão 2", exact: true })
    .click();
  await expect(cards.nth(1)).toHaveText("ContinuarEnviar próxima mensagem");
  await simulator
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await expect(
    simulator.getByText("Minha continuação", { exact: true }),
  ).toBeVisible();
  await cards.nth(0).getByRole("button", { name: "Expandir botão 1" }).click();
  await cards.nth(0).getByLabel("Título do botão").fill("Site editado");
  await cards.nth(0).getByRole("button", { name: "Remover botão 1" }).click();
  await expect(cards.nth(0)).toHaveText("ContinuarEnviar próxima mensagem");
  await cards.nth(0).getByRole("button", { name: "Expandir botão 1" }).click();
  await expect(
    cards.nth(0).getByLabel("Texto da próxima mensagem", { exact: true }),
  ).toHaveValue("Minha continuação");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator(".message-button-card").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/compact-buttons-mobile.png" });
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  await page.reload();
  await page.locator(".step-summary").click();
  await expect(
    page.getByLabel("Texto da próxima mensagem", { exact: true }),
  ).toHaveValue("Minha continuação");
});

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
  expect((await request.get("/api/automacoes")).status()).toBe(401);
  expect(
    (
      await request.post("/api/automacoes", {
        headers: { Origin: "http://localhost:3100" },
        data: { name: "", scope: "GLOBAL", keywords: [], steps: [] },
      })
    ).status(),
  ).toBe(401);
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

test("verifica Instagram sem token e mostra estados seguros no painel", async ({ page, request }) => {
  expect((await request.get("/api/instagram/conexao")).status()).toBe(401);
  await login(page);
  const section = page.getByRole("region", { name: "Conexão Instagram" });
  await expect(page.getByText("Envios desabilitados", { exact: true })).toBeVisible();
  await expect(section.getByText("Não conectado", { exact: true })).toBeVisible();
  const unconfigured = await page.request.get("/api/instagram/conexao");
  expect(unconfigured.headers()["cache-control"]).toBe("private, no-store");
  expect((await unconfigured.json()).status).toBe("NOT_CONFIGURED");
  let state = "CONNECTED";
  await page.route("**/api/instagram/conexao", async route => {
    if (state === "HTTP_ERROR") return route.fulfill({ status: 503, json: { error: "Indisponível" } });
    await route.fulfill({ json: {
      status: state,
      message: state === "CONNECTED" ? "Acesso de leitura confirmado." : "O token expirou. Atualize a configuração local.",
      account: state === "CONNECTED" ? { id: "17841400000000001", username: "pulso_teste" } : null,
      checkedAt: "2026-10-13T12:00:00.000Z",
    } });
  });
  await section.getByRole("button", { name: "Verificar conexão" }).click();
  await expect(section.getByText("Leitura verificada", { exact: true })).toBeVisible();
  await expect(section.getByRole("heading", { name: "@pulso_teste" })).toBeVisible();
  await expect(section.getByText("ID da conta: 17841400000000001", { exact: true })).toBeVisible();
  state = "TOKEN_EXPIRED";
  await section.getByRole("button", { name: "Verificar conexão" }).click();
  await expect(section.getByText("Token expirado", { exact: true })).toBeVisible();
  await expect(section.getByText(/ID da conta:/)).toHaveCount(0);
  state = "HTTP_ERROR";
  await section.getByRole("button", { name: "Verificar conexão" }).click();
  await expect(section.getByRole("alert")).toContainText("Não foi possível atualizar");
  await expect(section.getByText("Token expirado", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("pesquisa Reels, salva seleção específica e mantém dados ao falhar sincronização", async ({ page, request }) => {
  expect((await request.get("/api/instagram/reels")).status()).toBe(401);
  expect((await request.post("/api/instagram/reels", { headers: { Origin: "http://localhost:3100" } })).status()).toBe(401);
  const account = await client.socialAccount.create({ data: { workspaceId, platform: "INSTAGRAM", externalId: "17841400000000199", username: "pulso_teste", status: "CONNECTED", reelsSyncedAt: new Date() } });
  await client.instagramReel.createMany({ data: ["17900000000000011", "17900000000000012"].map((externalId, index) => ({ socialAccountId: account.id, externalId, caption: index ? "Outra publicação 😊" : "Lançamento 🚀", publishedAt: new Date("2026-10-01T12:00:00Z"), mediaType: "VIDEO", mediaProductType: "REELS", classification: "PRODUCT_TYPE", syncedAt: new Date(), permalink: `https://www.instagram.com/reel/Test${index}/` })) });
  await login(page);
  expect((await page.request.post("/api/instagram/reels")).status()).toBe(403);
  await page.goto("/reels");
  await expect(page.getByRole("heading", { name: "Meus Reels", exact: true })).toBeVisible();
  await page.getByLabel("Pesquisar Reels").fill("lançamento");
  await expect(page.getByText("Lançamento 🚀", { exact: true })).toBeVisible();
  await expect(page.getByText("Outra publicação 😊", { exact: true })).toHaveCount(0);
  await page.route("**/api/instagram/reels", async route => route.request().method() === "POST" ? route.fulfill({ status: 422, json: { error: "A Meta informou que o token expirou. Os Reels armazenados foram preservados.", code: "TOKEN_EXPIRED" } }) : route.continue());
  await page.getByRole("button", { name: "Sincronizar Reels" }).click();
  await expect(page.getByRole("region", { name: "Meus Reels" }).getByRole("alert")).toContainText("Os Reels armazenados foram preservados");
  expect(await client.instagramReel.count({ where: { socialAccountId: account.id } })).toBe(2);
  await page.unroute("**/api/instagram/reels");
  await page.goto("/automacoes/nova");
  const scope = page.getByRole("radio", { name: /Reels específicos/ });
  await expect(scope).toBeEnabled(); await scope.check();
  await page.getByLabel("Selecionar Reel 17900000000000011").check();
  await page.getByLabel("Selecionar Reel 17900000000000012").check();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo com segurança.", { exact: true })).toBeVisible();
  const saved = await client.automation.findFirstOrThrow({ where: { workspaceId }, include: { reels: true } });
  expect(saved.scope).toBe("SPECIFIC_REELS"); expect(saved.reels).toHaveLength(2);
  await page.reload();
  await expect(page.getByLabel("Selecionar Reel 17900000000000011")).toBeChecked();
  await expect(page.getByLabel("Selecionar Reel 17900000000000012")).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".tmp/reels-editor-mobile.png", fullPage: true });
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
    page.getByText("Não iniciado; a consulta de leitura é exibida no painel.", { exact: true }),
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

test("cria um rascunho no editor sequencial e revisa a prévia", async ({
  page,
}) => {
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByLabel("Nome da automação").fill("Catálogo por comentário");
  await page.getByLabel("Adicionar palavra-chave").fill("quero");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page.getByLabel("Mensagem da DM").fill("Oi! Aqui está o catálogo.");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Rascunho salvo com segurança.",
  );
  await page.getByRole("button", { name: "Testar rascunho" }).click();
  await expect(
    page.locator(".preview-message", { hasText: "Oi! Aqui está o catálogo." }),
  ).toBeVisible();
  await page.goto("/automacoes");
  await expect(
    page.getByText("Catálogo por comentário", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mais ações para Catálogo por comentário" })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(
    page.getByText("Catálogo por comentário", { exact: true }),
  ).toHaveCount(0);
});

test("salva e reabre rascunho sem nome, com DM vazia e bloqueia ativação", async ({
  page,
}) => {
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Mensagem da DM", { exact: true }),
  ).toHaveAttribute("placeholder", "Escreva a mensagem que será enviada");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  const id = page.url().split("/").at(-1);
  const response = await page.request.post(`/api/automacoes/${id}/ativar`, {
    headers: { Origin: "http://localhost:3100" },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: "name" })]),
  );
  await page.reload();
  await expect(page.getByLabel("Nome da automação")).toHaveValue("");
  await page.locator(".step-summary").click();
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Testar rascunho" }).click();
  await expect(page.getByLabel("Comentário fictício")).toBeVisible();
  await page.getByLabel("Comentário fictício").fill("Um comentário");
  await page.getByRole("button", { name: "Simular comentário" }).click();
  await expect(page.locator(".trigger-result")).toContainText(
    "Nenhuma palavra-chave",
  );
  await page.goto("/automacoes");
  await expect(
    page.getByText("Rascunho sem título", { exact: true }),
  ).toBeVisible();
});

test("personaliza botões, continuações e prévia interativa sem salvar", async ({
  page,
}) => {
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByLabel("Adicionar palavra-chave").fill("quero");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("Minha oferta 😊");
  const simulator = page.getByRole("region", { name: "Simulador de conversa" });
  await expect(simulator.locator(".conversation-text")).toHaveText(
    "Minha oferta 😊",
  );
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  const buttons = page
    .locator(".message-button-fields")
    .first()
    .locator(":scope > .message-button-card");
  await expect(buttons.nth(0).getByLabel("Título do botão")).toHaveValue("");
  await expect(buttons.nth(0).getByLabel("URL do site")).toHaveValue("");
  await buttons.nth(0).getByLabel("Título do botão").fill("Meu site");
  await buttons
    .nth(0)
    .getByLabel("URL do site")
    .fill("https://example.com/oferta");
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  await buttons
    .nth(1)
    .getByLabel("Título do botão", { exact: true })
    .fill("Continuar");
  await buttons
    .nth(1)
    .getByLabel("O que acontece ao clicar?", { exact: true })
    .selectOption("NEXT_MESSAGE");
  await expect(buttons.nth(1).getByLabel("URL do site")).toHaveCount(0);
  await page
    .getByLabel("Texto da próxima mensagem", { exact: true })
    .fill("Minha segunda mensagem");
  const child = page.getByRole("group", {
    name: "Próxima mensagem",
    exact: true,
  });
  await child
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  await child
    .getByLabel("Título do botão", { exact: true })
    .fill("Mais detalhes");
  await child
    .getByLabel("O que acontece ao clicar?", { exact: true })
    .selectOption("NEXT_MESSAGE");
  await page
    .getByLabel("Texto da próxima mensagem", { exact: true })
    .nth(1)
    .fill("Terceira mensagem");
  await simulator
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await expect(
    simulator.getByText("Minha segunda mensagem", { exact: true }),
  ).toBeVisible();
  await simulator
    .getByRole("button", { name: "Mais detalhes", exact: true })
    .click();
  await expect(
    simulator.getByText("Terceira mensagem", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  await simulator.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(
    simulator.getByText("Terceira mensagem", { exact: true }),
  ).toHaveCount(0);
  await simulator.getByRole("button", { name: "Reiniciar simulação" }).click();
  await expect(
    simulator.getByText("Minha segunda mensagem", { exact: true }),
  ).toHaveCount(0);
  await simulator
    .getByRole("button", { name: "Meu site", exact: true })
    .click();
  await expect(simulator.locator(".simulated-url")).toContainText(
    "https://example.com/oferta",
  );
  await expect(
    simulator.getByRole("link", { name: "Abrir site em nova aba" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await buttons.nth(0).getByLabel("Título do botão").fill("Título editado");
  await expect(
    simulator.getByRole("button", { name: "Título editado", exact: true }),
  ).toBeVisible();
  await buttons
    .nth(0)
    .getByRole("button", { name: "Remover botão 1", exact: true })
    .click();
  await expect(
    simulator.getByRole("button", { name: "Título editado", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Testar rascunho" }).click();
  await page.getByLabel("Comentário fictício").fill("QUERO receber detalhes!");
  await page.getByRole("button", { name: "Simular comentário" }).click();
  await expect(page.locator(".trigger-result")).toContainText(
    "acionaria a automação",
  );
  await page.getByLabel("Comentário fictício").fill("outro assunto");
  await page.getByRole("button", { name: "Simular comentário" }).click();
  await expect(page.locator(".trigger-result")).toContainText("não acionaria");
  expect((await page.request.get("/api/automacoes")).status()).toBe(200);
  expect(await (await page.request.get("/api/automacoes")).json()).toHaveLength(
    0,
  );
});

test("salva URL incompleta, preserva continuação ao trocar ação e reabrir", async ({
  page,
}) => {
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("Texto personalizado");
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  await page.getByLabel("Título do botão", { exact: true }).fill("Continuar");
  await page.getByLabel("URL do site").fill("https://");
  await expect(
    page.locator(".field-error").filter({ hasText: "URL HTTPS" }),
  ).toBeVisible();
  await page
    .getByLabel("O que acontece ao clicar?")
    .selectOption("NEXT_MESSAGE");
  await page
    .getByLabel("Texto da próxima mensagem", { exact: true })
    .fill("Continuação personalizada");
  await page.getByLabel("O que acontece ao clicar?").selectOption("OPEN_URL");
  await expect(page.getByLabel("URL do site")).toHaveValue("https://");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  await page.reload();
  await page.locator(".step-summary").click();
  await expect(page.getByLabel("URL do site")).toHaveValue("https://");
  await page
    .getByLabel("O que acontece ao clicar?")
    .selectOption("NEXT_MESSAGE");
  await expect(
    page.getByLabel("Texto da próxima mensagem", { exact: true }),
  ).toHaveValue("Continuação personalizada");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  await page.reload();
  await page.locator(".step-summary").click();
  await expect(
    page.getByLabel("Texto da próxima mensagem", { exact: true }),
  ).toHaveValue("Continuação personalizada");
  await page
    .getByRole("button", { name: "Duplicar mensagem ou etapa" })
    .click();
  await expect(page.locator(".editor-step")).toHaveCount(2);
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "Texto personalizado",
  );
  await page.getByRole("button", { name: "Excluir etapa" }).click();
  await expect(page.locator(".editor-step")).toHaveCount(1);
});

test("simula tags e atrasos, limita botões e não altera registros", async ({
  page,
}) => {
  const tag = await client.tag.create({
    data: {
      workspaceId,
      name: "Tag personalizada",
      normalizedName: "tag personalizada",
    },
  });
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("😊".repeat(251));
  await expect(page.locator(".message-count")).toContainText("1004 bytes");
  await expect(
    page.locator(".field-error").filter({ hasText: "1.000 bytes" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar botão", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Adicionar botão", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await expect(page.getByLabel("Tag para adicionar")).toHaveValue("");
  await page.getByLabel("Tag para adicionar").selectOption(tag.id);
  await page.getByRole("button", { name: "Atraso", exact: true }).click();
  await page.getByLabel("Esperar antes da próxima etapa").fill("30");
  await page.getByRole("button", { name: "Testar rascunho" }).click();
  await expect(page.locator(".simulation-actions")).toContainText(
    "Tag personalizada",
  );
  await expect(page.locator(".simulation-actions")).toContainText(
    "30 segundos",
  );
  expect(
    (await client.tag.findMany({ where: { workspaceId } })).map(
      (item) => item.id,
    ),
  ).toEqual([tag.id]);
  expect(await client.automation.count({ where: { workspaceId } })).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
});

test("mantém etapa antiga de botões editável e preserva título e URL", async ({
  page,
}) => {
  const old = await client.automation.create({
    data: {
      workspaceId,
      name: "Automação antiga",
      steps: {
        create: {
          position: 0,
          kind: "BUTTONS",
          text: "Mensagem antiga",
          buttons: [
            { label: "Meu botão antigo", url: "https://example.com/legado" },
          ],
        },
      },
    },
  });
  await login(page);
  await page.goto(`/automacoes/${old.id}`);
  await page.locator(".step-summary").click();
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "Mensagem antiga",
  );
  await expect(page.getByLabel("Título do botão", { exact: true })).toHaveValue(
    "Meu botão antigo",
  );
  await expect(page.getByLabel("URL do site")).toHaveValue(
    "https://example.com/legado",
  );
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("Mensagem antiga revisada");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo",
  );
  await page.reload();
  await page.locator(".step-summary").click();
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "Mensagem antiga revisada",
  );
  await expect(page.getByLabel("Título do botão", { exact: true })).toHaveValue(
    "Meu botão antigo",
  );
  await expect(page.getByLabel("URL do site")).toHaveValue(
    "https://example.com/legado",
  );
});

test("preserva alterações feitas enquanto uma versão anterior está salvando", async ({
  page,
}) => {
  await login(page);
  await page.goto("/automacoes/nova");
  await page.getByRole("button", { name: "DM", exact: true }).click();
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("Primeira versão");
  let release: () => void = () => {};
  let captured: () => void = () => {};
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/automacoes", async (route) => {
    captured();
    await paused;
    await route.continue();
  });
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await intercepted;
  await page
    .getByLabel("Mensagem da DM", { exact: true })
    .fill("Versão mais recente");
  release();
  await expect(page.locator(".editor-feedback")).toContainText(
    "alterações recentes ainda não salvas",
  );
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "Versão mais recente",
  );
  await page.unroute("**/api/automacoes");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.locator(".editor-feedback")).toContainText(
    "Rascunho salvo com segurança.",
  );
  await page.reload();
  await page.locator(".step-summary").click();
  await expect(page.getByLabel("Mensagem da DM", { exact: true })).toHaveValue(
    "Versão mais recente",
  );
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

test("mantém login antigo acima de 14 caracteres e revoga acesso após redefinir", async ({
  page,
}) => {
  expect(password.length).toBeGreaterThan(14);
  await login(page);
  const replacement = `Aa1!${randomUUID().replaceAll("-", "").slice(0, 2)}`;
  await resetOwnerPassword(client, email, {
    password: replacement,
    confirmation: replacement,
  });
  await page.goto("/tags");
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/tags")).status()).toBe(401);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
  await expect(page.locator(".login-error")).toContainText(
    "Não foi possível entrar.",
  );
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Senha", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  expect((await page.request.get("/api/tags")).status()).toBe(200);
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
