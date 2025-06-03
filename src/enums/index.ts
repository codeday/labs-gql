import {
  Track,
  MentorStatus,
  StudentStatus,
  ProjectStatus,
  RejectionReason,
  TagType,
  PersonType,
  PrStatus,
  FileTypeType,
  FileTypeGenerationCondition,
  FileTypeGenerationTarget,
} from '@prisma/client';
import { registerEnumType } from 'type-graphql';

enum SupportTicketType {
  IssueSolved = 'IssueSolved',
  IssueCantReplicate = 'IssueCantReplicate',
  MaintainerUnsupportive = 'MaintainerUnsupportive',
  MentorUnresponsive = 'MentorUnresponsive',
  Other = 'Other',
}
registerEnumType(SupportTicketType, { name: 'SupportTicketType' });

registerEnumType(FileTypeType, { name: 'FileTypeType' });
registerEnumType(FileTypeGenerationCondition, { name: 'FileTypeGenerationCondition' });
registerEnumType(FileTypeGenerationTarget, { name: 'FileTypeGenerationTarget' });

registerEnumType(Track, { name: 'Track' });
registerEnumType(MentorStatus, { name: 'MentorStatus' });
registerEnumType(StudentStatus, { name: 'StudentStatus' });
registerEnumType(ProjectStatus, { name: 'ProjectStatus' });
registerEnumType(RejectionReason, { name: 'RejectionReason' });
registerEnumType(TagType, { name: 'TagType' });
registerEnumType(PersonType, { name: 'PersonType' });
registerEnumType(PrStatus, { name: 'PrStatus' });

export {
  Track,
  MentorStatus,
  StudentStatus,
  ProjectStatus,
  RejectionReason,
  TagType,
  PersonType,
  PrStatus,
  SupportTicketType,
  FileTypeType,
  FileTypeGenerationCondition,
  FileTypeGenerationTarget,
};
