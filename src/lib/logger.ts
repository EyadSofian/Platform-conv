type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

type ErrorHook = (
  error: unknown,
  context?: LogFields,
) => void | Promise<void>;

const externalHooks: ErrorHook[] = [];

export function registerErrorHook(hook: ErrorHook) {
  externalHooks.push(hook);
}

function emit(level: LogLevel, message: string, fields?: LogFields) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(fields ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === "error" || level === "warn") {
    console.error(out);
  } else {
    console.log(out);
  }
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, error?: unknown, fields?: LogFields) => {
    const errorFields =
      error instanceof Error
        ? { error: error.message, stack: error.stack, ...fields }
        : { error, ...fields };
    emit("error", message, errorFields);
    for (const hook of externalHooks) {
      try {
        void hook(error ?? new Error(message), errorFields);
      } catch {
        /* never let monitoring throw */
      }
    }
  },
};

export type AuditEvent =
  | "conversation.takeover"
  | "conversation.resume"
  | "conversation.close"
  | "conversation.assign"
  | "message.sent"
  | "botpress.test"
  | "user.signin";

export function recordAudit(
  event: AuditEvent,
  actorId: string | null,
  fields?: LogFields,
) {
  emit("info", `audit.${event}`, {
    audit: true,
    event,
    actorId,
    ...(fields ?? {}),
  });
}
