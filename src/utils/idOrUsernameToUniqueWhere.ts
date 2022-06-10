import { AuthContext } from "../context";

export function idOrUsernameToUniqueWhere(auth: AuthContext, arg: { id?: string, username?: string }): (
  { id: string } | { username_eventId: { username: string, eventId: string } }
) {
  if (arg.id) return { id: arg.id };
  if (arg.username) return { username_eventId: { username: arg.username, eventId: auth.eventId! } };
  throw new Error('Must specify either an id, or a username and eventId from token.');
}

export function idOrUsernameOrAuthToUniqueWhere(auth: AuthContext, arg?: { id?: string, username?: string }) {
  if (!arg) return idOrUsernameToUniqueWhere(auth, { id: auth.id, username: auth.username });
  return idOrUsernameToUniqueWhere(auth, arg);
}
