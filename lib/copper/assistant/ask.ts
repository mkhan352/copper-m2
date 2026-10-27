"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const APOLOGY = "Sorry, I couldn't put an answer together. Please try again.";

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = { steps: [], reply: "", status: "working" };

  // Each update is a fresh copy, so the panel (and the tests) can hold on to
  // earlier ones without them changing underneath.
  const snapshot = (): Progress => structuredClone(progress);
  const toolStep = (id: string) =>
    progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );

  async function run() {
    try {
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        request.useTools
          ? {
              instructions: COPPER_INSTRUCTIONS,
              messages: request.messages,
              tools: copperTools,
              stopWhen: stepCountIs(MAX_STEPS),
              providerOptions: THOUGHT_SUMMARIES,
            }
          : {
              messages: request.messages,
              providerOptions: THOUGHT_SUMMARIES,
            },
      );

      for await (const part of result.fullStream) {
        if (part.type === "reasoning-delta") {
          const last = progress.steps.at(-1);
          if (last?.type === "thinking") last.text += part.text;
          else progress.steps.push({ type: "thinking", text: part.text });
        } else if (part.type === "tool-input-start") {
          // The model has named the tool; its input isn't known yet.
          progress.steps.push({
            type: "tool",
            id: part.id,
            name: part.toolName,
            state: "calling",
          });
        } else if (part.type === "tool-call") {
          let step = toolStep(part.toolCallId);
          if (!step) {
            step = {
              type: "tool",
              id: part.toolCallId,
              name: part.toolName,
              state: "calling",
            };
            progress.steps.push(step);
          }
          step.input = part.input;
        } else if (part.type === "tool-result") {
          const step = toolStep(part.toolCallId);
          if (step) {
            step.output = part.output;
            step.state = "done";
          }
        } else if (part.type === "tool-error") {
          const step = toolStep(part.toolCallId);
          if (step) {
            step.output =
              part.error instanceof Error
                ? part.error.message
                : String(part.error);
            step.state = "error";
          }
        } else if (part.type === "text-delta") {
          progress.reply += part.text;
        } else if (part.type === "error") {
          throw part.error;
        } else {
          continue;
        }
        update(snapshot());
      }
      progress.status = "done";
    } catch {
      progress.status = "error";
    }
    // Only an empty reply gets the apology; a real one is never added to.
    if (!progress.reply) progress.reply = APOLOGY;
    done(snapshot());
  }

  void run();
  return { progress: live };
}
