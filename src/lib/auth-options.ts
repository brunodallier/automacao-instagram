import { createHash, randomBytes } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation";

let dummyHash: Promise<string> | undefined;

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },
  providers: [
    CredentialsProvider({
      name: "E-mail e senha",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (
          !process.env.NEXTAUTH_SECRET ||
          process.env.NEXTAUTH_SECRET.length < 32
        )
          return null;
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        try {
          const key = createHash("sha256").update(email).digest("hex");
          const attempts = await db.$queryRaw<{ attempts: number }[]>`
          INSERT INTO "LoginRateLimit" ("key", "attempts", "expiresAt")
          VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
          ON CONFLICT ("key") DO UPDATE SET
            "attempts" = CASE WHEN "LoginRateLimit"."expiresAt" < NOW() THEN 1 ELSE LEAST("LoginRateLimit"."attempts" + 1, 11) END,
            "expiresAt" = CASE WHEN "LoginRateLimit"."expiresAt" < NOW() THEN NOW() + INTERVAL '15 minutes' ELSE "LoginRateLimit"."expiresAt" END
          RETURNING "attempts"`;
          if (attempts[0].attempts > 10) return null;
          // O relógio do banco governa toda a janela, inclusive sua limpeza.
          await db.$executeRaw`DELETE FROM "LoginRateLimit" WHERE "expiresAt" < NOW()`;
          const user = await db.user.findUnique({ where: { email } });
          dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
          const valid = await verifyPassword(
            password,
            user?.passwordHash ?? (await dummyHash),
          );
          if (!user || !valid) return null;
          await db.loginRateLimit.deleteMany({ where: { key } });
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            sessionVersion: user.sessionVersion,
          };
        } catch {
          console.error(
            "Falha ao consultar autenticação. Verifique a configuração do banco.",
          );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
        token.authenticatedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
