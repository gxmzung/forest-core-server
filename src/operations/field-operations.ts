import {
  randomUUID,
} from "node:crypto";

export type OperationPriority =
  | "P0"
  | "P1"
  | "P2"
  | "P3"
  | "P4";

export type SituationReportStatus =
  | "QUEUED"
  | "SENT";

export type SituationReport = {
  reportId: string;
  eventId: string;

  authorId: string;
  authorName: string;

  priority:
    OperationPriority;

  title: string;
  content: string;

  location:
    string | null;

  createdAt: string;

  status:
    SituationReportStatus;

  sentAt:
    string | null;
};

export type FieldCommand = {
  commandId: string;
  eventId: string;

  senderId: string;
  senderName: string;

  priority:
    OperationPriority;

  title: string;
  instruction: string;

  recipientIds:
    string[];

  acknowledgedClientIds:
    string[];

  createdAt: string;

  acknowledgedAt:
    Record<string, string>;
};

const PRIORITY_ORDER:
  Record<
    OperationPriority,
    number
  > = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
    P4: 4,
  };

function requiredText(
  value: unknown,
  name: string,
  maxLength = 2000,
) {
  const text =
    String(
      value ?? "",
    ).trim();

  if (!text) {
    throw new Error(
      name + "_REQUIRED",
    );
  }

  if (
    text.length >
    maxLength
  ) {
    throw new Error(
      name + "_TOO_LONG",
    );
  }

  return text;
}

function priorityOf(
  value: unknown,
): OperationPriority {
  const priority =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    priority !== "P0" &&
    priority !== "P1" &&
    priority !== "P2" &&
    priority !== "P3" &&
    priority !== "P4"
  ) {
    throw new Error(
      "PRIORITY_INVALID",
    );
  }

  return priority;
}

function uniqueIds(
  value: unknown,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "RECIPIENT_IDS_REQUIRED",
    );
  }

  const result =
    [
      ...new Set(
        value
          .map(
            (row) =>
              String(
                row ?? "",
              ).trim(),
          )
          .filter(Boolean),
      ),
    ];

  if (!result.length) {
    throw new Error(
      "RECIPIENT_IDS_REQUIRED",
    );
  }

  return result;
}

export class FieldOperationsEngine {
  private readonly reports:
    SituationReport[] = [];

  private readonly commands:
    FieldCommand[] = [];

  constructor(
    private readonly now =
      () => new Date(),
  ) {}

  reset() {
    this.reports.length = 0;
    this.commands.length = 0;
  }

  createSituationReport(
    input: {
      eventId: unknown;
      authorId: unknown;
      authorName: unknown;
      priority: unknown;
      title: unknown;
      content: unknown;
      location?: unknown;
    },
  ) {
    const report:
      SituationReport = {
        reportId:
          randomUUID(),

        eventId:
          requiredText(
            input.eventId,
            "EVENT_ID",
            120,
          ),

        authorId:
          requiredText(
            input.authorId,
            "AUTHOR_ID",
            120,
          ),

        authorName:
          requiredText(
            input.authorName,
            "AUTHOR_NAME",
            80,
          ),

        priority:
          priorityOf(
            input.priority,
          ),

        title:
          requiredText(
            input.title,
            "TITLE",
            200,
          ),

        content:
          requiredText(
            input.content,
            "CONTENT",
            4000,
          ),

        location:
          input.location == null ||
          String(
            input.location,
          ).trim() === ""
            ? null
            : String(
                input.location,
              )
                .trim()
                .slice(
                  0,
                  300,
                ),

        createdAt:
          this.now()
            .toISOString(),

        status:
          "QUEUED",

        sentAt:
          null,
      };

    this.reports.push(
      report,
    );

    return {
      ...report,
    };
  }

  listReports() {
    return this.reports
      .slice()
      .sort(
        (a, b) => {
          const priorityDiff =
            PRIORITY_ORDER[
              a.priority
            ] -
            PRIORITY_ORDER[
              b.priority
            ];

          if (
            priorityDiff !== 0
          ) {
            return priorityDiff;
          }

          return (
            Date.parse(
              a.createdAt,
            ) -
            Date.parse(
              b.createdAt,
            )
          );
        },
      )
      .map(
        (row) => ({
          ...row,
        }),
      );
  }

  pendingReports() {
    return this.reports
      .filter(
        (row) =>
          row.status ===
          "QUEUED",
      )
      .sort(
        (a, b) => {
          const priorityDiff =
            PRIORITY_ORDER[
              a.priority
            ] -
            PRIORITY_ORDER[
              b.priority
            ];

          if (
            priorityDiff !== 0
          ) {
            return priorityDiff;
          }

          return (
            Date.parse(
              a.createdAt,
            ) -
            Date.parse(
              b.createdAt,
            )
          );
        },
      )
      .map(
        (row) => ({
          ...row,
        }),
      );
  }

  markReportSent(
    reportIdValue:
      unknown,
  ) {
    const reportId =
      requiredText(
        reportIdValue,
        "REPORT_ID",
        120,
      );

    const report =
      this.reports.find(
        (row) =>
          row.reportId ===
          reportId,
      );

    if (!report) {
      return null;
    }

    if (
      report.status !==
      "SENT"
    ) {
      report.status =
        "SENT";

      report.sentAt =
        this.now()
          .toISOString();
    }

    return {
      ...report,
    };
  }

  createCommand(
    input: {
      eventId: unknown;
      senderId: unknown;
      senderName: unknown;
      priority: unknown;
      title: unknown;
      instruction: unknown;
      recipientIds: unknown;
    },
  ) {
    const command:
      FieldCommand = {
        commandId:
          randomUUID(),

        eventId:
          requiredText(
            input.eventId,
            "EVENT_ID",
            120,
          ),

        senderId:
          requiredText(
            input.senderId,
            "SENDER_ID",
            120,
          ),

        senderName:
          requiredText(
            input.senderName,
            "SENDER_NAME",
            80,
          ),

        priority:
          priorityOf(
            input.priority,
          ),

        title:
          requiredText(
            input.title,
            "TITLE",
            200,
          ),

        instruction:
          requiredText(
            input.instruction,
            "INSTRUCTION",
            4000,
          ),

        recipientIds:
          uniqueIds(
            input.recipientIds,
          ),

        acknowledgedClientIds:
          [],

        createdAt:
          this.now()
            .toISOString(),

        acknowledgedAt:
          {},
      };

    this.commands.push(
      command,
    );

    return {
      ...command,
      recipientIds:
        [...command.recipientIds],
      acknowledgedClientIds:
        [],
      acknowledgedAt:
        {},
    };
  }

  acknowledgeCommand(
    commandIdValue:
      unknown,
    clientIdValue:
      unknown,
  ) {
    const commandId =
      requiredText(
        commandIdValue,
        "COMMAND_ID",
        120,
      );

    const clientId =
      requiredText(
        clientIdValue,
        "CLIENT_ID",
        120,
      );

    const command =
      this.commands.find(
        (row) =>
          row.commandId ===
          commandId,
      );

    if (!command) {
      return null;
    }

    if (
      !command
        .recipientIds
        .includes(
          clientId,
        )
    ) {
      throw new Error(
        "CLIENT_NOT_RECIPIENT",
      );
    }

    if (
      !command
        .acknowledgedClientIds
        .includes(
          clientId,
        )
    ) {
      command
        .acknowledgedClientIds
        .push(
          clientId,
        );

      command
        .acknowledgedAt[
          clientId
        ] =
          this.now()
            .toISOString();
    }

    return this.commandStatus(
      commandId,
    );
  }

  commandStatus(
    commandIdValue:
      unknown,
  ) {
    const commandId =
      requiredText(
        commandIdValue,
        "COMMAND_ID",
        120,
      );

    const command =
      this.commands.find(
        (row) =>
          row.commandId ===
          commandId,
      );

    if (!command) {
      return null;
    }

    const missingRecipientIds =
      command
        .recipientIds
        .filter(
          (clientId) =>
            !command
              .acknowledgedClientIds
              .includes(
                clientId,
              ),
        );

    const recipients =
      command
        .recipientIds
        .length;

    const acknowledged =
      command
        .acknowledgedClientIds
        .length;

    return {
      ...command,

      recipientIds:
        [
          ...command
            .recipientIds,
        ],

      acknowledgedClientIds:
        [
          ...command
            .acknowledgedClientIds,
        ],

      acknowledgedAt: {
        ...command
          .acknowledgedAt,
      },

      missingRecipientIds,

      recipients,

      acknowledged,

      successRatePct:
        recipients === 0
          ? null
          : Number(
              (
                acknowledged /
                recipients *
                100
              ).toFixed(2),
            ),
    };
  }

  listCommands() {
    return this.commands
      .slice()
      .sort(
        (a, b) => {
          const priorityDiff =
            PRIORITY_ORDER[
              a.priority
            ] -
            PRIORITY_ORDER[
              b.priority
            ];

          if (
            priorityDiff !== 0
          ) {
            return priorityDiff;
          }

          return (
            Date.parse(
              a.createdAt,
            ) -
            Date.parse(
              b.createdAt,
            )
          );
        },
      )
      .map(
        (row) =>
          this.commandStatus(
            row.commandId,
          )!,
      );
  }
}

export const fieldOperationsEngine =
  new FieldOperationsEngine();
