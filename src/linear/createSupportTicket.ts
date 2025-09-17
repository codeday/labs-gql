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
    students?: Student[] | null,
    description?: string | null,
    reportedBy?: Student | Mentor | string | null,
    preventingProgress?: boolean,
) {
    const linear = Container.get(LinearClient);
    if (await hasExistingIssue(type, project)) {
        throw new Error(`There is already an open support ticket for that.`);
    }

    const lines = [
        `[${searchLabel(type, project)}]`,
        ...(students ? [`Students with issue: ${students.map(fullName).join(', ')}`] : []),
        ...(reportedBy ? [`Reported by: ${typeof reportedBy === 'string' ? reportedBy : fullName(reportedBy)}`] : []),
        ...(description ? [`\n## Description: ${description}`] : []),
        `\n ## Project Details`,
        ...(project.event ? [`Session: ${project.event.name}`] : []),
        ...(project.issueUrl ? [`Issue Link: ${project.issueUrl}`] : []),
        `Mentors: ${project.mentors.map(fullName).join(', ')}`,
        `Students: ${project.students.map(fullName).join(', ')}`,
        ...(project.slackChannelId ? [`Slack Link: https://codedayorg.slack.com/archives/${project.slackChannelId}`] : []),
        `\n### Description\n${project.description}`,
    ];

    await linear.createIssue({
      priority: preventingProgress ? 1 : 2,
      labelIds: [config.linear.problemLabelId],
      teamId: config.linear.teamId,
      title: `${supportTicketTypeToTitle(type)} for${students ? ` s:${students.map(fullName).join('/')}` : ''} m:${project.mentors.map(fullName).join('/')}`,
      description: lines.join(`\n`),
    });
}