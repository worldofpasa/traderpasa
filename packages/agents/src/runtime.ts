import { type z } from "zod";
import type { ModelProviderAdapter, ModelCredentialRef, StructuredModelRequest, ModelUsageMetadata } from "@pasa-trader/adapters";

export interface AgentContext {
  modelAdapter: ModelProviderAdapter;
  credentialRef: ModelCredentialRef;
  loggingDepth: "METADATA" | "FULL";
  userId: string;
}

export interface AgentWorkflowStep<Input, Output> {
  readonly name: string;
  run(input: Input, context: AgentContext): Promise<Output>;
}

export interface GenerateWithRepairResult<T> {
  output: T;
  usage: ModelUsageMetadata;
  repaired: boolean;
}

export class AgentWorkflowExecutor {
  constructor(private readonly context: AgentContext) {}

  async runStep<Input, Output>(
    step: AgentWorkflowStep<Input, Output>,
    input: Input,
    contextOverride?: Partial<AgentContext>,
  ): Promise<Output> {
    const ctx = contextOverride ? { ...this.context, ...contextOverride } : this.context;
    console.warn(`[AgentWorkflowExecutor] Running step: ${step.name} (provider: ${ctx.credentialRef.provider})`);
    const output = await step.run(input, ctx);
    console.warn(`[AgentWorkflowExecutor] Completed step: ${step.name}`);
    return output;
  }
}

export async function generateWithRepairResult<T>(
  context: AgentContext,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  maxTokens?: number,
  schemaHint?: string,
): Promise<GenerateWithRepairResult<T>> {
  try {
    const payload: StructuredModelRequest<T> = {
      credentialRef: context.credentialRef,
      systemPrompt,
      userPrompt,
      outputSchema: schema,
      loggingDepth: context.loggingDepth === "FULL" ? "full" : "metadata",
      ...(schemaHint !== undefined && { schemaHint }),
    };
    if (maxTokens !== undefined) {
      payload.maxTokens = maxTokens;
    }

    const result = await context.modelAdapter.generateStructured(payload);
    return { output: result.output, usage: result.usage, repaired: false };
  } catch (err) {
    console.warn(`First model generation failed or was invalid: ${err instanceof Error ? err.message : String(err)}. Triggering safe repair...`);

    const repairSystemPrompt = `${systemPrompt}\n\nYour previous response failed schema validation. Please output corrected JSON that strictly matches the schema.`;
    const repairUserPrompt = `${userPrompt}\n\nError from previous attempt:\n${err instanceof Error ? err.message : String(err)}`;

    try {
      const payload: StructuredModelRequest<T> = {
        credentialRef: context.credentialRef,
        systemPrompt: repairSystemPrompt,
        userPrompt: repairUserPrompt,
        outputSchema: schema,
        loggingDepth: context.loggingDepth === "FULL" ? "full" : "metadata",
        ...(schemaHint !== undefined && { schemaHint }),
      };
      if (maxTokens !== undefined) {
        payload.maxTokens = maxTokens;
      }

      const repairResult = await context.modelAdapter.generateStructured(payload);
      return { output: repairResult.output, usage: repairResult.usage, repaired: true };
    } catch (repairErr) {
      throw new Error(`Model generation failed after safe repair: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`, {
        cause: repairErr,
      });
    }
  }
}

export async function generateWithRepair<T>(
  context: AgentContext,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  maxTokens?: number,
): Promise<T> {
  const result = await generateWithRepairResult(context, systemPrompt, userPrompt, schema, maxTokens);
  return result.output;
}
