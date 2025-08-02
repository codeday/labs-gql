import { Project } from "@prisma/client";
import { SupportTicketType } from "../enums";
import Container from "typedi";
import { LinearClient } from "@linear/sdk";
import config from "../config";
import { searchLabel } from "./searchLabel";

export async function hasExistingIssue(
    type: SupportTicketType,
    project: Project,
): Promise<boolean> {
    const linear = Container.get(LinearClient);
    if (type === SupportTicketType.Other) return false;
    const issues = await linear.issues({
        filter: {
            team: { id: { eq: config.linear.teamId } },
            description: { contains: searchLabel(type, project) },
            state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } }
        }
    });

    return issues.nodes.length > 0;
}