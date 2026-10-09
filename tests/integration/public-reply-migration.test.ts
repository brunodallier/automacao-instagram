import { readFileSync } from "node:fs";
import pg from "pg";
import { expect, it } from "vitest";
import { fixtureName, testDatabaseUrl } from "../helpers/database";

it("migra respostas antigas sem alterar registros, ordem, rascunhos ou conversa", async () => {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schema = fixtureName().replaceAll("-", "_");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query("SELECT set_config('search_path', $1, true)", [schema]);
    await client.query(
      'CREATE TABLE "Automation" (id text PRIMARY KEY, name text, status text); CREATE TABLE "AutomationStep" (id text PRIMARY KEY, "automationId" text, position int, kind text, text text, buttons jsonb)',
    );
    await client.query(
      "INSERT INTO \"Automation\" VALUES ('old','Meu rascunho','DRAFT'), ('empty','','DRAFT'), ('many','Mais variações','DRAFT')",
    );
    const steps = [
      [
        "dm",
        "old",
        0,
        "SEND_DM",
        "DM com continuação",
        [
          {
            label: "Continuar",
            action: "NEXT_MESSAGE",
            nextMessage: { text: "Minha próxima" },
          },
        ],
      ],
      ["public2", "old", 3, "PUBLIC_REPLY", "  Resposta pública  ", null],
      ["public1", "old", 1, "PUBLIC_REPLY", "", null],
      ["long", "old", 5, "PUBLIC_REPLY", "x".repeat(700), null],
      ...Array.from({ length: 6 }, (_, n) => [
        `many${n}`,
        "many",
        n,
        "PUBLIC_REPLY",
        `Variação ${n}`,
        null,
      ]),
    ];
    for (const row of steps)
      await client.query(
        'INSERT INTO "AutomationStep" VALUES ($1,$2,$3,$4,$5,$6)',
        [...row.slice(0, 5), row[5] === null ? null : JSON.stringify(row[5])],
      );
    const before = (
      await client.query('SELECT * FROM "AutomationStep" ORDER BY id')
    ).rows;
    await client.query(
      readFileSync(
        "prisma/migrations/202610091700_public_reply_config/migration.sql",
        "utf8",
      ),
    );
    const after = (
      await client.query('SELECT * FROM "AutomationStep" ORDER BY id')
    ).rows;
    expect(after).toEqual(before);
    const rows = (await client.query('SELECT * FROM "Automation" ORDER BY id'))
      .rows;
    expect(rows.find((row) => row.id === "old")).toMatchObject({
      name: "Meu rascunho",
      status: "DRAFT",
      publicReplies: {
        enabled: true,
        strategy: "ROTATING",
        variations: ["", "  Resposta pública  ", "x".repeat(700), "", ""],
        fallback: { enabled: false, text: "" },
      },
    });
    expect(rows.find((row) => row.id === "empty").publicReplies).toBeNull();
    expect(
      rows.find((row) => row.id === "many").publicReplies.variations,
    ).toEqual(Array.from({ length: 6 }, (_, n) => `Variação ${n}`));
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
