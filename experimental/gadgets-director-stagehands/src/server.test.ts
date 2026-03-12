import { describe, expect, it, vi } from "vitest";
import { getDirectorSystemPrompt } from "./prompts";

vi.mock("@cloudflare/ai-chat", () => ({
  AIChatAgent: class {}
}));

vi.mock("agents", () => ({
  Agent: class {},
  callable: () => {
    return <T>(value: T) => value;
  },
  routeAgentRequest: vi.fn()
}));

vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(),
  generateText: vi.fn(),
  stepCountIs: vi.fn(),
  streamText: vi.fn(),
  tool: vi.fn()
}));

vi.mock("workers-ai-provider", () => ({
  createWorkersAI: vi.fn()
}));

const serverModulePromise = import("./server");

describe("director and stagehands server contract", () => {
  it("builds stable helper ids from helper names and group ids", async () => {
    const { makeHelperId } = await serverModulePromise;

    expect(makeHelperId("Research Lead", 0, "group-123")).toBe(
      "research-lead-group-123-1"
    );
    expect(makeHelperId("!!!", 1, "group-123")).toBe("helper-group-123-2");
  });

  it("returns structured runSubagents results for rendering", async () => {
    const { buildRunSubagentsResult } = await serverModulePromise;

    expect(
      buildRunSubagentsResult({
        sharedContext: "Compare implementation options",
        helpers: [
          {
            helperId: "research-group-123-1",
            name: "Research",
            instructions: "Find relevant facts",
            task: "List the strongest constraints",
            response: "Constraint A"
          },
          {
            helperId: "delivery-group-123-2",
            name: "Delivery",
            instructions: "Focus on sequencing",
            task: "Suggest the rollout plan",
            response: "Start with a narrow slice"
          }
        ]
      })
    ).toEqual({
      sharedContext: "Compare implementation options",
      helpers: [
        {
          helperId: "research-group-123-1",
          name: "Research",
          instructions: "Find relevant facts",
          task: "List the strongest constraints",
          response: "Constraint A"
        },
        {
          helperId: "delivery-group-123-2",
          name: "Delivery",
          instructions: "Focus on sequencing",
          task: "Suggest the rollout plan",
          response: "Start with a narrow slice"
        }
      ]
    });
  });

  it("keeps the director prompt and tool description explicit about runSubagents", async () => {
    const { runSubagentsToolDescription } = await serverModulePromise;
    const prompt = getDirectorSystemPrompt();

    expect(prompt).toContain("runSubagents");
    expect(prompt).toContain("Use the runSubagents tool");
    expect(prompt).toContain("when the user's request would benefit");
    expect(runSubagentsToolDescription).toContain(
      "Spawn focused stagehand subagents"
    );
    expect(runSubagentsToolDescription).toContain(
      "return them to the director"
    );
    expect(prompt).not.toContain("technical");
    expect(prompt).not.toContain("business");
    expect(prompt).not.toContain("skeptic");
  });
});
