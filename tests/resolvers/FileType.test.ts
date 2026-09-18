/**
 * Tests for the bug: Admin: FileType update/delete always fail with
 * "Not a student or mentor token."
 *
 * Root cause: `updateFileType` and `deleteFileType` are `@Authorized([AuthRole.ADMIN])`
 * (only admins can reach the body) but their first line was `await validateActive(auth)`,
 * whose first line throws `Not a student or mentor token.` for any non-student/mentor
 * role -- including ADMIN. So every admin caller was rejected before any work ran.
 *
 * Fix: removed the `validateActive(auth)` calls (and its now-unused import) from both
 * mutations. Admin-only operations don't need an active-participant check; the
 * `fileType.eventId !== auth.eventId` ownership check remains as the authorization.
 *
 * Run with (full coverage -- repo's actual tool, emits TS decorator metadata):
 *   npx ts-node --transpile-only tests/resolvers/FileType.test.ts
 *
 * Also runnable with (degrades gracefully; resolver-behavior tests are skipped because
 * esbuild/tsx omits the design-time type metadata that type-graphql's reflection-based
 * `@Field({ nullable: true })` depends on):
 *   npx tsx tests/resolvers/FileType.test.ts
 */
import '../_env-setup';
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { AuthContext } from '../../src/context/auth/AuthContext';
import { AuthRole } from '../../src/context/auth/JwtToken';
import { authChecker } from '../../src/context/auth/authChecker';
import { signTokenAdmin, signTokenUser } from '../../src/utils/signToken';
import { validateActive } from '../../src/utils/validateActive';

// The resolver module transitively imports the type-graphql `FileType` class whose
// `@Field({ nullable: true }) emailSubject?: string` relies on TS design-time metadata
// that esbuild (tsx) does not emit. Load it lazily so the rest of this file still runs
// (and the suite degrades to a clear SKIP) under tsx; under ts-node it loads fully.
type FileTypeResolverCtor = new () => any;
let FileTypeResolver: FileTypeResolverCtor | undefined;
let resolverLoadError: Error | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({ FileTypeResolver } = require('../../src/resolvers/FileType'));
} catch (e) {
  resolverLoadError = e as Error;
}

let failures = 0;
let skipped = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`FAILED: ${message}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`PASSED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`PASSED: ${message}`);
  }
}

async function assertRejects(promiseOrThunk: () => Promise<unknown>, expectedMessage: string, message: string): Promise<void> {
  let threw = false;
  let actualMessage = '';
  try {
    await promiseOrThunk();
  } catch (e) {
    threw = true;
    actualMessage = (e as Error).message;
  }
  if (!threw) {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`FAILED: ${message} (expected to throw, but did not)`);
    return;
  }
  if (actualMessage !== expectedMessage) {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`FAILED: ${message}\n  expected message: ${JSON.stringify(expectedMessage)}\n  actual message:   ${JSON.stringify(actualMessage)}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`PASSED: ${message}`);
}

function skip(reason: string, message: string): void {
  skipped += 1;
  // eslint-disable-next-line no-console
  console.log(`SKIPPED: ${message} (${reason})`);
}

// --- Token / context factories -------------------------------------------------

const EVT_ID = 'evt-1';
const OTHER_EVT_ID = 'evt-2';

function adminAuth(eventId: string = EVT_ID): AuthContext {
  // signTokenAdmin requires an Event with `.id`; admin tokens carry `evt` and no `sid`.
  return new AuthContext(signTokenAdmin({ id: eventId } as never));
}

function studentAuth(eventId: string = EVT_ID): AuthContext {
  return new AuthContext(signTokenUser({ id: 'stu-1', eventId } as never));
}

function fakeData(toQueryReturn: Record<string, unknown> = { slug: 'updated-slug' }): { toQuery: () => Record<string, unknown> } {
  return { toQuery: () => toQueryReturn };
}

type Calls = Record<string, unknown[]>;
function makeFakePrisma() {
  const calls: Calls = {};

  function spy(name: string, impl: (...args: unknown[]) => unknown) {
    return (...args: unknown[]) => {
      calls[name] = calls[name] || [];
      (calls[name] as unknown[]).push(args);
      return impl(...args);
    };
  }

  let findUniqueImpl: (...args: unknown[]) => unknown = async () => ({ id: 'ft-1', eventId: EVT_ID });
  let updateImpl: (...args: unknown[]) => unknown = async (...args) => ({ id: 'ft-1', eventId: EVT_ID, ...(args[0] as any)?.data });
  let deleteImpl: (...args: unknown[]) => unknown = async () => ({ id: 'ft-1' });
  let countImpl: (...args: unknown[]) => unknown = async () => 0;
  let createImpl: (...args: unknown[]) => unknown = async (...args) => ({ id: 'ft-new', eventId: EVT_ID, ...(args[0] as any)?.data });
  let findManyImpl: (...args: unknown[]) => unknown = async () => [];

  const prisma: any = {
    fileType: {
      findUnique: spy('fileType.findUnique', (...a: unknown[]) => findUniqueImpl(...a)),
      update: spy('fileType.update', (...a: unknown[]) => updateImpl(...a)),
      delete: spy('fileType.delete', (...a: unknown[]) => deleteImpl(...a)),
      create: spy('fileType.create', (...a: unknown[]) => createImpl(...a)),
      findMany: spy('fileType.findMany', (...a: unknown[]) => findManyImpl(...a)),
    },
    file: {
      count: spy('file.count', (...a: unknown[]) => countImpl(...a)),
    },
  };

  return {
    prisma,
    calls,
    setFindUnique(fn: (...a: unknown[]) => unknown) { findUniqueImpl = fn; },
    setUpdate(fn: (...a: unknown[]) => unknown) { updateImpl = fn; },
    setDelete(fn: (...a: unknown[]) => unknown) { deleteImpl = fn; },
    setCount(fn: (...a: unknown[]) => unknown) { countImpl = fn; },
    setCreate(fn: (...a: unknown[]) => unknown) { createImpl = fn; },
    setFindMany(fn: (...a: unknown[]) => unknown) { findManyImpl = fn; },
  };
}

const HAS_RESOLVER = Boolean(FileTypeResolver);
const RESOLVER_SKIP_REASON = resolverLoadError
  ? `resolver module import failed under this runner (${resolverLoadError.name}); use \`npx ts-node --transpile-only ...\``
  : 'resolver not loaded';
const canBuildResolver = (): boolean => HAS_RESOLVER;

function newResolver(prisma: any): any {
  const r = new (FileTypeResolver as FileTypeResolverCtor)();
  (r as any).prisma = prisma;
  return r;
}

// --- Tests --------------------------------------------------------------------

async function main(): Promise<void> {
  // ===========================================================================
  // Group 1: The bug premise -- validateActive rejects admin tokens
  // (proves any code that calls validateActive(auth) with an admin context fails)
  // ===========================================================================
  // eslint-disable-next-line no-console
  console.log('\n== Group 1: validateActive rejects admin tokens ==');

  const adminCtx = adminAuth();
  assertEqual(adminCtx.isAdmin, true, 'admin AuthContext.isAdmin === true');
  assertEqual(adminCtx.isStudent, false, 'admin AuthContext.isStudent === false');
  assertEqual(adminCtx.isMentor, false, 'admin AuthContext.isMentor === false');
  assertEqual(adminCtx.isAuthenticated, true, 'admin AuthContext isAuthenticated (gate would admit)');

  await assertRejects(
    () => validateActive(adminCtx),
    'Not a student or mentor token.',
    'validateActive(admin) throws "Not a student or mentor token." (the root cause)',
  );

  // Sanity: validateActive accepts student tokens (so it is a participant gate, not badly broken)
  const studentCtx = studentAuth();
  assertEqual(studentCtx.isStudent, true, 'student AuthContext.isStudent === true');
  // Note: validateActive(student) would proceed to Container.get(PrismaClient).student.findUnique;
  // we do NOT call it here (no DB). The throwing-for-admin behavior above is sufficient to prove the
  // resolver body's first line would have rejected every admin caller.

  // ===========================================================================
  // Group 2: Source-level regression guard -- the fix is present in FileType.ts
  // (durable guard against the call being re-introduced)
  // ===========================================================================
  // eslint-disable-next-line no-console
  console.log('\n== Group 2: source-level regression guard ==');

  const sourcePath = path.resolve(__dirname, '../../src/resolvers/FileType.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert(!source.includes('validateActive'), 'src/resolvers/FileType.ts does not reference validateActive (import or call)');
  assert(source.includes('async updateFileType'), 'src/resolvers/FileType.ts still defines updateFileType');
  assert(source.includes('async deleteFileType'), 'src/resolvers/FileType.ts still defines deleteFileType');
  assert(source.includes('async createFileType'), 'src/resolvers/FileType.ts still defines createFileType (sibling unaffected)');
  // Non-regression: the admin auth gate is still present on every operation.
  const adminGateCount = (source.match(/@Authorized\(\[AuthRole\.ADMIN\]\)/g) || []).length;
  assertEqual(adminGateCount, 5, 'all five FileType operations retain @Authorized([AuthRole.ADMIN])');
  // Non-regression: the ownership (event-id) checks are still present -- the real authorization.
  assert(source.includes('You do not have permission to update this file type'), 'updateFileType still enforces event ownership');
  assert(source.includes('You do not have permission to delete this file type'), 'deleteFileType still enforces event ownership');

  // ===========================================================================
  // Group 3: authChecker admits admins (the precondition of the bug)
  // (the @Authorized([ADMIN]) gate was never the problem; it lets admins through.
  //  That is exactly WHY admins reached the body and tripped validateActive.)
  // ===========================================================================
  // eslint-disable-next-line no-console
  console.log('\n== Group 3: authChecker admits admins (bug precondition) ==');

  assertEqual(
    authChecker({ context: { auth: adminCtx } } as never, [AuthRole.ADMIN]),
    true,
    'authChecker admits an admin token for [ADMIN] roles',
  );
  assertEqual(
    authChecker({ context: { auth: studentCtx } } as never, [AuthRole.ADMIN]),
    false,
    'authChecker rejects a student token for [ADMIN] roles',
  );
  assertEqual(
    authChecker({ context: { auth: adminCtx } } as never, []),
    true,
    'authChecker admits any authenticated token for empty roles',
  );
  const anon = new AuthContext();
  assertEqual(anon.isAuthenticated, false, 'anonymous AuthContext is not authenticated');
  assertEqual(
    authChecker({ context: { auth: anon } } as never, [AuthRole.ADMIN]),
    false,
    'authChecker rejects an anonymous token for [ADMIN] roles',
  );

  // ===========================================================================
  // Group 4: updateFileType behavior (admin can now succeed; ownership enforced)
  // ===========================================================================
  // eslint-disable-next-line no-console
  console.log('\n== Group 4: updateFileType behavior ==');
  if (!canBuildResolver()) {
    skip(RESOLVER_SKIP_REASON, '[updateFileType] admin happy path no longer throws "Not a student or mentor token."');
    skip(RESOLVER_SKIP_REASON, '[updateFileType] admin happy path calls findUnique then update');
    skip(RESOLVER_SKIP_REASON, '[updateFileType] wrong-event admin throws ownership error');
    skip(RESOLVER_SKIP_REASON, '[updateFileType] not-found propagated, no update performed');
  } else {
    // 4a. Admin happy path: previously threw "Not a student or mentor token." BEFORE any work.
    //     After the fix it must complete and call prisma correctly.
    const f1 = makeFakePrisma();
    const r1 = newResolver(f1.prisma);
    const data1 = fakeData({ slug: 'updated' });
    let result1: any;
    let threw1 = false;
    try {
      result1 = await r1.updateFileType({ auth: adminAuth(EVT_ID) } as never, 'ft-1', data1);
    } catch (e) {
      threw1 = true;
      // eslint-disable-next-line no-console
      console.error(`FAILED: [updateFileType] admin happy path threw unexpectedly: ${(e as Error).message}`);
      failures += 1;
    }
    if (!threw1) {
      assertEqual(Boolean(result1), true, '[updateFileType] admin happy path returns without throwing');
      assertEqual(
        JSON.stringify((f1.calls['fileType.findUnique'] || [[undefined]])[0][0]),
        JSON.stringify({ where: { id: 'ft-1' }, rejectOnNotFound: true }),
        '[updateFileType] calls fileType.findUnique({ where:{id}, rejectOnNotFound:true })',
      );
      assertEqual(
        JSON.stringify((f1.calls['fileType.update'] || [[undefined]])[0][0]),
        JSON.stringify({ where: { id: 'ft-1' }, data: { slug: 'updated' } }),
        '[updateFileType] calls fileType.update with where and data.toQuery()',
      );
    }

    // 4b. Admin token eventId mismatch -> ownership error, update NOT called.
    const f2 = makeFakePrisma();
    f2.setFindUnique(async () => ({ id: 'ft-1', eventId: OTHER_EVT_ID }));
    const r2 = newResolver(f2.prisma);
    await assertRejects(
      () => r2.updateFileType({ auth: adminAuth(EVT_ID) } as never, 'ft-1', fakeData()),
      'You do not have permission to update this file type',
      '[updateFileType] wrong-event admin throws ownership error',
    );
    assert(!f2.calls['fileType.update'], '[updateFileType] no update call when event ownership fails');

    // 4c. Not-found: findUnique rejects (Prisma rejectOnNotFound) -> propagated, no update.
    const f3 = makeFakePrisma();
    const notFound = new Error('Simulated Prisma not-found (rejectOnNotFound: true)');
    f3.setFindUnique(async () => { throw notFound; });
    const r3 = newResolver(f3.prisma);
    let notFoundPropagated = false;
    try {
      await r3.updateFileType({ auth: adminAuth(EVT_ID) } as never, 'nope', fakeData());
    } catch (e) {
      notFoundPropagated = (e as Error) === notFound;
    }
    assert(notFoundPropagated, '[updateFileType] not-found error is propagated from findUnique');
    assert(!f3.calls['fileType.update'], '[updateFileType] no update call when findUnique throws');

    // 4d. Regression: critical assertion that the body's first action is the prisma lookup,
    //     NOT validateActive. After the fix, an admin reaches findUnique.
    const f4 = makeFakePrisma();
    const r4 = newResolver(f4.prisma);
    await r4.updateFileType({ auth: adminAuth(EVT_ID) } as never, 'ft-1', fakeData());
    assert(Boolean(f4.calls['fileType.findUnique']), '[updateFileType] admin reaches fileType.findUnique (validateActive no longer guards it)');
  }

  // ===========================================================================
  // Group 5: deleteFileType behavior (admin can now succeed; ownership + in-use enforced)
  // ===========================================================================
  // eslint-disable-next-line no-console
  console.log('\n== Group 5: deleteFileType behavior ==');
  if (!canBuildResolver()) {
    skip(RESOLVER_SKIP_REASON, '[deleteFileType] admin happy path no longer throws "Not a student or mentor token."');
    skip(RESOLVER_SKIP_REASON, '[deleteFileType] admin happy path returns true and deletes');
    skip(RESOLVER_SKIP_REASON, '[deleteFileType] wrong-event admin throws ownership error');
    skip(RESOLVER_SKIP_REASON, '[deleteFileType] in-use file type throws and does not delete');
  } else {
    // 5a. Admin happy path: previously threw "Not a student or mentor token." Returns true.
    const fa = makeFakePrisma();
    const ra = newResolver(fa.prisma);
    let resDel: any;
    let delThrew = false;
    try {
      resDel = await ra.deleteFileType({ auth: adminAuth(EVT_ID) } as never, 'ft-1');
    } catch (e) {
      delThrew = true;
      // eslint-disable-next-line no-console
      console.error(`FAILED: [deleteFileType] admin happy path threw unexpectedly: ${(e as Error).message}`);
      failures += 1;
    }
    if (!delThrew) {
      assertEqual(resDel, true, '[deleteFileType] admin happy path returns true');
      assertEqual(
        JSON.stringify((fa.calls['fileType.findUnique'] || [[undefined]])[0][0]),
        JSON.stringify({ where: { id: 'ft-1' }, rejectOnNotFound: true }),
        '[deleteFileType] calls fileType.findUnique with id',
      );
      assertEqual(
        JSON.stringify((fa.calls['file.count'] || [[undefined]])[0][0]),
        JSON.stringify({ where: { fileTypeId: 'ft-1' } }),
        '[deleteFileType] checks file.count for in-use files',
      );
      assert(Boolean(fa.calls['fileType.delete']), '[deleteFileType] calls fileType.delete when allowed');
    }

    // 5b. Wrong-event -> ownership error, delete NOT called.
    const fb = makeFakePrisma();
    fb.setFindUnique(async () => ({ id: 'ft-1', eventId: OTHER_EVT_ID }));
    const rb = newResolver(fb.prisma);
    await assertRejects(
      () => rb.deleteFileType({ auth: adminAuth(EVT_ID) } as never, 'ft-1'),
      'You do not have permission to delete this file type',
      '[deleteFileType] wrong-event admin throws ownership error',
    );
    assert(!fb.calls['fileType.delete'], '[deleteFileType] no delete call when event ownership fails');
    assert(!fb.calls['file.count'], '[deleteFileType] no file.count call when event ownership fails (ownership checked first)');

    // 5c. In-use (file.count > 0) -> throws, delete NOT called.
    const fc = makeFakePrisma();
    fc.setCount(async () => 3);
    const rc = newResolver(fc.prisma);
    await assertRejects(
      () => rc.deleteFileType({ auth: adminAuth(EVT_ID) } as never, 'ft-1'),
      'Cannot delete file type that is in use by files',
      '[deleteFileType] in-use file type throws "Cannot delete file type that is in use by files"',
    );
    assert(!fc.calls['fileType.delete'], '[deleteFileType] no delete call when files still reference the type');

    // 5d. Not-found propagated, delete NOT called.
    const fd = makeFakePrisma();
    const notFoundDel = new Error('Simulated Prisma not-found (rejectOnNotFound: true)');
    fd.setFindUnique(async () => { throw notFoundDel; });
    const rd = newResolver(fd.prisma);
    let delNotFoundPropagated = false;
    try {
      await rd.deleteFileType({ auth: adminAuth(EVT_ID) } as never, 'nope');
    } catch (e) {
      delNotFoundPropagated = (e as Error) === notFoundDel;
    }
    assert(delNotFoundPropagated, '[deleteFileType] not-found error is propagated from findUnique');
    assert(!fd.calls['fileType.delete'], '[deleteFileType] no delete call when findUnique throws');
  }

  // ===========================================================================
  // Group 6: Non-regression of sibling admin-only operations (never called validateActive)
  // ===========================================================================
  // eslint-disable-next-line no-console
  console.log('\n== Group 6: sibling admin operations non-regression ==');
  if (!canBuildResolver()) {
    skip(RESOLVER_SKIP_REASON, '[createFileType] admin happy path unaffected');
    skip(RESOLVER_SKIP_REASON, '[fileTypes] admin happy path unaffected');
    skip(RESOLVER_SKIP_REASON, '[fileType] admin happy path unaffected');
  } else {
    // createFileType
    const fe = makeFakePrisma();
    const re = newResolver(fe.prisma);
    const createData = { toQuery: (eid: string) => ({ templateId: 't', eventId: eid }) } as never;
    await re.createFileType({ auth: adminAuth(EVT_ID) } as never, createData);
    assert(Boolean(fe.calls['fileType.create']), '[createFileType] admin can create (validateActive never guarded this)');
    assertEqual(
      JSON.stringify((fe.calls['fileType.create'] || [[undefined]])[0][0]),
      JSON.stringify({ data: { templateId: 't', eventId: EVT_ID } }),
      '[createFileType] calls fileType.create with data.toQuery(auth.eventId)',
    );

    // fileTypes
    const ff = makeFakePrisma();
    ff.setFindMany(async () => [{ id: 'ft-1', eventId: EVT_ID }]);
    const rf = newResolver(ff.prisma);
    const list = await rf.fileTypes({ auth: adminAuth(EVT_ID) } as never, EVT_ID);
    assertEqual(JSON.stringify(list), JSON.stringify([{ id: 'ft-1', eventId: EVT_ID }]), '[fileTypes] returns findMany result');
    assertEqual(
      JSON.stringify((ff.calls['fileType.findMany'] || [[undefined]])[0][0]),
      JSON.stringify({ where: { eventId: EVT_ID } }),
      '[fileTypes] calls fileType.findMany with eventId',
    );

    // fileType (single)
    const fg = makeFakePrisma();
    fg.setFindUnique(async () => ({ id: 'ft-9', eventId: EVT_ID }));
    const rg = newResolver(fg.prisma);
    const one = await rg.fileType('ft-9');
    assertEqual(JSON.stringify(one), JSON.stringify({ id: 'ft-9', eventId: EVT_ID }), '[fileType] returns findUnique result');
    assertEqual(
      JSON.stringify((fg.calls['fileType.findUnique'] || [[undefined]])[0][0]),
      JSON.stringify({ where: { id: 'ft-9' } }),
      '[fileType] calls fileType.findUnique by id',
    );
  }

  // ===========================================================================
  // Summary
  // ===========================================================================
  // eslint-disable-next-line no-console
  console.log(`\n${failures === 0 ? 'All tests passed' : `${failures} test(s) failed`}${skipped > 0 ? `, ${skipped} skipped` : ''}.`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('FATAL: test runner threw', e);
  process.exit(1);
});
