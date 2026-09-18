import './_loadEnv';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sign } from 'jsonwebtoken';
import { AuthContext } from '../src/context/auth/AuthContext';
import { AuthByTarget, AuthRole } from '../src/context/auth/JwtToken';
import config from '../src/config';

function makeToken(payload: Record<string, unknown>): string {
  return sign(payload, config.auth.secret, {
    audience: config.auth.audience,
    noTimestamp: true,
  });
}

function idToken(role: AuthRole, sid: string, evt = 'evt-1'): AuthContext {
  return new AuthContext(makeToken({ typ: role, tgt: AuthByTarget.ID, sid, evt }));
}

function usernameToken(role: AuthRole, sid: string, evt = 'evt-1'): AuthContext {
  return new AuthContext(makeToken({ typ: role, tgt: AuthByTarget.USERNAME, sid, evt }));
}

test('ID-targeted self-match returns true (regression: was always false)', () => {
  const auth = idToken(AuthRole.MENTOR, 'mentor-uuid-123');
  assert.equal(auth.compareEditingTarget({ id: 'mentor-uuid-123' }), true);
});

test('ID-targeted mismatch returns false (no privilege escalation)', () => {
  const auth = idToken(AuthRole.MENTOR, 'mentor-uuid-123');
  assert.equal(auth.compareEditingTarget({ id: 'someone-else' }), false);
});

test('ID-targeted with undefined other.id returns false', () => {
  const auth = idToken(AuthRole.STUDENT, 'student-uuid-456');
  assert.equal(auth.compareEditingTarget({}), false);
  assert.equal(auth.compareEditingTarget({ id: null }), false);
});

test('ID-targeted token ignores other.username', () => {
  const auth = idToken(AuthRole.STUDENT, 'student-uuid-456');
  assert.equal(auth.compareEditingTarget({ username: 'student-uuid-456' }), false);
  assert.equal(auth.compareEditingTarget({ username: 'anything' }), false);
});

test('USERNAME-targeted self-match returns true (regression: was always false)', () => {
  const auth = usernameToken(AuthRole.MENTOR, 'alice');
  assert.equal(auth.compareEditingTarget({ username: 'alice' }), true);
});

test('USERNAME-targeted mismatch returns false', () => {
  const auth = usernameToken(AuthRole.MENTOR, 'alice');
  assert.equal(auth.compareEditingTarget({ username: 'bob' }), false);
});

test('USERNAME-targeted with undefined other.username returns false', () => {
  const auth = usernameToken(AuthRole.STUDENT, 'alice');
  assert.equal(auth.compareEditingTarget({}), false);
  assert.equal(auth.compareEditingTarget({ username: null }), false);
});

test('USERNAME-targeted token ignores other.id', () => {
  const auth = usernameToken(AuthRole.STUDENT, 'alice');
  assert.equal(auth.compareEditingTarget({ id: 'alice' }), false);
  assert.equal(auth.compareEditingTarget({ id: 'anything' }), false);
});

test('unauthenticated context returns false', () => {
  const auth = new AuthContext();
  assert.equal(auth.compareEditingTarget({ username: 'alice' }), false);
  assert.equal(auth.compareEditingTarget({ id: 'user-123' }), false);
});

test('enum-value regression lock: ID token does not match other.id === "i"', () => {
  const auth = idToken(AuthRole.MENTOR, 'user-123');
  assert.equal(auth.compareEditingTarget({ id: 'i' }), false);
});

test('enum-value regression lock: USERNAME token does not match other.username === "u"', () => {
  const auth = usernameToken(AuthRole.STUDENT, 'alice');
  assert.equal(auth.compareEditingTarget({ username: 'u' }), false);
});

test('token getters resolve correctly (regression guard)', () => {
  const idAuth = idToken(AuthRole.MENTOR, 'mentor-id-1');
  assert.equal(idAuth.id, 'mentor-id-1');
  assert.equal(idAuth.username, undefined);
  assert.equal(idAuth.target, AuthByTarget.ID);

  const usernameAuth = usernameToken(AuthRole.STUDENT, 'bob');
  assert.equal(usernameAuth.username, 'bob');
  assert.equal(usernameAuth.id, undefined);
  assert.equal(usernameAuth.target, AuthByTarget.USERNAME);
});

test('MentorOnlySelf predicate: mentor self where.id allowed, other rejected', () => {
  const ownId = 'mentor-self';
  const auth = idToken(AuthRole.MENTOR, ownId);

  // Replicates the gating decision from src/resolvers/decorators.ts (MentorOnlySelf)
  // for the branch where auth.id && where.id both exist (DB lookup skipped).
  function gate(where: { id?: string | null } | null): boolean {
    if (auth.isAdmin || auth.isManager) {
      if (!where) throw new Error('Token type requires where argument.');
      return true;
    }
    if (where) {
      let compare: { id?: string | null; username?: string | null } | null = where;
      if (!((auth.username && where.username) || (auth.id && where.id))) {
        // DB lookup would run here; not exercised because auth.id && where.id both present.
        compare = where;
      }
      if (!compare || !auth.compareEditingTarget(compare)) return false;
    }
    return true;
  }

  assert.equal(gate({ id: ownId }), true);
  assert.equal(gate({ id: 'another-mentor' }), false);
});

test('MentorOnlySelf predicate: no where bypasses compare (no throw)', () => {
  const auth = idToken(AuthRole.MENTOR, 'mentor-self');
  function gate(where: { id?: string | null } | null): boolean {
    if (auth.isAdmin || auth.isManager) {
      if (!where) throw new Error('Token type requires where argument.');
      return true;
    }
    if (where) {
      let compare: { id?: string | null; username?: string | null } | null = where;
      if (!((auth.username && where.username) || (auth.id && where.id))) compare = where;
      if (!compare || !auth.compareEditingTarget(compare)) return false;
    }
    return true;
  }
  assert.equal(gate(null), true);
});

test('StudentOnlySelf predicate: student self where.username allowed, other rejected', () => {
  const auth = usernameToken(AuthRole.STUDENT, 'student-self');
  function gate(where: { username?: string | null } | null): boolean {
    if (auth.isAdmin || auth.isManager) {
      if (!where) throw new Error('Token type requires where argument.');
      return true;
    }
    if (where) {
      let compare: { id?: string | null; username?: string | null } | null = where;
      if (!((auth.username && where.username) || (auth.id && where.id))) compare = where;
      if (!compare || !auth.compareEditingTarget(compare)) return false;
    }
    return true;
  }
  assert.equal(gate({ username: 'student-self' }), true);
  assert.equal(gate({ username: 'someone-else' }), false);
});

test('Admin/manager bypass compareEditingTarget and require where', () => {
  const admin = new AuthContext(makeToken({ typ: AuthRole.ADMIN, evt: 'evt-1' }));
  const manager = new AuthContext(makeToken({ typ: AuthRole.MANAGER, evt: 'evt-1' }));
  assert.equal(admin.isAdmin, true);
  assert.equal(manager.isManager, true);
  // Admin/manager tokens have no tgt; compareEditingTarget falls through to false,
  // but the decorators never reach it for these roles.
  assert.equal(admin.compareEditingTarget({ id: 'x' }), false);
  assert.equal(manager.compareEditingTarget({ id: 'x' }), false);
});
