import { verify } from 'jsonwebtoken';
import config from '../../config';
import { JwtToken, AuthByTarget, AuthRole } from './JwtToken';

export class AuthContext {
  private token?: JwtToken;

  private tokenString?: string;

  constructor(token?: string) {
    if (!token) return;
    this.tokenString = token;

    this.token = <JwtToken> verify(token, config.auth.secret, { audience: config.auth.audience });
  }

  get isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  get type(): AuthRole | undefined {
    return this.token?.typ;
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

  toWhere(): { username: string } | { id: string } {
    const { username, id } = this;
    if (username) return { username };
    if (id) return { id };
    throw new Error('Not logged in.');
  }
}
