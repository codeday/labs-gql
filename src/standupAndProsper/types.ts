import { EventWithStandupAndProsper } from "./StandupAndProsper";
import { Event, Project, StandupResult, StandupThread, Student } from "@prisma/client";
import { PickNonNullable } from "../utils";

export type ProjectWithStandups = PickNonNullable<Project, 'standupId' | 'id'>
  & {
    students: PickNonNullable<Student, 'slackId' | 'id'>[],
    standupThreads: PickNonNullable<StandupThread, 'id'>[],
    standupResults: PickNonNullable<StandupResult, 'threadId' | 'studentId'>[],
    event: EventWithStandupAndProsper & Pick<Event, 'id'>,
  };

export type EventWithProjectChannel = EventWithStandupAndProsper
  & { projects: PickNonNullable<Project, 'id' | 'slackChannelId' | 'standupId'>[] };
