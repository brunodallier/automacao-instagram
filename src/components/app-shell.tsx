"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { signOut } from "next-auth/react";
import {
  ArrowUpRight,
  Activity,
  Settings2,
  Tag,
  LayoutDashboard,
  Workflow,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Camera as Instagram,
} from "lucide-react";
import { Badge, Brand } from "@/components/ui";

const navigation = [
  {
    href: "/painel",
    label: "Painel principal",
    icon: LayoutDashboard,
    group: "Visão geral",
  },
  {
    href: "/automacoes",
    label: "Automações",
    icon: Workflow,
    group: "Organização",
  },
  { href: "/tags", label: "Tags", icon: Tag, group: "Organização" },
  {
    href: "/saude",
    label: "Saúde do sistema",
    icon: Activity,
    group: "Gerenciamento",
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings2,
    group: "Gerenciamento",
  },
];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal">
      <p className="nav-label">Seu espaço</p>
      {navigation.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`nav-item ${pathname === href ? "active" : ""}`}
          aria-current={pathname === href ? "page" : undefined}
          onClick={onNavigate}
        >
          <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({
  children,
  user,
  workspaceName,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
  workspaceName: string;
}) {
  const pathname = usePathname();
  const mobileMenu = useRef<HTMLDialogElement>(null);
  const current = navigation.find((item) => item.href === pathname);
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className="app-shell">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <Link
          href="/painel"
          className="brand-link"
          aria-label="Pulso, painel principal"
        >
          <Brand />
          <span className="brand-caption">AUTOMAÇÃO INSTAGRAM</span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-initial">
            {workspaceName[0]?.toUpperCase()}
          </span>
          <span>
            {workspaceName}
            <small>Espaço de trabalho</small>
          </span>
        </div>
        <Navigation />
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-label">PASSO A PASSO</span>
            <p>
              Uma boa conversa
              <br />
              começa com organização.
            </p>
            <Link href="/tags">
              Organizar minhas tags{" "}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="owner-block">
            <span className="avatar">{initials}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Proprietário</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sair da conta"
              title="Sair da conta"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu-button"
              aria-label="Abrir navegação"
              onClick={() => mobileMenu.current?.showModal()}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb-root">
              {current?.group ?? "Seu espaço"}
            </span>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{current?.label}</span>
          </div>
          <div className="topbar-status">
            <Instagram size={16} aria-hidden="true" />
            <span>Instagram</span>
            <Badge>Não conectado</Badge>
          </div>
        </header>
        <main id="conteudo" className="main-content">
          {children}
          <footer className="page-footer">
            <span>Pulso · Seu espaço de automação</span>
            <span>
              Base da plataforma <span className="footer-version">01</span>
            </span>
          </footer>
        </main>
      </div>
      <dialog ref={mobileMenu} className="mobile-navigation">
        <div className="mobile-navigation-heading">
          <Brand />
          <button
            className="icon-button"
            aria-label="Fechar navegação"
            onClick={() => mobileMenu.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <Navigation onNavigate={() => mobileMenu.current?.close()} />
        <button
          className="button button-secondary mobile-signout"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut size={17} /> Sair da conta
        </button>
      </dialog>
    </div>
  );
}
