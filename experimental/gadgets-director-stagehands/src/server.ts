import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  generateText,
  stepCountIs,
  streamText,
  tool
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { getDirectorSystemPrompt } from "./prompts";

const helperSpecSchema = z.object({
  name: z.string().min(1).max(60),
  instructions: z.string().min(1).max(800),
  task: z.string().min(1).max(2000)
});

const runSubagentsInputSchema = z.object({
  sharedContext: z.string().max(4000).optional(),
  helpers: z.array(helperSpecSchema).min(1).max(4)
});

export type HelperSpec = z.infer<typeof helperSpecSchema>;
export type RunSubagentsInput = z.infer<typeof runSubagentsInputSchema>;

export type HelperResult = {
  helperId: string;
  name: string;
  instructions: string;
  task: string;
  response: string;
};

export type RunSubagentsResult = {
  sharedContext: string | null;
  helpers: HelperResult[];
};

export const runSubagentsToolDescription =
  "Spawn focused stagehand subagents at runtime, collect their outputs, and " +
  "return them to the director for synthesis.";

export function makeHelperId(
  name: string,
  index: number,
  groupId: string
): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return `${slug || "helper"}-${groupId}-${index + 1}`;
}

export function buildRunSubagentsResult(input: {
  sharedContext?: string | null;
  helpers: HelperResult[];
}): RunSubagentsResult {
  return {
    sharedContext: input.sharedContext ?? null,
    helpers: input.helpers
  };
}

export class StagehandAgent extends Agent<Env> {
  @callable()
  async runTask({
    name,
    instructions,
    task,
    sharedContext
  }: HelperSpec & { sharedContext?: string }): Promise<string> {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = await generateText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system:
        `You are ${name}, a focused stagehand agent working in your own ` +
        `isolated subagent context.\n\n${instructions}\n\n` +
        "Produce only the contribution for your assigned task. Be concrete, " +
        "useful, and concise. Do not mention orchestration or other stagehands.",
      prompt: [
        `Assigned task:\n${task}`,
        sharedContext ? `Shared context:\n${sharedContext}` : null
      ]
        .filter(Boolean)
        .join("\n\n")
    });

    return result.text;
  }
}

export class DirectorAgent extends AIChatAgent<Env> {
  private async runSubagents(
    input: RunSubagentsInput
  ): Promise<RunSubagentsResult> {
    const groupId = crypto.randomUUID();

    const helpers = await Promise.all(
      input.helpers.map(async (helper, index) => {
        const helperId = makeHelperId(helper.name, index, groupId);
        const agent = await this.subAgent(StagehandAgent, helperId);
        const response = await agent.runTask({
          ...helper,
          sharedContext: input.sharedContext
        });

        return {
          helperId,
          name: helper.name,
          instructions: helper.instructions,
          task: helper.task,
          response
        };
      })
    );

    return buildRunSubagentsResult({
      sharedContext: input.sharedContext,
      helpers
    });
  }

  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const agent = this;

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: getDirectorSystemPrompt(),
      messages: await convertToModelMessages(this.messages),
      tools: {
        runSubagents: tool({
          description: runSubagentsToolDescription,
          inputSchema: runSubagentsInputSchema,
          execute: async (input) => agent.runSubagents(input)
        })
      },
      stopWhen: stepCountIs(4)
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
