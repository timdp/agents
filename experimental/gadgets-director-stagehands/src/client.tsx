import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  Badge,
  Button,
  Empty,
  InputArea,
  Surface,
  Text
} from "@cloudflare/kumo";
import {
  ConnectionIndicator,
  ModeToggle,
  PoweredByAgents,
  type ConnectionStatus
} from "@cloudflare/agents-ui";
import {
  GearIcon,
  LightbulbIcon,
  PaperPlaneRightIcon,
  SparkleIcon,
  TrashIcon,
  UsersThreeIcon
} from "@phosphor-icons/react";
import { Streamdown } from "streamdown";

type RunSubagentsHelper = {
  name: string;
  task: string;
  response: string | undefined;
};

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readRunSubagentHelpers(value: unknown): RunSubagentsHelper[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const helpers: RunSubagentsHelper[] = [];

  for (const item of value) {
    const record = readRecord(item);
    if (!record) {
      continue;
    }

    const name = readString(record.name);
    const task = readString(record.task);
    if (!name || !task) {
      continue;
    }

    helpers.push({
      name,
      task,
      response: readString(record.response)
    });
  }

  return helpers;
}

function renderToolPart(part: UIMessage["parts"][number]) {
  if (!isToolUIPart(part)) {
    return null;
  }

  const toolName = getToolName(part);

  if (
    part.type === "tool-runSubagents" &&
    (part.state === "input-available" ||
      part.state === "input-streaming" ||
      part.state === "output-available")
  ) {
    const helpers =
      part.state === "output-available"
        ? readRunSubagentHelpers(readRecord(part.output)?.helpers)
        : readRunSubagentHelpers(readRecord(part.input)?.helpers);
    const isComplete = part.state === "output-available";

    return (
      <div key={part.toolCallId} className="flex justify-start">
        <Surface className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <UsersThreeIcon size={14} className="text-kumo-brand" />
            <Text size="xs" variant="secondary" bold>
              {isComplete
                ? "Stagehands responded"
                : "Running stagehand subagents"}
            </Text>
            <Badge variant="secondary">
              {helpers.length} stagehand{helpers.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="mt-3 space-y-3">
            {helpers.map((helper) => (
              <div
                key={`${part.toolCallId}-${helper.name}-${helper.task}`}
                className="rounded-xl border border-kumo-line bg-kumo-base px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <Text size="sm" bold>
                    {helper.name}
                  </Text>
                  <Text size="xs" variant="secondary">
                    {helper.response ? "Done" : "Running"}
                  </Text>
                </div>
                <div className="mt-1">
                  <Text size="xs" variant="secondary">
                    {helper.task}
                  </Text>
                </div>
                <div className="mt-2 rounded-lg bg-kumo-elevated px-2.5 py-2 text-kumo-inactive">
                  {helper.response ? (
                    <Streamdown
                      className="sd-theme text-xs leading-relaxed"
                      controls={false}
                    >
                      {helper.response}
                    </Streamdown>
                  ) : (
                    <Text size="xs" variant="secondary">
                      Waiting for response...
                    </Text>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    );
  }

  if (part.state === "output-available") {
    return (
      <div key={part.toolCallId} className="flex justify-start">
        <Surface className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 ring ring-kumo-line">
          <div className="mb-2 flex items-center gap-2">
            <GearIcon size={14} className="text-kumo-inactive" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Done</Badge>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-kumo-inactive">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        </Surface>
      </div>
    );
  }

  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <div key={part.toolCallId} className="flex justify-start">
        <Surface className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <GearIcon size={14} className="animate-spin text-kumo-inactive" />
            <Text size="xs" variant="secondary">
              Running {toolName}...
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  return null;
}

function ChatPanel() {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: "DirectorAgent",
    onOpen: useCallback(() => setConnectionStatus("connected"), []),
    onClose: useCallback(() => setConnectionStatus("disconnected"), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    )
  });

  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent
  });

  const isStreaming = status === "streaming";
  const isConnected = connectionStatus === "connected";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) {
      return;
    }

    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [input, isStreaming, sendMessage]);

  return (
    <div className="flex h-screen flex-col bg-kumo-elevated">
      <header className="border-b border-kumo-line bg-kumo-base px-5 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Text size="lg" bold>
              Director and Stagehands
            </Text>
            <Badge variant="secondary">
              <SparkleIcon size={12} weight="fill" className="mr-1" />
              Experimental
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <ConnectionIndicator status={connectionStatus} />
            <ModeToggle />
            <Button
              variant="secondary"
              icon={<TrashIcon size={16} />}
              onClick={clearHistory}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <Surface className="rounded-2xl border border-kumo-line bg-kumo-base px-4 py-4">
            <div className="flex gap-3">
              <LightbulbIcon
                size={20}
                weight="fill"
                className="mt-0.5 shrink-0 text-kumo-brand"
              />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Text size="sm" bold>
                    The director chooses its stagehands at runtime
                  </Text>
                </div>
                <Text size="sm" variant="secondary">
                  Ask for a breakdown, comparison, or parallel research task.
                  The agent can call <code>runSubagents</code>, spawn focused
                  stagehands, and stream their work inline before synthesizing
                  the final answer.
                </Text>
              </div>
            </div>
          </Surface>

          <div className="mt-5 space-y-5">
            {messages.length === 0 && (
              <Empty
                icon={<UsersThreeIcon size={32} />}
                title="Ask for delegated work"
                description='Try "Compare launch strategies for this feature" or "Break this migration into helper tasks."'
              />
            )}

            {messages.map((message, index) => {
              const isUser = message.role === "user";
              const isLastAssistant =
                message.role === "assistant" && index === messages.length - 1;
              const text = getMessageText(message);

              return (
                <div key={message.id} className="space-y-2">
                  {isUser ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-kumo-contrast px-4 py-2.5 leading-relaxed text-kumo-inverse">
                        {text}
                      </div>
                    </div>
                  ) : (
                    text && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base px-4 py-2.5 leading-relaxed text-kumo-default">
                          <div>
                            <Streamdown
                              className="sd-theme text-sm"
                              controls={false}
                            >
                              {text}
                            </Streamdown>
                            {isLastAssistant && isStreaming && (
                              <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-blink-cursor align-text-bottom bg-kumo-brand" />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {message.parts
                    .filter((part) => isToolUIPart(part))
                    .map((part) => renderToolPart(part))}
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="mx-auto max-w-3xl px-5 py-4"
        >
          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm transition-shadow focus-within:border-transparent focus-within:ring-2 focus-within:ring-kumo-ring">
            <InputArea
              value={input}
              onValueChange={setInput}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder='Try "Split this PR review into helper tasks."'
              disabled={!isConnected || isStreaming}
              rows={2}
              className="flex-1 !bg-transparent !shadow-none !outline-none !ring-0 focus:!ring-0"
            />
            <Button
              type="submit"
              variant="primary"
              shape="square"
              aria-label="Send message"
              disabled={!input.trim() || !isConnected || isStreaming}
              icon={<PaperPlaneRightIcon size={18} />}
              loading={isStreaming}
              className="mb-0.5"
            />
          </div>
        </form>
        <div className="flex justify-center pb-3">
          <PoweredByAgents />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-kumo-inactive">
          Loading...
        </div>
      }
    >
      <ChatPanel />
    </Suspense>
  );
}
