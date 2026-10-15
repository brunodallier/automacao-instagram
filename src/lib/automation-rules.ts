import {
  normalizeAutomationKeyword,
  type AutomationDraft,
  type MessageDraft,
} from "@/lib/automation-draft";
import { publicReplyIssues } from "@/lib/public-replies";

// Verified against Meta's Send API and button-template documentation.
// Button titles use a conservative local policy pending Instagram integration.
export const META_LIMITS = {
  textBytes: 1000,
  templateCharacters: 640,
  buttonTitleCharacters: 20,
  buttons: 3,
} as const;
export type DraftIssue = { path: string; message: string };
export function characterCount(text: string) {
  return Array.from(text).length;
}
export function utf8Bytes(text: string) {
  return new TextEncoder().encode(text).length;
}
export function isHttpsUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function messageIssues(
  message: MessageDraft,
  path: string,
  initial: boolean,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (field: string, text: string) =>
    issues.push({ path: `${path}.${field}`, message: text });
  if (!message.text.trim())
    add("text", "Escreva o texto da mensagem antes de ativar.");
  if (message.buttons.length) {
    if (characterCount(message.text) > META_LIMITS.templateCharacters)
      add(
        "text",
        "Mensagens com botões aceitam até 640 caracteres no modelo da Meta.",
      );
    if (initial)
      add(
        "buttons",
        "Botões na primeira resposta privada ao comentário não estão confirmados. Use texto nessa primeira DM e reserve os botões para uma conversa autorizada.",
      );
  } else if (utf8Bytes(message.text) > META_LIMITS.textBytes)
    add("text", "A mensagem de texto ultrapassa 1.000 bytes UTF-8.");
  if (message.buttons.length > META_LIMITS.buttons)
    add("buttons", "Use no máximo três botões por mensagem.");
  message.buttons.forEach((button, index) => {
    const prefix = `buttons.${index}`;
    if (!button.label.trim())
      add(`${prefix}.label`, "Defina o título do botão antes de ativar.");
    else if (characterCount(button.label) > META_LIMITS.buttonTitleCharacters)
      add(
        `${prefix}.label`,
        "Use até 20 caracteres no título do botão (limite conservador do editor).",
      );
    if (button.action === "OPEN_URL") {
      if (!isHttpsUrl(button.url))
        add(
          `${prefix}.url`,
          "Informe uma URL HTTPS completa para abrir o site.",
        );
    } else if (!button.nextMessage)
      add(
        `${prefix}.nextMessage`,
        "Configure a próxima mensagem antes de ativar.",
      );
    else
      issues.push(
        ...messageIssues(
          button.nextMessage,
          `${path}.${prefix}.nextMessage`,
          false,
        ),
      );
  });
  return issues;
}

export function activationIssues(draft: AutomationDraft): DraftIssue[] {
  const issues: DraftIssue[] = publicReplyIssues(draft.publicReplies);
  if (!draft.name.trim())
    issues.push({ path: "name", message: "Defina um nome antes de ativar." });
  if (!draft.keywords.length)
    issues.push({
      path: "keywords",
      message: "Adicione pelo menos uma palavra-chave antes de ativar.",
    });
  if (draft.scope === "SPECIFIC_REELS" && !draft.reelIds?.length)
    issues.push({
      path: "scope",
      message: "Conecte o Instagram e selecione os Reels antes de ativar.",
    });
  let initial = true;
  draft.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    if (step.kind === "SEND_DM" || step.kind === "BUTTONS") {
      issues.push(...messageIssues(step, path, initial));
      // O motor persiste WAITING_INTERACTION e só continua após webhook elegível.
      initial = false;
    } else if (step.kind === "ADD_TAG" && !step.tagId)
      issues.push({
        path: `${path}.tagId`,
        message: "Escolha uma tag antes de ativar.",
      });
    else if (
      step.kind === "DELAY" &&
      (!step.delaySeconds || step.delaySeconds < 1)
    )
      issues.push({
        path: `${path}.delaySeconds`,
        message: "Defina um atraso entre 1 segundo e 24 horas.",
      });
  });
  if (initial)
    issues.push({
      path: "steps",
      message: "Configure a primeira mensagem privada antes de ativar.",
    });
  return issues;
}

export const conversationPolicy = {
  initialType: "PRIVATE_REPLY",
  subsequentType: "AUTHORIZED_CONVERSATION",
  privateReplyWindowMs: 7 * 24 * 60 * 60 * 1000,
  messagingWindowMs: 24 * 60 * 60 * 1000,
  initialButtonsConfirmed: false,
} as const;
type DeliveryContext = {
  now: number;
  commentCreatedAt?: number;
  privateReplyAlreadySent?: boolean;
  lastEligibleInteractionAt?: number;
  verifiedInteraction?: "INBOUND_MESSAGE" | "POSTBACK" | "URL_CLICK";
};
// Pure guard for the future delivery engine. A simulator click is never a webhook.
export function canDeliverMessage(
  type: "PRIVATE_REPLY" | "AUTHORIZED_CONVERSATION",
  context: DeliveryContext,
) {
  if (type === "PRIVATE_REPLY")
    return (
      !context.privateReplyAlreadySent &&
      context.commentCreatedAt !== undefined &&
      context.commentCreatedAt <= context.now &&
      context.now - context.commentCreatedAt <
        conversationPolicy.privateReplyWindowMs
    );
  return (
    context.verifiedInteraction !== undefined &&
    context.verifiedInteraction !== "URL_CLICK" &&
    context.lastEligibleInteractionAt !== undefined &&
    context.lastEligibleInteractionAt <= context.now &&
    context.now - context.lastEligibleInteractionAt <
      conversationPolicy.messagingWindowMs
  );
}

// Match complete words/phrases after case and whitespace normalization.
// Accent differences remain meaningful, as with existing keywords.
export function matchingKeywords(comment: string, keywords: string[]) {
  const normalized = normalizeAutomationKeyword(comment);
  return keywords.filter((keyword) => {
    const needle = normalizeAutomationKeyword(keyword);
    let from = 0;
    while (needle) {
      const at = normalized.indexOf(needle, from);
      if (at < 0) break;
      const before = normalized[at - 1] ?? "";
      const after = normalized[at + needle.length] ?? "";
      if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after))
        return true;
      from = at + needle.length;
    }
    return false;
  });
}
