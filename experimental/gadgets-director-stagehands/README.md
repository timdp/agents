# Director and Stagehands

A small experiment that shows a director using `runSubagents` to create
focused stagehand agents at runtime, then folding their responses back into one
chat answer.

## How It Works

```text
DirectorAgent (extends AIChatAgent)
  │
  │  user prompt
  ▼
  runSubagents tool
  │
  ├──▶ this.subAgent(StagehandAgent, helperId) ──▶ focused stagehand output
  ├──▶ this.subAgent(StagehandAgent, helperId) ──▶ focused stagehand output
  └──▶ this.subAgent(StagehandAgent, helperId) ──▶ focused stagehand output
                                                  │
                                            synthesize()
                                                  │
                                            Final response
```

The director decides at runtime whether a prompt needs stagehand subagents at
all, and if so, how many to create and what each stagehand should do.

## Key Pattern

```ts
export class DirectorAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: getDirectorSystemPrompt(),
      tools: {
        runSubagents: tool({
          inputSchema: runSubagentsInputSchema,
          execute: async (input) => this.runSubagents(input)
        })
      }
    });

    return result.toUIMessageStreamResponse();
  }
}
```

`runSubagents` fans out to generic `StagehandAgent` facets, collects their
responses, and returns structured stagehand output for the director to
synthesize into a final answer.

## Quick Start

```bash
npm install
cd experimental/gadgets-director-stagehands
npm start
```

This runs the Vite/Wrangler app locally with the Workers AI binding from
`wrangler.jsonc`.

## Try It

- "Compare two rollout plans and distribute the work."
- "Review this feature request from multiple angles."
- "Propose a five-course fusion menu where every course is from a different cuisine. Distribute the work."

The client stays minimal: one chat column, one explainer card, and inline
rendering for `tool-runSubagents` with a generic fallback for any other tool
parts.

## Related

- [gadgets-subagents](../gadgets-subagents) — static multi-perspective fan-out with sub-agents
- [gadgets-gatekeeper](../gadgets-gatekeeper) — approval queue enforced through a sub-agent boundary
- [design/rfc-sub-agents.md](../../design/rfc-sub-agents.md) — RFC for the sub-agent API
