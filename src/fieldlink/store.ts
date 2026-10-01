import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

export type FieldLinkChatMessage = {
  messageId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: string;
  clientMessageId: string | null;
};

export type FieldLinkDeliveredAlert = {
  deliveryId: string;
  sourceAlertId: string;
  severity: string;
  title: string;
  message: string;
  location?: string;
  source: string;
  sentAt: string;
  recipients: number;
  acknowledged: number;
  successRatePct: number | null;
  acknowledgedClientIds: string[];
};

type PersistedState = {
  messages: FieldLinkChatMessage[];
  alerts: FieldLinkDeliveredAlert[];
};

type PresenceRow = {
  clientId: string;
  displayName: string;
  lastSeenAt: string;
};

const EMPTY_STATE: PersistedState = {
  messages: [],
  alerts: [],
};

function requiredText(
  value: unknown,
  name: string,
  maxLength: number,
) {
  const text =
    String(value ?? "")
      .trim();

  if (!text) {
    throw new Error(
      `${name}_REQUIRED`,
    );
  }

  if (
    text.length >
    maxLength
  ) {
    throw new Error(
      `${name}_TOO_LONG`,
    );
  }

  return text;
}

function optionalText(
  value: unknown,
  maxLength: number,
) {
  if (
    value == null ||
    value === ""
  ) {
    return undefined;
  }

  const text =
    String(value)
      .trim();

  return text
    .slice(
      0,
      maxLength,
    );
}

function validRoomId(
  value: unknown,
) {
  const roomId =
    requiredText(
      value,
      "ROOM_ID",
      64,
    );

  if (
    !/^[A-Za-z0-9._-]+$/
      .test(roomId)
  ) {
    throw new Error(
      "ROOM_ID_INVALID",
    );
  }

  return roomId;
}

function percentage(
  numerator: number,
  denominator: number,
) {
  if (
    denominator <= 0
  ) {
    return null;
  }

  return Number(
    (
      numerator /
      denominator *
      100
    ).toFixed(2),
  );
}

export class FieldLinkStore {
  private loaded =
    false;

  private state:
    PersistedState = {
      ...EMPTY_STATE,
      messages: [],
      alerts: [],
    };

  private readonly presence =
    new Map<
      string,
      PresenceRow
    >();

  private writeChain:
    Promise<void> =
    Promise.resolve();

  constructor(
    private readonly filePath =
      process.env
        .FIELDLINK_DATA_FILE
        ?.trim() ||
      "./data/fieldlink-state.json",

    private readonly now =
      () => new Date(),
  ) {}

  private async ensureLoaded() {
    if (
      this.loaded
    ) {
      return;
    }

    try {
      const raw =
        await readFile(
          this.filePath,
          "utf-8",
        );

      const parsed =
        JSON.parse(raw) as
          Partial<PersistedState>;

      this.state = {
        messages:
          Array.isArray(
            parsed.messages,
          )
            ? parsed.messages
            : [],

        alerts:
          Array.isArray(
            parsed.alerts,
          )
            ? parsed.alerts
            : [],
      };
    } catch (
      error
    ) {
      if (
        !(
          error &&
          typeof error ===
            "object" &&
          "code" in error &&
          error.code ===
            "ENOENT"
        )
      ) {
        throw error;
      }

      this.state = {
        messages: [],
        alerts: [],
      };
    }

    this.loaded =
      true;
  }

  private async persist() {
    const payload =
      JSON.stringify(
        this.state,
        null,
        2,
      );

    this.writeChain =
      this.writeChain.then(
        async () => {
          await mkdir(
            dirname(
              this.filePath,
            ),
            {
              recursive:
                true,
            },
          );

          const temporary =
            `${this.filePath}.` +
            `${process.pid}.tmp`;

          await writeFile(
            temporary,
            payload,
            "utf-8",
          );

          await rename(
            temporary,
            this.filePath,
          );
        },
      );

    await this.writeChain;
  }

  private purgePresence() {
    const cutoff =
      this.now()
        .getTime() -
      15_000;

    for (
      const [
        clientId,
        row,
      ] of
      this.presence
        .entries()
    ) {
      const timestamp =
        Date.parse(
          row.lastSeenAt,
        );

      if (
        !Number.isFinite(
          timestamp,
        ) ||
        timestamp <
          cutoff
      ) {
        this.presence
          .delete(
            clientId,
          );
      }
    }
  }

  registerPresence(
    input: {
      clientId: unknown;
      displayName: unknown;
    },
  ) {
    const clientId =
      requiredText(
        input.clientId,
        "CLIENT_ID",
        100,
      );

    const displayName =
      requiredText(
        input.displayName,
        "DISPLAY_NAME",
        40,
      );

    const row:
      PresenceRow = {
      clientId,
      displayName,
      lastSeenAt:
        this.now()
          .toISOString(),
    };

    this.presence.set(
      clientId,
      row,
    );

    return this.presenceSummary();
  }

  presenceSummary() {
    this.purgePresence();

    const clients =
      Array.from(
        this.presence
          .values(),
      ).sort(
        (a, b) =>
          a.displayName
            .localeCompare(
              b.displayName,
            ),
      );

    return {
      activeClients:
        clients.length,

      clients,
    };
  }

  async postMessage(
    input: {
      roomId: unknown;
      senderId: unknown;
      senderName: unknown;
      text: unknown;
      clientMessageId?: unknown;
    },
  ) {
    await this.ensureLoaded();

    const roomId =
      validRoomId(
        input.roomId,
      );

    const senderId =
      requiredText(
        input.senderId,
        "SENDER_ID",
        100,
      );

    const senderName =
      requiredText(
        input.senderName,
        "SENDER_NAME",
        40,
      );

    const text =
      requiredText(
        input.text,
        "MESSAGE",
        1000,
      );

    const clientMessageId =
      input.clientMessageId == null
        ? null
        : requiredText(
            input.clientMessageId,
            "CLIENT_MESSAGE_ID",
            120,
          );

    if (
      clientMessageId
    ) {
      const existing =
        this.state.messages
          .find(
            (row) =>
              row.senderId ===
                senderId &&
              row.clientMessageId ===
                clientMessageId,
          );

      if (
        existing
      ) {
        return existing;
      }
    }

    const message:
      FieldLinkChatMessage = {
      messageId:
        randomUUID(),

      roomId,

      senderId,

      senderName,

      text,

      sentAt:
        this.now()
          .toISOString(),

      clientMessageId,
    };

    this.state.messages
      .push(
        message,
      );

    if (
      this.state.messages
        .length >
      1000
    ) {
      this.state.messages =
        this.state.messages
          .slice(-1000);
    }

    await this.persist();

    return message;
  }

  async listMessages(
    roomIdValue: unknown,
    options: {
      after?: string | null;
      limit?: number;
    } = {},
  ) {
    await this.ensureLoaded();

    const roomId =
      validRoomId(
        roomIdValue,
      );

    const afterMs =
      options.after
        ? Date.parse(
            options.after,
          )
        : NaN;

    const limit =
      Math.max(
        1,
        Math.min(
          200,
          Math.floor(
            options.limit ??
            100,
          ),
        ),
      );

    return this.state.messages
      .filter(
        (row) =>
          row.roomId ===
            roomId,
      )
      .filter(
        (row) =>
          !Number.isFinite(
            afterMs,
          ) ||
          Date.parse(
            row.sentAt,
          ) >
            afterMs,
      )
      .slice(-limit);
  }

  async createAlert(
    input: {
      sourceAlertId: unknown;
      severity: unknown;
      title: unknown;
      message: unknown;
      location?: unknown;
      source?: unknown;
    },
  ) {
    await this.ensureLoaded();

    this.purgePresence();

    const recipients =
      this.presence.size;

    const alert:
      FieldLinkDeliveredAlert = {
      deliveryId:
        randomUUID(),

      sourceAlertId:
        requiredText(
          input.sourceAlertId,
          "SOURCE_ALERT_ID",
          120,
        ),

      severity:
        requiredText(
          input.severity,
          "SEVERITY",
          20,
        ).toUpperCase(),

      title:
        requiredText(
          input.title,
          "TITLE",
          200,
        ),

      message:
        requiredText(
          input.message,
          "ALERT_MESSAGE",
          1000,
        ),

      location:
        optionalText(
          input.location,
          200,
        ),

      source:
        optionalText(
          input.source,
          80,
        ) ??
        "FIELDLINK",

      sentAt:
        this.now()
          .toISOString(),

      recipients,

      acknowledged:
        0,

      successRatePct:
        recipients > 0
          ? 0
          : null,

      acknowledgedClientIds:
        [],
    };

    this.state.alerts
      .push(
        alert,
      );

    if (
      this.state.alerts
        .length >
      500
    ) {
      this.state.alerts =
        this.state.alerts
          .slice(-500);
    }

    await this.persist();

    return alert;
  }

  async listAlerts(
    options: {
      after?: string | null;
      limit?: number;
    } = {},
  ) {
    await this.ensureLoaded();

    const afterMs =
      options.after
        ? Date.parse(
            options.after,
          )
        : NaN;

    const limit =
      Math.max(
        1,
        Math.min(
          100,
          Math.floor(
            options.limit ??
            30,
          ),
        ),
      );

    return this.state.alerts
      .filter(
        (row) =>
          !Number.isFinite(
            afterMs,
          ) ||
          Date.parse(
            row.sentAt,
          ) >
            afterMs,
      )
      .slice(-limit);
  }

  async acknowledgeAlert(
    deliveryIdValue:
      unknown,
    input: {
      clientId: unknown;
      displayName: unknown;
    },
  ) {
    await this.ensureLoaded();

    const deliveryId =
      requiredText(
        deliveryIdValue,
        "DELIVERY_ID",
        120,
      );

    const clientId =
      requiredText(
        input.clientId,
        "CLIENT_ID",
        100,
      );

    const displayName =
      requiredText(
        input.displayName,
        "DISPLAY_NAME",
        40,
      );

    const alert =
      this.state.alerts
        .find(
          (row) =>
            row.deliveryId ===
            deliveryId,
        );

    if (
      !alert
    ) {
      return null;
    }

    this.registerPresence({
      clientId,
      displayName,
    });

    if (
      !alert
        .acknowledgedClientIds
        .includes(
          clientId,
        )
    ) {
      alert
        .acknowledgedClientIds
        .push(
          clientId,
        );
    }

    alert.acknowledged =
      alert
        .acknowledgedClientIds
        .length;

    alert.recipients =
      Math.max(
        alert.recipients,
        alert.acknowledged,
      );

    alert.successRatePct =
      percentage(
        alert.acknowledged,
        alert.recipients,
      );

    await this.persist();

    return alert;
  }

  async alertSummary() {
    await this.ensureLoaded();

    const delivered =
      this.state.alerts
        .reduce(
          (
            sum,
            alert,
          ) =>
            sum +
            alert.recipients,
          0,
        );

    const acknowledged =
      this.state.alerts
        .reduce(
          (
            sum,
            alert,
          ) =>
            sum +
            alert.acknowledged,
          0,
        );

    return {
      alerts:
        this.state.alerts
          .length,

      delivered,

      acknowledged,

      successRatePct:
        percentage(
          acknowledged,
          delivered,
        ),
    };
  }
}
