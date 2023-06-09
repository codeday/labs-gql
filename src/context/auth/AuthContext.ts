import { verify } from 'jsonwebtoken';
import config from '../../config';
import { JwtToken, AuthByTarget, AuthRole } from './JwtToken';
import { PersonType } from '../../enums';

export class AuthContext {
  private token?: JwtToken;

  private tokenString?: string;

  constructor(token?: string) {
    if (!token) return;
    this.tokenString = token;

    this.token = <JwtToken> verify(token, config.auth.secret, { audience: config.auth.audience });
    this.validate();
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  validate(): void {
    if (this.isAdmin && (this.username || this.id)) throw Error('Admin tokens may not specify a username or id.');
    if (!this.eventId) {
      throw Error('Tokens must specify event id.');
    }
    if ((this.isApplicant || this.isManager || this.isReviewer) && this.id) {
      throw Error('Non-participant tokens may only specify username, not id.');
    }
    if (this.username && this.id) throw Error('Token may not specify both username and id.');
    if ((this.target === AuthByTarget.USERNAME && !this.username) || (this.target === AuthByTarget.ID && !this.id)) {
      throw Error('Auth target (username/id) does not match provided information.');
    }
    if (this.isApplicantStudent && !this.username) throw Error('Student applicant tokens require username.');
    if ((this.isMentor || this.isStudent) && !(this.id || this.username)) {
      throw Error('Mentor/student tokens require username or id.');
    }
  }

  get isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  get type(): AuthRole | undefined {
    return this.token?.typ;
  }

  get personType(): PersonType | null {
    if (this.type === AuthRole.MENTOR) return PersonType.MENTOR;
    if (this.type === AuthRole.STUDENT) return PersonType.STUDENT;
    return null;
  }

  get isAdmin(): boolean {
    return this.type === AuthRole.ADMIN;
  }

  get isManager(): boolean {
    return this.type === AuthRole.MANAGER;
  }

  get isReviewer(): boolean {
    return this.type === AuthRole.REVIEWER;
  }

  get isMentor(): boolean {
    return this.type === AuthRole.MENTOR;
  }

  get isStudent(): boolean {
    return this.type === AuthRole.STUDENT;
  }

  get isApplicantMentor(): boolean {
    return this.type === AuthRole.APPLICANT_MENTOR;
  }

  get isApplicantStudent(): boolean {
    return this.type === AuthRole.APPLICANT_STUDENT;
  }

  get isApplicant(): boolean {
    return this.isApplicantMentor || this.isApplicantStudent;
  }

  get isPartner(): boolean {
    return this.type === AuthRole.PARTNER;
  }

  get partnerCode(): string | undefined {
    return this.token?.pc;
  }

  get eventId(): string | undefined {
    return this.token?.evt;
  }

  get target(): AuthByTarget | undefined {
    return this.token?.tgt;
  }

  get username(): string | undefined {
    if (this.target === AuthByTarget.USERNAME) return this.token?.sid;
    return undefined;
  }

  get id(): string | undefined {
    if (this.target === AuthByTarget.ID) return this.token?.sid;
    return undefined;
  }

  compareEditingTarget(other: { username?: string | null, id?: string | null }): boolean {
    if (this.target === AuthByTarget.USERNAME) return other.username === this.target;
    if (this.target === AuthByTarget.ID) return other.id === this.target;
    return false;
  }

  toWhere(): { username_eventId: { username: string, eventId: string } } | { id: string } {
    const { username, id, eventId } = this;
    if (!eventId) throw new Error('Token did not include event id.');
    if (username) return { username_eventId: { username, eventId } };
    if (id) return { id };
    throw new Error('Token did not include username or id.');
  }

  toWhereMany(): { username: string, eventId: string } | { id: string } {
    const { username, id, eventId } = this;
    if (!eventId) throw new Error('Token did not include event id.');
    if (username) return { username, eventId };
    if (id) return { id };
    throw new Error('Token did not include username or id.');
  }
}
