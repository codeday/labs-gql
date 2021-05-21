import {
  Track, MentorStatus, StudentStatus, RejectionReason, TagType,
} from '@prisma/client';
import { registerEnumType } from 'type-graphql';

registerEnumType(Track, { name: 'Track' });
registerEnumType(MentorStatus, { name: 'MentorStatus' });
registerEnumType(StudentStatus, { name: 'StudentStatus' });
registerEnumType(RejectionReason, { name: 'RejectionReason' });
registerEnumType(TagType, { name: 'TagType' });

export {
  Track, MentorStatus, StudentStatus, RejectionReason, TagType,
};
