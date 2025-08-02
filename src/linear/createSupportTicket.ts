import Container from "typedi";
import { SupportTicketType } from "../enums";
import { LinearClient } from "@linear/sdk";
import { hasExistingIssue } from "./hasExistingIssue";
import { Mentor, Project, Student, Event } from "@prisma/client";
import config from "../config";
import { supportTicketTypeToTitle } from "./supportTicketTypeToTitle";
import { fullName } from "../utils";
import { searchLabel } from "./searchLabel";

export async function createSupportTicket(
    type: SupportTicketType,
    project: Project & {  event: Event | null, mentors: Mentor[], students: Student[] },
    description?: string,
    reportedBy?: Student | Mentor | string,
) {
    const linear = Container.get(LinearClient);
    if (await hasExistingIssue(type, project)) {
        throw new Error(`There is already an open support ticket for that.`);
    }

    const lines = [
        `[${searchLabel(type, project)}]`,
        ...(project.event ? [`Session: ${project.event.name}`] : []),
        `Mentors: ${project.mentors.map(fullName).join(', ')}`,
        `Students: ${project.students.map(fullName).join(', ')}`,
        ...(project.slackChannelId ? [`Slack Link: https://codedayorg.slack.com/archives/${project.slackChannelId}`] : []),
        ...(reportedBy ? [`Reported by: ${typeof reportedBy === 'string' ? reportedBy : fullName(reportedBy)}`] : []),
        ...(description ? [`\n## Description: ${description}`] : []),
        `\n## Project Description\n${project.issueUrl}\n${project.description}`,
    ];

    await linear.createIssue({
      priority: 2,
      labelIds: [config.linear.problemLabelId],
      teamId: config.linear.teamId,
      title: `${supportTicketTypeToTitle(type)} for ${project.mentors.map(fullName).join(', ')}`,
      description: lines.join(`\n`),
    });
}