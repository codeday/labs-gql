import { Event } from "@prisma/client";

export type OpenAITrainingExample = { prompt: string, completion: string };
export type OpenAILogprobs = Record<string, number>[];
export type OpenAILogitBias = Record<number, number>;
export enum ModelType {
  Vague = 'Vague',
  Workload = 'Workload',
};
export const MODEL_STORAGE_KEYS: Record<
    ModelType,
    Record<'pending' | 'final', keyof Event>
> = {
  [ModelType.Vague]: {
    pending: 'standupAiModelVaguePending',
    final: 'standupAiModelVague',
  },
  [ModelType.Workload]: {
    pending: 'standupAiModelWorkloadPending',
    final: 'standupAiModelWorkload',
  },
};