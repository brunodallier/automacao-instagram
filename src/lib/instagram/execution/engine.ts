import { randomBytes, randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type InstagramJob,
  type InstagramAutomationRun,
} from "@/generated/prisma/client";
import {
  automationDraftSchema,
  messageDraftSchema,
  readStoredStep,
  readPublicReplies,
  type MessageDraft,
} from "@/lib/automation-draft";
import {
  activationIssues,
  canDeliverMessage,
  matchingKeywords,
  messageIssues,
  conversationPolicy,
} from "@/lib/automation-rules";
import { prioritizeEligibleAutomations } from "@/lib/automation-contract";
import { rotatingPublicReply, fallbackPublicReply } from "@/lib/public-replies";
import {
  allowSend,
  executionConfigured,
  graphId,
  type ExecutionSettings,
} from "./config";
import { eventHash } from "./security";
import {
  InstagramReadError,
  type InstagramTransport,
  type SendOutcome,
  type CommentDetails,
  type ReelDetails,
} from "./transport";

type Tx = Prisma.TransactionClient;
export class ExecutionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const json = (value: unknown) => value as Prisma.InputJsonValue;
const terminal = new Set(["CANCELLED", "FAILED", "REVIEW"]);
export type EngineOptions = {
  settings: ExecutionSettings;
  transport: InstagramTransport;
  now?: () => Date;
};
export function automationEngine(
  client: PrismaClient,
  { settings, transport, now = () => new Date() }: EngineOptions,
) {
  const activity = (tx: Tx, runId: string, kind: string, detail?: string) =>
    tx.instagramActivity.create({ data: { runId, kind, detail } });
  async function enqueue(
    tx: Tx,
    data: {
      socialAccountId: string;
      kind: string;
      dedupeKey: string;
      eventId?: string;
      runId?: string;
      outboundId?: string;
      availableAt?: Date;
    },
  ) {
    await tx.instagramJob.createMany({
      data: { ...data, availableAt: data.availableAt ?? now() },
      skipDuplicates: true,
    });
  }
  async function locked(job: InstagramJob, fn: (tx: Tx) => Promise<void>) {
    await client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "InstagramJob" WHERE id=${job.id} AND state='RUNNING' AND "leaseToken"=${job.leaseToken} AND "leaseUntil">${now()} FOR UPDATE`;
      if (!rows.length) return;
      await fn(tx);
    });
  }
  async function lockRun(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "InstagramAutomationRun" WHERE id=${id} FOR UPDATE`;
    return tx.instagramAutomationRun.findUniqueOrThrow({
      where: { id },
      include: { socialAccount: true, automation: true },
    });
  }
  async function finish(
    tx: Tx,
    job: InstagramJob,
    state = "DONE",
    error?: string,
  ) {
    await tx.instagramJob.update({
      where: { id: job.id },
      data: { state, leaseToken: null, leaseUntil: null, lastError: error },
    });
  }
  async function validRun(
    tx: Tx,
    run: Awaited<ReturnType<typeof lockRun>>,
    approvedFallback = false,
  ) {
    if (
      terminal.has(run.state) &&
      !(approvedFallback && run.state === "FAILED")
    )
      return false;
    if (
      !run.automation ||
      run.automation.status !== "ACTIVE" ||
      run.automation.updatedAt.getTime() !==
        run.automationUpdatedAt.getTime() ||
      run.socialAccount.status !== "CONNECTED"
    ) {
      await tx.instagramAutomationRun.update({
        where: { id: run.id },
        data: { state: "CANCELLED" },
      });
      await activity(tx, run.id, "CANCELLED", "AUTOMATION_CHANGED");
      return false;
    }
    return true;
  }
  async function contact(
    tx: Tx,
    accountId: string,
    recipientId: string,
    date?: Date,
    kind?: string,
  ) {
    const item = await tx.instagramContact.upsert({
      where: {
        socialAccountId_recipientId: {
          socialAccountId: accountId,
          recipientId,
        },
      },
      create: { socialAccountId: accountId, recipientId },
      update: {},
    });
    if (date) {
      await tx.instagramContact.updateMany({
        where: {
          id: item.id,
          OR: [
            { lastInteractionAt: null },
            { lastInteractionAt: { lt: date } },
          ],
        },
        data: { lastInteractionAt: date, interactionKind: kind },
      });
      return tx.instagramContact.findUniqueOrThrow({ where: { id: item.id } });
    }
    return item;
  }
  function snapshot(run: InstagramAutomationRun) {
    return automationDraftSchema.parse(run.snapshot);
  }
  async function authorized(tx: Tx, run: InstagramAutomationRun) {
    if (!run.recipientId) return false;
    const recipient = await tx.instagramContact.findUnique({
      where: {
        socialAccountId_recipientId: {
          socialAccountId: run.socialAccountId,
          recipientId: run.recipientId,
        },
      },
    });
    const initial = await tx.instagramOutbound.findFirst({
      where: { runId: run.id, kind: "PRIVATE_REPLY", status: "API_ACCEPTED" },
      select: { dispatchedAt: true },
    });
    return (
      !!recipient?.lastInteractionAt &&
      !!initial?.dispatchedAt &&
      recipient.lastInteractionAt >= initial.dispatchedAt &&
      canDeliverMessage("AUTHORIZED_CONVERSATION", {
        now: now().getTime(),
        lastEligibleInteractionAt: recipient.lastInteractionAt.getTime(),
        verifiedInteraction: recipient.interactionKind as
          | "INBOUND_MESSAGE"
          | "POSTBACK"
          | undefined,
      })
    );
  }
  async function scheduleAdvance(
    tx: Tx,
    run: InstagramAutomationRun,
    suffix: string,
    date?: Date,
  ) {
    await enqueue(tx, {
      socialAccountId: run.socialAccountId,
      runId: run.id,
      kind: "ADVANCE",
      dedupeKey: `advance:${run.id}:${suffix}`,
      availableAt: date,
    });
  }
  async function planPublic(
    tx: Tx,
    run: InstagramAutomationRun,
    text: string,
    approved = false,
  ) {
    const id = randomUUID();
    const created = await tx.instagramOutbound.createMany({
      data: {
        id,
        runId: run.id,
        kind: "PUBLIC_REPLY",
        operationKey: `${run.id}:public`,
        body: { message: text },
        fallbackApproved: approved,
      },
      skipDuplicates: true,
    });
    if (created.count) {
      await enqueue(tx, {
        socialAccountId: run.socialAccountId,
        runId: run.id,
        outboundId: id,
        kind: "DELIVER",
        dedupeKey: `deliver:${id}`,
      });
      await activity(tx, run.id, "PUBLIC_REPLY_QUEUED");
    }
  }
  async function processEvent(job: InstagramJob) {
    const event = await client.instagramWebhookEvent.findUniqueOrThrow({
        where: { id: job.eventId! },
        include: { socialAccount: true },
      }),
      data = event.data as Record<string, string>;
    let commentInfo: CommentDetails | undefined,
      mediaInfo: ReelDetails | undefined;
    if (event.kind === "COMMENT") {
      commentInfo = await transport.comment(data.commentId);
      const known = await client.instagramReel.findUnique({
        where: {
          socialAccountId_externalId: {
            socialAccountId: event.socialAccountId,
            externalId: data.mediaId,
          },
        },
      });
      mediaInfo = known
        ? {
            id: known.externalId,
            isReel: known.mediaType === "VIDEO",
            publishedAt: known.publishedAt,
          }
        : await transport.reel(data.mediaId);
    }
    await locked(job, async (tx) => {
      if (event.processedAt) {
        await finish(tx, job);
        return;
      }
      if (event.kind === "COMMENT" && commentInfo && mediaInfo) {
        if (
          settings.mode === "controlled" &&
          data.commentId !== settings.testCommentId
        ) {
          await tx.instagramWebhookEvent.update({
            where: { id: event.id },
            data: { processedAt: now() },
          });
          await finish(tx, job);
          return;
        }
        if (
          !mediaInfo.isReel ||
          commentInfo.parentId ||
          commentInfo.authorId === event.socialAccount.externalId ||
          !canDeliverMessage("PRIVATE_REPLY", {
            now: now().getTime(),
            commentCreatedAt: commentInfo.createdAt.getTime(),
          })
        ) {
          await tx.instagramWebhookEvent.update({
            where: { id: event.id },
            data: { processedAt: now() },
          });
          await finish(tx, job);
          return;
        }
        if (mediaInfo.catalogue) {
          await tx.instagramReel.upsert({
            where: {
              socialAccountId_externalId: {
                socialAccountId: event.socialAccountId,
                externalId: data.mediaId,
              },
            },
            create: {
              ...mediaInfo.catalogue,
              socialAccountId: event.socialAccountId,
              syncedAt: now(),
            },
            update: { ...mediaInfo.catalogue, syncedAt: now() },
          });
        }
        const candidates = await tx.automation.findMany({
          where: {
            workspaceId: event.socialAccount.workspaceId,
            status: "ACTIVE",
          },
          include: {
            keywords: true,
            steps: true,
            reels: true,
            executionState: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const eligible = candidates.filter(
          (item) =>
            matchingKeywords(
              commentInfo!.text,
              item.keywords.map((k) => k.value),
            ).length &&
            (item.scope !== "SPECIFIC_REELS" ||
              item.reels.some((reel) => reel.externalId === data.mediaId)) &&
            (item.scope !== "FUTURE_REELS" ||
              (item.executionState &&
                mediaInfo!.publishedAt &&
                mediaInfo!.publishedAt >= item.executionState.activatedAt)),
        );
        const selected = prioritizeEligibleAutomations(eligible)[0];
        if (selected) {
          const orderedSteps = selected.steps.toSorted(
            (a, b) => a.position - b.position,
          );
          const draft = automationDraftSchema.parse({
            name: selected.name,
            scope: selected.scope,
            reelIds: selected.reels.flatMap((r) =>
              r.instagramReelId ? [r.instagramReelId] : [],
            ),
            keywords: selected.keywords.map((k) => k.value),
            steps: orderedSteps.map(readStoredStep),
            publicReplies: readPublicReplies(
              selected.publicReplies,
              orderedSteps
                .filter((s) => s.kind === "PUBLIC_REPLY")
                .map((s) => s.text ?? ""),
            ),
          });
          if (activationIssues(draft).length)
            throw new Error("INVALID_SNAPSHOT");
          await tx.instagramAutomationState.upsert({
            where: { automationId: selected.id },
            create: { automationId: selected.id, activatedAt: now() },
            update: {},
          });
          await tx.$queryRaw`SELECT "automationId" FROM "InstagramAutomationState" WHERE "automationId"=${selected.id} FOR UPDATE`;
          const state = await tx.instagramAutomationState.findUniqueOrThrow({
            where: { automationId: selected.id },
          });
          const publicText = rotatingPublicReply(
            draft.publicReplies,
            state.publicReplyCursor,
          );
          const id = randomUUID();
          const created = await tx.instagramAutomationRun.createMany({
            data: {
              id,
              workspaceId: event.socialAccount.workspaceId,
              socialAccountId: event.socialAccountId,
              automationId: selected.id,
              automationUpdatedAt: selected.updatedAt,
              commentId: data.commentId,
              mediaId: data.mediaId,
              commentCreatedAt: commentInfo.createdAt,
              snapshot: json(draft),
              pendingTags: [],
              publicText,
            },
            skipDuplicates: true,
          });
          if (created.count) {
            if (publicText)
              await tx.instagramAutomationState.update({
                where: { automationId: selected.id },
                data: { publicReplyCursor: { increment: 1 } },
              });
            await enqueue(tx, {
              socialAccountId: event.socialAccountId,
              runId: id,
              kind: "ADVANCE",
              dedupeKey: `advance:${id}:start`,
            });
            await activity(tx, id, "COMMENT_MATCHED");
          }
        }
      } else if (event.kind === "MESSAGE") {
        const owner = await contact(
          tx,
          event.socialAccountId,
          data.senderId,
          event.occurredAt,
          "INBOUND_MESSAGE",
        );
        const run = await tx.instagramAutomationRun.findFirst({
          where: {
            socialAccountId: event.socialAccountId,
            recipientId: owner.recipientId,
            state: "WAITING_INTERACTION",
            initialStatus: "API_ACCEPTED",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (run) {
          const current = await lockRun(tx, run.id);
          if (await validRun(tx, current)) {
            await tx.instagramAutomationRun.update({
              where: { id: run.id },
              data: { state: "RUNNING" },
            });
            await activity(tx, run.id, "INBOUND_MESSAGE");
            await scheduleAdvance(tx, run, event.id);
          }
        }
      } else if (event.kind === "POSTBACK") {
        const continuation = await tx.instagramContinuation.findUnique({
          where: { tokenHash: eventHash(data.payload) },
          include: { outbound: { include: { run: true } } },
        });
        if (
          continuation &&
          !continuation.usedAt &&
          continuation.expiresAt > now() &&
          continuation.recipientId === data.senderId &&
          continuation.outbound.status === "API_ACCEPTED" &&
          continuation.outbound.run.socialAccountId === event.socialAccountId
        ) {
          const run = await lockRun(tx, continuation.outbound.runId);
          if (
            run.state === "WAITING_POSTBACK" &&
            run.pendingPath === continuation.outboundId &&
            (await validRun(tx, run))
          ) {
            const consumed = await tx.instagramContinuation.updateMany({
              where: { id: continuation.id, usedAt: null },
              data: { usedAt: now() },
            });
            if (consumed.count) {
              await tx.instagramContinuation.updateMany({
                where: { outboundId: continuation.outboundId, usedAt: null },
                data: { usedAt: now() },
              });
              await contact(
                tx,
                event.socialAccountId,
                data.senderId,
                event.occurredAt,
                "POSTBACK",
              );
              await tx.instagramAutomationRun.update({
                where: { id: run.id },
                data: {
                  state: "RUNNING",
                  pendingMessage: json(
                    messageDraftSchema.parse(continuation.message),
                  ),
                  pendingPath: `branch:${continuation.id}`,
                },
              });
              await activity(tx, run.id, "POSTBACK_ACCEPTED");
              await scheduleAdvance(tx, run, event.id);
            }
          }
        }
      } else if (event.kind === "SEEN") {
        const sent = await tx.instagramOutbound.findFirst({
          where: {
            remoteId: data.mid,
            recipientId: data.senderId,
            status: "API_ACCEPTED",
            run: { socialAccountId: event.socialAccountId },
          },
        });
        if (sent) await activity(tx, sent.runId, "MESSAGE_SEEN");
      }
      await tx.instagramWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: now() },
      });
      await finish(tx, job);
    });
  }
  async function planMessage(
    tx: Tx,
    run: InstagramAutomationRun,
    message: MessageDraft,
    path: string,
    initial: boolean,
  ) {
    if (messageIssues(message, path, initial).length)
      throw new Error("INVALID_MESSAGE");
    const id = randomUUID(),
      buttons: Record<string, string>[] = [],
      tokens: { payload: string; message: MessageDraft }[] = [];
    for (const button of message.buttons) {
      if (button.action === "OPEN_URL")
        buttons.push({
          type: "web_url",
          url: button.url.trim(),
          title: button.label,
        });
      else {
        const payload = `pulso:${randomBytes(32).toString("base64url")}`;
        tokens.push({ payload, message: button.nextMessage! });
        buttons.push({ type: "postback", payload, title: button.label });
      }
    }
    const body = {
      recipient: initial
        ? { comment_id: run.commentId }
        : { id: run.recipientId },
      message: buttons.length
        ? {
            attachment: {
              type: "template",
              payload: { template_type: "button", text: message.text, buttons },
            },
          }
        : { text: message.text },
    };
    const created = await tx.instagramOutbound.createMany({
      data: {
        id,
        runId: run.id,
        operationKey: `${run.id}:${path}`,
        kind: initial ? "PRIVATE_REPLY" : "DM",
        body: json(body),
      },
      skipDuplicates: true,
    });
    if (created.count) {
      if (tokens.length)
        await tx.instagramContinuation.createMany({
          data: tokens.map((token) => ({
            tokenHash: eventHash(token.payload),
            outboundId: id,
            recipientId: run.recipientId!,
            message: json(token.message),
            expiresAt: new Date(
              now().getTime() + conversationPolicy.messagingWindowMs,
            ),
          })),
        });
      await enqueue(tx, {
        socialAccountId: run.socialAccountId,
        runId: run.id,
        outboundId: id,
        kind: "DELIVER",
        dedupeKey: `deliver:${id}`,
      });
      await activity(
        tx,
        run.id,
        "MESSAGE_QUEUED",
        initial ? "PRIVATE_REPLY" : "DM",
      );
    }
  }
  async function advance(job: InstagramJob) {
    await locked(job, async (tx) => {
      let run = await lockRun(tx, job.runId!);
      if (!(await validRun(tx, run)) || run.state === "WAITING_POSTBACK") {
        await finish(tx, job);
        return;
      }
      if (run.resumeAt && run.resumeAt > now()) {
        await scheduleAdvance(
          tx,
          run,
          `resume:${run.resumeAt.getTime()}`,
          run.resumeAt,
        );
        await finish(tx, job);
        return;
      }
      if (run.resumeAt) {
        await tx.instagramAutomationRun.update({
          where: { id: run.id },
          data: { resumeAt: null },
        });
        run = await lockRun(tx, run.id);
      }
      const draft = snapshot(run);
      const messageAllowed = async (initial: boolean) => {
        if (initial)
          return canDeliverMessage("PRIVATE_REPLY", {
            now: now().getTime(),
            commentCreatedAt: run.commentCreatedAt.getTime(),
            privateReplyAlreadySent: run.initialStatus !== "PENDING",
          });
        return authorized(tx, run);
      };
      if (run.pendingMessage) {
        if (await messageAllowed(false))
          await planMessage(
            tx,
            run,
            messageDraftSchema.parse(run.pendingMessage),
            run.pendingPath!,
            false,
          );
        else {
          await tx.instagramAutomationRun.update({
            where: { id: run.id },
            data: { state: "WAITING_INTERACTION" },
          });
          await activity(tx, run.id, "WAITING_INTERACTION");
        }
        await finish(tx, job);
        return;
      }
      while (run.cursor < draft.steps.length) {
        const step = draft.steps[run.cursor];
        if (step.kind === "DELAY") {
          const cursor = run.cursor,
            resumeAt = new Date(now().getTime() + step.delaySeconds! * 1000);
          await tx.instagramAutomationRun.update({
            where: { id: run.id },
            data: { cursor: { increment: 1 }, resumeAt },
          });
          await scheduleAdvance(tx, run, `delay:${cursor}`, resumeAt);
          await activity(tx, run.id, "DELAY_SCHEDULED");
          await finish(tx, job);
          return;
        }
        if (step.kind === "ADD_TAG") {
          const tag = await tx.tag.findFirst({
            where: { id: step.tagId!, workspaceId: run.workspaceId },
          });
          if (!tag) throw new Error("TAG_UNAVAILABLE");
          if (run.recipientId) {
            const recipient = await contact(
              tx,
              run.socialAccountId,
              run.recipientId,
            );
            await tx.instagramContactTag.createMany({
              data: { contactId: recipient.id, tagId: tag.id },
              skipDuplicates: true,
            });
          } else
            await tx.instagramAutomationRun.update({
              where: { id: run.id },
              data: {
                pendingTags: json([
                  ...new Set([...(run.pendingTags as string[]), tag.id]),
                ]),
              },
            });
          await tx.instagramAutomationRun.update({
            where: { id: run.id },
            data: { cursor: { increment: 1 } },
          });
          await activity(
            tx,
            run.id,
            run.recipientId ? "TAG_ASSIGNED" : "TAG_PENDING",
          );
          run = await lockRun(tx, run.id);
          continue;
        }
        if (step.kind === "SEND_DM" || step.kind === "BUTTONS") {
          const initial = run.initialStatus === "PENDING";
          if (await messageAllowed(initial))
            await planMessage(tx, run, step, `step:${run.cursor}`, initial);
          else {
            await tx.instagramAutomationRun.update({
              where: { id: run.id },
              data: { state: initial ? "FAILED" : "WAITING_INTERACTION" },
            });
            await activity(
              tx,
              run.id,
              initial ? "PRIVATE_REPLY_EXPIRED" : "WAITING_INTERACTION",
            );
          }
          await finish(tx, job);
          return;
        }
        throw new Error("UNSUPPORTED_STEP");
      }
      await tx.instagramAutomationRun.update({
        where: { id: run.id },
        data: { state: "COMPLETED" },
      });
      await activity(tx, run.id, "SEQUENCE_COMPLETED");
      await finish(tx, job);
    });
  }
  async function deliver(job: InstagramJob) {
    let request: {
      accountId: string;
      kind: string;
      commentId: string;
      body: Record<string, unknown>;
    } | null = null;
    await locked(job, async (tx) => {
      const sent = await tx.instagramOutbound.findUniqueOrThrow({
          where: { id: job.outboundId! },
        }),
        run = await lockRun(tx, sent.runId);
      if (sent.status !== "PLANNED") {
        await finish(tx, job);
        return;
      }
      if (
        !(await validRun(
          tx,
          run,
          sent.kind === "PUBLIC_REPLY" && sent.fallbackApproved,
        )) ||
        !allowSend(
          settings,
          run.socialAccount.externalId!,
          run.commentId,
          sent.kind === "PRIVATE_REPLY" ? undefined : run.recipientId,
        )
      ) {
        await tx.instagramOutbound.update({
          where: { id: sent.id },
          data: { status: "CANCELLED", errorCategory: "SEND_GATE" },
        });
        await tx.instagramAutomationRun.update({
          where: { id: run.id },
          data: { state: "CANCELLED" },
        });
        await activity(tx, run.id, "CANCELLED", "SEND_GATE");
        await finish(tx, job);
        return;
      }
      if (sent.kind !== "PUBLIC_REPLY") {
        const eligible =
          sent.kind === "PRIVATE_REPLY"
            ? canDeliverMessage("PRIVATE_REPLY", {
                now: now().getTime(),
                commentCreatedAt: run.commentCreatedAt.getTime(),
                privateReplyAlreadySent: run.initialStatus !== "PENDING",
              })
            : await authorized(tx, run);
        if (!eligible) {
          await tx.instagramOutbound.update({
            where: { id: sent.id },
            data: { status: "CANCELLED", errorCategory: "WINDOW_EXPIRED" },
          });
          await tx.instagramAutomationRun.update({
            where: { id: run.id },
            data: { state: "FAILED" },
          });
          await activity(tx, run.id, "WINDOW_EXPIRED");
          await finish(tx, job);
          return;
        }
      }
      // Persistir uma reserva antes do HTTP; reinício após esse ponto não repete o envio.
      await tx.$queryRaw`SELECT "socialAccountId" FROM "InstagramWorkerState" WHERE "socialAccountId"=${run.socialAccountId} FOR UPDATE`;
      const budget = await tx.instagramWorkerState.findUniqueOrThrow({
        where: { socialAccountId: run.socialAccountId },
      });
      if (budget.nextSendAt > now()) {
        await tx.instagramJob.update({
          where: { id: job.id },
          data: {
            state: "RETRY",
            availableAt: budget.nextSendAt,
            leaseToken: null,
            leaseUntil: null,
            attempts: { decrement: 1 },
          },
        });
        return;
      }
      await tx.instagramWorkerState.update({
        where: { socialAccountId: run.socialAccountId },
        data: { nextSendAt: new Date(now().getTime() + 1000) },
      });
      await tx.instagramOutbound.update({
        where: { id: sent.id },
        data: {
          status: "DISPATCHING",
          dispatchToken: job.leaseToken,
          dispatchedAt: now(),
          attempts: { increment: 1 },
        },
      });
      request = {
        accountId: run.socialAccount.externalId!,
        kind: sent.kind,
        commentId: run.commentId,
        body: sent.body as Record<string, unknown>,
      };
    });
    if (!request) return;
    const command = request as {
      accountId: string;
      kind: string;
      commentId: string;
      body: Record<string, unknown>;
    };
    let result: SendOutcome;
    try {
      result = await transport.send(
        command.accountId,
        command.kind,
        command.commentId,
        command.body,
      );
    } catch {
      result = { kind: "UNKNOWN", category: "NETWORK_UNCONFIRMED" };
    }
    if (result.kind === "API_ACCEPTED" && command.kind !== "PUBLIC_REPLY") {
      const expected =
        command.kind === "PRIVATE_REPLY"
          ? settings.mode === "controlled"
            ? settings.testRecipientId
            : null
          : (command.body.recipient as { id: string }).id;
      if (
        !graphId(result.recipientId) ||
        (expected && result.recipientId !== expected)
      )
        result = { kind: "UNKNOWN", category: "RECEIPT_RECIPIENT_MISMATCH" };
    }
    await locked(job, async (tx) => {
      const sent = await tx.instagramOutbound.findUniqueOrThrow({
          where: { id: job.outboundId! },
        }),
        run = await lockRun(tx, sent.runId);
      if (
        sent.dispatchToken !== job.leaseToken ||
        sent.status !== "DISPATCHING"
      ) {
        await finish(tx, job);
        return;
      }
      if (result.kind === "API_ACCEPTED") {
        await tx.instagramOutbound.update({
          where: { id: sent.id },
          data: {
            status: "API_ACCEPTED",
            remoteId: result.remoteId,
            recipientId: result.recipientId,
            acceptedAt: now(),
          },
        });
        await activity(tx, run.id, "API_ACCEPTED", sent.kind);
        if (sent.kind !== "PUBLIC_REPLY") {
          const hasContinuation =
            (await tx.instagramContinuation.count({
              where: { outboundId: sent.id },
            })) > 0;
          const branch = run.pendingMessage !== null;
          await tx.instagramAutomationRun.update({
            where: { id: run.id },
            data: {
              initialStatus:
                sent.kind === "PRIVATE_REPLY"
                  ? "API_ACCEPTED"
                  : run.initialStatus,
              recipientId: result.recipientId ?? run.recipientId,
              cursor: branch ? run.cursor : run.cursor + 1,
              pendingMessage: Prisma.DbNull,
              pendingPath: hasContinuation ? sent.id : null,
              state: hasContinuation ? "WAITING_POSTBACK" : "RUNNING",
            },
          });
          if (sent.kind === "PRIVATE_REPLY" && result.recipientId) {
            const recipient = await contact(
              tx,
              run.socialAccountId,
              result.recipientId,
            );
            const tags = await tx.tag.findMany({
              where: {
                id: { in: run.pendingTags as string[] },
                workspaceId: run.workspaceId,
              },
            });
            if (tags.length)
              await tx.instagramContactTag.createMany({
                data: tags.map((tag) => ({
                  contactId: recipient.id,
                  tagId: tag.id,
                })),
                skipDuplicates: true,
              });
            if (tags.length) await activity(tx, run.id, "TAG_ASSIGNED");
            if (run.publicText) await planPublic(tx, run, run.publicText);
          }
          if (run.automationId)
            await tx.automation.updateMany({
              where: {
                id: run.automationId,
                status: "ACTIVE",
                updatedAt: run.automationUpdatedAt,
              },
              data: {
                lastExecutedAt: now(),
                updatedAt: run.automationUpdatedAt,
              },
            });
          if (!hasContinuation)
            await scheduleAdvance(tx, run, `accepted:${sent.id}`);
        }
        await finish(tx, job);
      } else if (result.kind === "REJECTED") {
        await tx.instagramOutbound.update({
          where: { id: sent.id },
          data: {
            status:
              result.retryAfterMs && job.attempts < 8 ? "PLANNED" : "REJECTED",
            errorCategory: result.category,
            errorCode: result.code,
            errorSubcode: result.subcode,
          },
        });
        if (result.retryAfterMs && job.attempts < 8) {
          const retryAt = new Date(
            now().getTime() +
              Math.max(result.retryAfterMs, 2 ** job.attempts * 1000),
          );
          await tx.instagramWorkerState.update({
            where: { socialAccountId: run.socialAccountId },
            data: { nextSendAt: retryAt },
          });
          await tx.instagramJob.update({
            where: { id: job.id },
            data: {
              state: "RETRY",
              availableAt: retryAt,
              lastError: result.category,
              leaseToken: null,
              leaseUntil: null,
            },
          });
          await activity(
            tx,
            run.id,
            result.category === "RATE_LIMIT"
              ? "RATE_LIMIT_RETRY"
              : "VERIFICATION_RETRY",
          );
        } else {
          if (
            result.category === "AUTHENTICATION" ||
            result.category === "PERMISSION"
          )
            await tx.socialAccount.update({
              where: { id: run.socialAccountId },
              data: {
                status:
                  result.category === "AUTHENTICATION" ? "EXPIRED" : "ERROR",
              },
            });
          if (sent.kind !== "PUBLIC_REPLY")
            await tx.instagramAutomationRun.update({
              where: { id: run.id },
              data: {
                state: "FAILED",
                initialStatus:
                  sent.kind === "PRIVATE_REPLY"
                    ? "REJECTED"
                    : run.initialStatus,
              },
            });
          await activity(tx, run.id, "SEND_REJECTED", result.category);
          const alternative = fallbackPublicReply(snapshot(run).publicReplies, {
            kind: "DEFINITIVE_FAILURE",
            identifiedError: `META_${result.code ?? 0}`,
            fallbackJustified: result.fallbackJustified,
          });
          if (sent.kind === "PRIVATE_REPLY" && alternative)
            await planPublic(tx, run, alternative, true);
          await finish(tx, job, "DEAD", result.category);
        }
      } else {
        await tx.instagramOutbound.update({
          where: { id: sent.id },
          data: { status: "UNKNOWN", errorCategory: result.category },
        });
        await tx.instagramAutomationRun.update({
          where: { id: run.id },
          data: {
            state: "REVIEW",
            initialStatus:
              sent.kind === "PRIVATE_REPLY" ? "UNKNOWN" : run.initialStatus,
          },
        });
        await activity(tx, run.id, "SEND_UNCONFIRMED", result.category);
        await finish(tx, job, "DEAD", result.category);
      }
    });
  }
  async function recoverExpired() {
    await client.$transaction(async (tx) => {
      const expired = await tx.instagramJob.findMany({
        where: {
          state: "RUNNING",
          leaseUntil: { lte: now() },
          socialAccount: { externalId: settings.accountId },
        },
        take: 50,
      });
      for (const job of expired) {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "InstagramJob" WHERE id=${job.id} AND state='RUNNING' AND "leaseUntil"<=${now()} FOR UPDATE SKIP LOCKED`;
        if (!rows.length) continue;
        const sent = job.outboundId
          ? await tx.instagramOutbound.findUnique({
              where: { id: job.outboundId },
            })
          : null;
        if (sent?.status === "DISPATCHING") {
          await tx.instagramOutbound.update({
            where: { id: sent.id },
            data: { status: "UNKNOWN", errorCategory: "WORKER_INTERRUPTED" },
          });
          await tx.instagramAutomationRun.update({
            where: { id: sent.runId },
            data: { state: "REVIEW" },
          });
          await activity(
            tx,
            sent.runId,
            "SEND_UNCONFIRMED",
            "WORKER_INTERRUPTED",
          );
          await finish(tx, job, "DEAD", "WORKER_INTERRUPTED");
        } else
          await tx.instagramJob.update({
            where: { id: job.id },
            data: {
              state: job.attempts >= 8 ? "DEAD" : "RETRY",
              leaseToken: null,
              leaseUntil: null,
              availableAt: now(),
              lastError: "LEASE_EXPIRED",
            },
          });
      }
    });
  }
  return {
    async approveFallback(
      workspaceId: string,
      outboundId: string,
      justification: string,
    ) {
      if (!justification.trim() || justification.length > 500)
        throw new ExecutionError(
          "Explique por que o erro definitivo justifica a resposta alternativa.",
          400,
        );
      if (!executionConfigured(settings))
        throw new ExecutionError(
          "Os envios permanecem bloqueados neste ambiente.",
          409,
        );
      await client.$transaction(async (tx) => {
        const sent = await tx.instagramOutbound.findFirst({
          where: { id: outboundId, run: { workspaceId } },
        });
        if (!sent) throw new ExecutionError("Registro não encontrado.", 404);
        const run = await lockRun(tx, sent.runId);
        if (
          sent.kind !== "PRIVATE_REPLY" ||
          sent.status !== "REJECTED" ||
          sent.errorCategory !== "META_REJECTED" ||
          sent.errorCode === null ||
          sent.errorCode <= 0 ||
          !(await validRun(tx, run, true))
        )
          throw new ExecutionError(
            "Esse resultado não permite uma resposta alternativa. Falha desconhecida, atraso, autenticação e limite da API não a justificam.",
            409,
          );
        const text = fallbackPublicReply(snapshot(run).publicReplies, {
          kind: "DEFINITIVE_FAILURE",
          identifiedError: `META_${sent.errorCode}_${sent.errorSubcode ?? 0}`,
          fallbackJustified: true,
        });
        if (!text)
          throw new ExecutionError(
            "A resposta alternativa está desativada ou incompleta.",
            409,
          );
        await planPublic(tx, run, text, true);
        await activity(
          tx,
          run.id,
          "FALLBACK_APPROVED",
          "OWNER_JUSTIFIED_IDENTIFIED_ERROR",
        );
      });
    },
    async heartbeat() {
      if (!executionConfigured(settings)) return false;
      const accounts = await client.socialAccount.findMany({
        where: {
          externalId: settings.accountId,
          platform: "INSTAGRAM",
          status: "CONNECTED",
        },
      });
      if (accounts.length !== 1) return false;
      await client.instagramWorkerState.upsert({
        where: { socialAccountId: accounts[0].id },
        create: {
          socialAccountId: accounts[0].id,
          heartbeatAt: now(),
          nextSendAt: now(),
          mode: settings.mode,
        },
        update: { heartbeatAt: now(), mode: settings.mode },
      });
      return true;
    },
    async processOne() {
      if (!executionConfigured(settings)) return false;
      await recoverExpired();
      const token = randomUUID(),
        leaseUntil = new Date(now().getTime() + 60000);
      const jobs = await client.$queryRaw<
        InstagramJob[]
      >`WITH candidate AS (SELECT j.id FROM "InstagramJob" j JOIN "SocialAccount" a ON a.id=j."socialAccountId" WHERE a."externalId"=${settings.accountId} AND a.platform='INSTAGRAM' AND a.status='CONNECTED' AND j.state IN ('READY','RETRY') AND j."availableAt"<=${now()} ORDER BY j."availableAt",j."createdAt",j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1) UPDATE "InstagramJob" j SET state='RUNNING',"leaseToken"=${token},"leaseUntil"=${leaseUntil},attempts=j.attempts+1 FROM candidate c WHERE j.id=c.id RETURNING j.*`;
      const job = jobs[0];
      if (!job) return false;
      try {
        if (job.kind === "EVENT") await processEvent(job);
        else if (job.kind === "ADVANCE") await advance(job);
        else if (job.kind === "DELIVER") await deliver(job);
        else throw new Error("UNKNOWN_JOB");
      } catch (error) {
        const transient =
          error instanceof InstagramReadError && error.retryable;
        await locked(job, async (tx) => {
          const sent = job.outboundId
            ? await tx.instagramOutbound.findUnique({
                where: { id: job.outboundId },
              })
            : null;
          if (sent?.status === "DISPATCHING") {
            await tx.instagramOutbound.update({
              where: { id: sent.id },
              data: { status: "UNKNOWN", errorCategory: "WORKER_ERROR" },
            });
            await tx.instagramAutomationRun.update({
              where: { id: sent.runId },
              data: { state: "REVIEW" },
            });
            await activity(tx, sent.runId, "SEND_UNCONFIRMED", "WORKER_ERROR");
            await finish(tx, job, "DEAD", "WORKER_ERROR");
          } else if (transient && job.attempts < 8)
            await tx.instagramJob.update({
              where: { id: job.id },
              data: {
                state: "RETRY",
                availableAt: new Date(
                  now().getTime() + Math.min(2 ** job.attempts * 1000, 300000),
                ),
                leaseToken: null,
                leaseUntil: null,
                lastError: "READ_UNAVAILABLE",
              },
            });
          else {
            const category =
              error instanceof InstagramReadError
                ? error.category
                : "PROCESSING_ERROR";
            if (category === "AUTHENTICATION" || category === "PERMISSION")
              await tx.socialAccount.update({
                where: { id: job.socialAccountId },
                data: {
                  status: category === "AUTHENTICATION" ? "EXPIRED" : "ERROR",
                },
              });
            if (job.runId) {
              await tx.instagramAutomationRun.update({
                where: { id: job.runId },
                data: { state: "FAILED" },
              });
              await activity(tx, job.runId, "EXECUTION_FAILED", category);
            }
            await finish(tx, job, "DEAD", category);
          }
        });
      }
      return true;
    },
  };
}
