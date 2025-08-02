import { Project } from "@prisma/client";
import { SupportTicketType } from "../enums";
import { createHash } from "crypto";

export function searchLabel(
    type: SupportTicketType,
    project: Project,
): string {
    return createHash('sha256')
        .update(`${project.id},${type}`)
        .digest('hex')
        .slice(0, 16);
}