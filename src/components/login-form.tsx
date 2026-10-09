"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { loginSchema } from "@/lib/validation";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<{ email?: string; password?: string }>(
    {},
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFields({});
    const data = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: data.get("email"),
      password: data.get("password"),
    });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFields({ email: errors.email?.[0], password: errors.password?.[0] });
      return;
    }
    setPending(true);
    try {
      const result = await signIn("credentials", {
        ...parsed.data,
        redirect: false,
        callbackUrl: "/painel",
      });
      if (!result?.ok || result.error)
        setError(
          "Não foi possível entrar. Confira e-mail e senha. Após várias tentativas, aguarde 15 minutos.",
        );
      else {
        router.replace("/painel");
        router.refresh();
      }
    } catch {
      setError("Não foi possível entrar agora. Tente novamente em instantes.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <label htmlFor="email">E-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="Seu e-mail"
        maxLength={254}
        required
        disabled={pending || !configured}
        aria-invalid={!!fields.email}
        aria-describedby={fields.email ? "email-error" : undefined}
      />
      {fields.email ? (
        <p id="email-error" className="form-error" role="alert">
          {fields.email}
        </p>
      ) : null}
      <label htmlFor="password">Senha</label>
      <div className="password-field">
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Sua senha"
          maxLength={128}
          required
          disabled={pending || !configured}
          aria-invalid={!!fields.password}
          aria-describedby={fields.password ? "password-error" : undefined}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {fields.password ? (
        <p id="password-error" className="form-error" role="alert">
          {fields.password}
        </p>
      ) : null}
      {error ? (
        <p className="form-error login-error" role="alert">
          {error}
        </p>
      ) : null}
      {!configured ? (
        <p className="form-error" role="alert">
          O acesso a este espaço ainda está em preparação.
        </p>
      ) : null}
      <button
        className="button button-primary login-submit"
        disabled={pending || !configured}
      >
        {pending ? (
          <>
            <LoaderCircle className="spin" size={18} /> Entrando…
          </>
        ) : (
          <>
            Entrar no meu espaço <ArrowRight size={17} />
          </>
        )}
      </button>
    </form>
  );
}
