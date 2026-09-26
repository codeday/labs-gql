import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { SlackResolver } from '../src/resolvers/Slack';

// Start a local JWKS endpoint that returns the provided key set (or a non-2xx
// status to simulate a JWKS fetch failure). Replaces Slack's real
// `https://slack.com/openid/connect/keys` so the resolver's key resolution can
// be exercised without touching the network.
function makeJwksServer(keys: object[], status = 200) {
  return http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.statusCode = status;
    res.end(status === 200 ? JSON.stringify({ keys }) : JSON.stringify({ error: 'jwks unavailable' }));
  });
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => { server.close(() => resolve()); });
}

function makeResolver(jwksUri: string) {
  const resolver = new SlackResolver() as unknown as {
    client: JwksClient;
    decodeJwt: (token: string) => Promise<jwt.JwtPayload>;
  };
  // Replace the address-hardcoded JwksClient with one pointed at the local stub.
  resolver.client = new JwksClient({ jwksUri });
  return resolver;
}

// Run an operation, asserting that it (a) actually settles within `ms`,
// (b) does NOT trigger an `uncaughtException`. Returns the resolved value or
// rethrows the rejected reason. If `getKey` ever throws from inside the
// `jwks-rsa` async callback again, `decodeJwt` would never settle and an
// `uncaughtException` would fire on a later tick; this helper turns both of
// those into a test failure instead of crashing the test process.
async function runSafely<T>(fn: () => Promise<T>, ms = 5000): Promise<T> {
  let uncaught: Error | null = null;
  const onUncaught = (err: Error) => { uncaught = err; };
  process.once('uncaughtException', onUncaught);

  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`operation did not settle within ${ms}ms`)), ms);
  });

  let value: T | undefined;
  let thrown: unknown;
  let didThrow = false;
  try {
    value = await Promise.race([fn(), timeout]);
  } catch (e) {
    didThrow = true;
    thrown = e;
  }
  // Let any queued uncaughtException microtask drain before we peel off the listener.
  await new Promise<void>((r) => setImmediate(r));
  clearTimeout(timer!);
  process.removeListener('uncaughtException', onUncaught);

  if (uncaught) {
    throw new Error(`uncaughtException fired: ${uncaught.message}\n${uncaught.stack ?? ''}`);
  }
  if (didThrow) throw thrown;

  return value as T;
}

function forgeToken(kid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'does-not-matter' })).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

// Guards against re-introducing the throw-from-async-callback footgun in
// `SlackResolver.getKey`: a key-resolution failure must surface as a clean
// `decodeJwt` rejection, never as an `uncaughtException` (which, with no
// process-level handler installed, terminates the API process).
test('unknown kid: decodeJwt rejects cleanly (no uncaughtException, no hang)', async () => {
  const server = makeJwksServer([]); // Slack's JWKS has no key with our kid
  try {
    const port = await listen(server);
    const resolver = makeResolver(`http://127.0.0.1:${port}/.well-known/jwks.json`);

    await assert.rejects(
      () => runSafely(() => resolver.decodeJwt(forgeToken('does-not-exist'))),
      (err: Error) => {
        assert.ok(
          !/uncaughtException fired/.test(err.message),
          `should not surface as uncaughtException, got: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    await close(server);
  }
});

test('JWKS fetch failure (503): decodeJwt rejects cleanly (no uncaughtException, no hang)', async () => {
  const server = makeJwksServer([], 503);
  try {
    const port = await listen(server);
    const resolver = makeResolver(`http://127.0.0.1:${port}/.well-known/jwks.json`);

    await assert.rejects(
      () => runSafely(() => resolver.decodeJwt(forgeToken('any-kid'))),
      (err: Error) => {
        assert.ok(
          !/uncaughtException fired/.test(err.message),
          `should not surface as uncaughtException, got: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    await close(server);
  }
});
