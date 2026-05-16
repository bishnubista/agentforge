type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export type LogEvent = {
  timestamp: string;
  level: LogLevel;
  message: string;
  scope?: string;
  fields?: LogFields;
};

export type LoggerTransport = {
  log(event: LogEvent): void | Promise<void>;
};

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
};

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const SENSITIVE_FIELD = /(authorization|api[-_]?key|token|secret|password|cookie|set-cookie)/i;
const REDACTED = "[redacted]";
const MAX_DEPTH = 5;

let activeTransport: LoggerTransport = {
  log(event) {
    const line = JSON.stringify(redactValue(event));

    if (event.level === "error") {
      console.error(line);
    } else if (event.level === "warn") {
      console.warn(line);
    } else if (event.level === "debug") {
      console.debug(line);
    } else {
      console.info(line);
    }
  }
};

export function setLoggerTransport(transport: LoggerTransport) {
  activeTransport = transport;
}

export function createLogger(scope: string, baseFields: LogFields = {}): Logger {
  function write(level: LogLevel, message: string, fields: LogFields = {}) {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[getConfiguredLogLevel()]) {
      return;
    }

    void activeTransport.log({
      timestamp: new Date().toISOString(),
      level,
      message,
      scope,
      fields: {
        ...baseFields,
        ...fields
      }
    });
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child(fields) {
      return createLogger(scope, {
        ...baseFields,
        ...fields
      });
    }
  };
}

export const logger = createLogger("agentforge");

function getConfiguredLogLevel(): LogLevel {
  const env = typeof process === "undefined" ? undefined : process.env;
  const value = env?.LOG_LEVEL?.toLowerCase();
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return env?.NODE_ENV === "production" ? "info" : "debug";
}

function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (value == null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => [
      key,
      SENSITIVE_FIELD.test(key) ? REDACTED : redactValue(fieldValue, depth + 1, seen)
    ])
  );
}
