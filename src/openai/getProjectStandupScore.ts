import { PickNonNullable } from "../utils";
import { Event, StandupResult } from "@prisma/client";
import { BINARY_CLASSIFICATION_CLASSES, textToCompletionPrompt } from "./format";
import { ModelType } from "./types";
import { getCompletion } from "./getCompletion";

export type StandupWithModel = StandupResult
  & { event: PickNonNullable<Event, 'standupAiModelVague' | 'standupAiModelWorkload'> };

export async function getProjectStandupScore(
  standup: StandupWithModel,
): Promise<number> {
  const vague = await getCompletion(
    BINARY_CLASSIFICATION_CLASSES,
    standup.event.standupAiModelVague,
    textToCompletionPrompt(ModelType.Vague, standup.text),
  );
  if (vague === 'yes') return 1;

  const workload = await getCompletion(
    BINARY_CLASSIFICATION_CLASSES,
    standup.event.standupAiModelWorkload,
    textToCompletionPrompt(ModelType.Workload, standup.text)
  );
  return workload === 'yes' ? 3 : 2;
}
