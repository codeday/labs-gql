import { SupportTicketType } from "../enums";

export function supportTicketTypeToTitle(type: SupportTicketType) {
  switch (type) {
    case SupportTicketType.IssueSolved:
      return 'Solved Issue';
    case SupportTicketType.IssueCantReplicate:
      return 'Can\'t Replicate';
    case SupportTicketType.MaintainerUnsupportive:
      return 'Maintainer Issue';
    case SupportTicketType.MentorUnresponsive:
      return 'Unresponsive Mentor';
    default:
      return 'Other';
  }
}