import { ResolverData } from 'type-graphql';
import { AuthRole } from './JwtToken';
import { Context } from '..';

export function authChecker({ context }: ResolverData<Context>, roles: Array<AuthRole>): boolean {
  if (!context.auth || !context.auth.isAuthenticated  || context.auth.isUnspecified) return false;
  if (roles.length === 0) return true;
  // BUG(@tylermenezes): Workaround for Typescript bug with reducers
  return <boolean><unknown> roles.reduce((accum, rol): boolean => context.auth.type === rol || accum, false);
}
