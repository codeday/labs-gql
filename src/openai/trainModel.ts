import { StandupResult } from "@prisma/client";
import Container from "typedi";
import { PickNonNullable } from "../utils";
import { getTrainingExample } from "./format";
import OpenAIApi from "openai";
import { fileSync } from 'tmp';
import { unlink, writeFile } from "fs/promises";
import fs from "fs";
import { ModelType } from "./types";
import { makeDebug } from '../utils';
import { FsReadStream } from "openai/_shims";

const DEBUG = makeDebug('openai:trainModel');

/**
 * Trains a model on a list of standup examples.
 * 
 * @param modelType Is the model for vagueness or workload?
 * @param model OpenAI model ID.
 * @param examples List of new standup examples which comprises the training corpus.
 * @returns fine-tune job ID.
 */
export async function trainModel(
  modelType: ModelType,
  model: string,
  examples: PickNonNullable<StandupResult, 'text' | 'rating'>[]
): Promise<string> {
  const openAi = Container.get(OpenAIApi);
  const jsonlExamples = examples
    .map(e => JSON.stringify(getTrainingExample(modelType, e)))
    .join(`\n`) + `\n`;

  DEBUG(`Fine-tuning ${modelType} model ${model} with ${examples.length} new examples.`);

  // It seems that this has to actually be a file for the API to succeed
  const tmpFile = fileSync({ postfix: '.jsonl' }).name;
  await writeFile(tmpFile, jsonlExamples);
  const upload = await openAi.files.create({
    file: fs.createReadStream(tmpFile) as unknown as FsReadStream,
    purpose: 'fine-tune'
  });
  unlink(tmpFile);

  const result = await openAi.fineTuning.jobs.create({
    training_file: upload.id,
    model,
    suffix: modelType.toLowerCase(),
    ...(model.includes(':') ? { learning_rate_multiplier: 0.03 } : {}),
  });

  return result.id;
}

