import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';

// ----------------------------------------------------------------------------
// Why the loader stub? --------------------------------------------------------
// `src/resolvers/Partner.ts` imports the type-graphql `@ObjectType` graph via
// `../types`. That graph is decorated with `@Field()` fields whose GraphQL
// types are inferred from TS `design:type` metadata. tsx (esbuild) does not
// emit `design:type` metadata, so importing that graph throws `NoExplicitTypeError`
// under `npx tsx`. The resolver's *own* decorators all pass explicit type
// arrows, and `editPartner` never touches the `Partner`/`Student` object-type
// classes at runtime (only via decorators as metadata). So we can stub the
// `../types` module with plain classes, load the real resolver, and exercise
// its real Prisma I/O by injecting a mock Prisma client. This guards against
// the `editPartner` where-clause normalization asymmetry recurring.
// ----------------------------------------------------------------------------

const TYPES_DIR = path.resolve(__dirname, '..', 'src', 'types');
const origLoad = (Module as any)._load;
const typesStub: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop: string | symbol) => {
    if (prop === '__esModule') return true;
    return class {};
  },
});
(Module as any)._load = function (request: string, parent: NodeJS.Module, isMain: boolean) {
  let resolved: string | undefined;
  try {
    resolved = (Module as any)._resolveFilename(request, parent, isMain);
  } catch {
    resolved = undefined;
  }
  if (resolved && (resolved === TYPES_DIR || resolved.startsWith(TYPES_DIR + path.sep))) {
    return typesStub;
  }
  return origLoad.apply(this, arguments as unknown as [string, NodeJS.Module, boolean]);
};

// Load the REAL resolver/input AFTER the `_load` stub is installed. Use
// `require` (not `import`) so these calls are not hoisted above the stub.
const { ProjectResolver } = require('../src/resolvers/Partner') as {
  ProjectResolver: new () => InstanceType<typeof import('../src/resolvers/Partner')['ProjectResolver']>;
};
const { PartnerEditInput } = require('../src/inputs/PartnerEditInput') as {
  PartnerEditInput: typeof import('../src/inputs/PartnerEditInput')['PartnerEditInput'];
};

// `editPartner` must normalize the `partnerCode` argument identically in BOTH
// its `prisma.partner.update` where-clause and its `prisma.student.updateMany`
// where-clause. The Student filter must never receive the raw (non-uppercase)
// argument, or it matches 0 Students (which store the uppercase code) and
// orphans every associated Student from the renamed Partner. These two cases
// guard that intra-function symmetry against regressions.

type UpdateArgs = {
  where: { partnerCode_eventId: { partnerCode: string; eventId: string } };
  data: Record<string, unknown>;
};
type UpdateManyArgs = {
  where: { eventId: string; partnerCode: string };
  data: Record<string, unknown>;
};

function makeFakePrisma(updatedPartner: Record<string, unknown>) {
  const partnerCalls: UpdateArgs[] = [];
  const partnerUpdate = (args: UpdateArgs): Promise<Record<string, unknown>> => {
    partnerCalls.push(args);
    return Promise.resolve({
      ...updatedPartner,
      partnerCode: (args.data.partnerCode as string) ?? updatedPartner.partnerCode,
    });
  };

  const studentCalls: UpdateManyArgs[] = [];
  const studentUpdateMany = (args: UpdateManyArgs): Promise<{ count: number }> => {
    studentCalls.push(args);
    return Promise.resolve({ count: 1 });
  };

  return {
    partner: { update: partnerUpdate },
    student: { updateMany: studentUpdateMany },
    _calls: { partner: partnerCalls, student: studentCalls },
  };
}

type ResolverLike = { editPartner(ctx: any, partnerCode: string, data: PartnerEditInput): Promise<unknown> };

function makeResolver(fakePrisma: ReturnType<typeof makeFakePrisma>): ResolverLike {
  const resolver = new (ProjectResolver as unknown as new () => InstanceType<typeof ProjectResolver>)();
  Object.defineProperty(resolver, 'prisma', {
    value: fakePrisma,
    writable: true,
    configurable: true,
  });
  return resolver as unknown as ResolverLike;
}

function makeInput(partnerCode: string) {
  const data = new PartnerEditInput();
  data.partnerCode = partnerCode;
  return data;
}

test('editPartner normalizes the partnerCode arg identically for the Partner lookup and the Student filter (intra-function symmetry)', async () => {
  const existing = { eventId: 'evt-1', partnerCode: 'ACME', minHours: null, weeks: null, skipPreferences: false };
  const fake = makeFakePrisma(existing);

  await makeResolver(fake).editPartner(
    { auth: { eventId: 'evt-1' } } as any,
    'aCmE',
    makeInput('ACME2'),
  );

  const partnerWhereCode = fake._calls.partner[0].where.partnerCode_eventId.partnerCode;
  const studentWhereCode = fake._calls.student[0].where.partnerCode;
  assert.equal(partnerWhereCode, 'ACME', 'Partner lookup uses the uppercased key');
  assert.equal(studentWhereCode, 'ACME', 'Student filter uses the same uppercased key');
  assert.equal(studentWhereCode, partnerWhereCode,
    'Both where-filters must normalize the shared partnerCode arg identically');
});

test('editPartner never passes the raw (non-uppercase) partnerCode arg to the Student updateMany filter', async () => {
  const existing = { eventId: 'evt-1', partnerCode: 'ACME', minHours: null, weeks: null, skipPreferences: false };
  const fake = makeFakePrisma(existing);

  await makeResolver(fake).editPartner(
    { auth: { eventId: 'evt-1' } } as any,
    'acme',
    makeInput('ACME2'),
  );

  assert.notEqual(fake._calls.student[0].where.partnerCode, 'acme',
    'The raw lowercase arg must never reach the Student filter, or it matches 0 Students and orphans them');
});
