/**
 * Offline unit tests for the Placid layer rendering pipeline. No live Placid access —
 * generateMedia's HTTP layer is stubbed via globalThis.fetch.
 *
 * Run with:
 *   npx tsx src/placid/index.test.ts
 */

// src/config (transitively imported by ./index) throws at import time unless all of these
// env vars are present. Set them before the require() below so the test stays self-contained.
const TEST_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ELASTIC_URL: 'http://localhost:9200',
  ELASTIC_INDEX: 'test',
  AUTH_SECRET: 'test-secret',
  AUTH_AUDIENCE: 'test-audience',
  EMAIL_HOST: 'localhost',
  EMAIL_PORT: '587',
  EMAIL_USER: 'test',
  EMAIL_PASS: 'test',
  EMAIL_INBOUND_DOMAIN: 'test.local',
  GEOCODIO_API_KEY: 'test-key',
  OPENAI_API_KEY: 'test-key',
  OPENAI_ORGANIZATION: 'test-org',
  WEBHOOK_KEY: 'test-key',
  BADGR_USERNAME: 'test',
  BADGR_PASSWORD: 'test',
  BADGR_ISSUER: 'test',
  SHOPIFY_API_TOKEN: 'test',
  SHOPIFY_API_KEY: 'test',
  SHOPIFY_API_SECRET_KEY: 'test',
  SHOPIFY_STORE_DOMAIN: 'test.myshopify.com',
  LINEAR_API_KEY: 'test',
  LINEAR_TEAM_ID: 'test',
  LINEAR_PROBLEM_LABEL_ID: 'test',
  METRICS_KEY: 'test',
  PLACID_API_TOKEN: 'test',
  ATTIO_API_TOKEN: 'test',
  ATTIO_ALUMNI_LIST: 'test',
};
for (const [k, v] of Object.entries(TEST_ENV)) {
  if (!process.env[k]) process.env[k] = v;
}

import 'reflect-metadata';
import { FileTypeType } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderLayers, generateMedia } = require('./index') as typeof import('./index');

let failures = 0;

const NO_ENTITY = /&(?:amp|lt|gt|quot|#x27|#39|#x2[Ff]);/;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAILED: ${message}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

// --- renderLayers: no HTML-escaping on leaf text (the bug) -------------------------------

(function testApostropheAndAmpersandNotEscaped() {
  const layers = { name_layer: { text: '{{student.givenName}} {{student.surname}}' } };
  const result = renderLayers(layers, { student: { givenName: "O'Brien", surname: 'Tom & Jerry' } }) as any;
  assertEqual(
    result.name_layer.text,
    "O'Brien Tom & Jerry",
    "Apostrophes and ampersands in interpolated names are not HTML-escaped (the reported bug)",
  );
})();

(function testFullHandlebarsEscapeSetNotEscaped() {
  const layers = { l: { text: '{{v}}' } };
  const result = renderLayers(layers, { v: '<a href="x">&\'</a>' }) as any;
  assertEqual(
    result.l.text,
    '<a href="x">&\'</a>',
    "None of Handlebars' default escape targets (& < > \" ') are HTML-escaped",
  );
})();

// --- renderLayers: no JSON.parse crash on values that broke the naive noEscape approach ----

(function testDoubleQuotesDoNotCrashOrEscape() {
  // The naive `noEscape: true` over JSON.stringify approach crashed JSON.parse on a value
  // containing a double quote. renderLayers compiles each leaf separately and never JSON.parses
  // user content, so a value containing `"` both renders correctly and does not throw.
  const layers = { l: { text: '{{v}}' } };
  const result = renderLayers(layers, { v: 'He said "hi"' }) as any;
  assertEqual(result.l.text, 'He said "hi"', 'A value containing a double quote renders verbatim');
})();

(function testBackslashDoesNotCrash() {
  // The old JSON.parse pipeline also crashed on a value containing a lone backslash.
  const layers = { l: { text: '{{v}}' } };
  const result = renderLayers(layers, { v: 'a\\b\\c' }) as any;
  assertEqual(result.l.text, 'a\\b\\c', 'A value containing backslashes renders verbatim');
})();

(function testNewlineInValuePreserved() {
  // Placid forces line breaks in `text` with a real newline (sent as \n over JSON). The layer
  // object is built in JS and only JSON.stringified at the very end of generateMedia, so a real
  // newline in the rendered leaf must survive as a real newline here.
  const layers = { l: { text: 'Line1\n{{v}}' } };
  const result = renderLayers(layers, { v: 'Line2' }) as any;
  assertEqual(result.l.text, 'Line1\nLine2', 'A newline embedded in a leaf value is preserved');
})();

// --- renderLayers: structural passthrough ------------------------------------------------

(function testNonStringLeavesPassedThroughUnchanged() {
  const layers = { n: 42, b: true, z: null, f: 1.5, s: '{{v}}', nested: { x: 7 } };
  const result = renderLayers(layers, { v: 'X' }) as any;
  assertEqual(result.n, 42, "Number leaves are not stringified or escaped");
  assertEqual(result.b, true, "Boolean leaves are not stringified or escaped");
  assertEqual(result.z, null, "Null leaves are not stringified or escaped");
  assertEqual(result.f, 1.5, "Float leaves are not stringified or escaped");
  assertEqual(result.s, 'X', "String leaves are still interpolated");
  assertEqual(result.nested.x, 7, "Nested non-string leaves inside objects are preserved");
})();

(function testNestedObjectsAndArraysRecursivelyRendered() {
  const layers = {
    page: {
      layers: {
        title: { text: '{{event.title}}' },
        badges: [
          { text: '{{student.givenName}}' },
          { text: '{{student.surname}}' },
        ],
      },
    },
  };
  const result = renderLayers(layers, {
    event: { title: 'AI & Robotics' },
    student: { givenName: "D'Souza", surname: 'Lee' },
  }) as any;
  assertEqual(result.page.layers.title.text, 'AI & Robotics', 'Nested object string leaves are rendered');
  assertEqual(
    result.page.layers.badges.map((b: any) => b.text),
    ["D'Souza", 'Lee'],
    'Array-of-object string leaves are rendered recursively',
  );
})();

(function testNoPlaceholdersPassThroughUnchanged() {
  const layers = { l: { text: 'Plain text with no template', font: 'Inter' } };
  const result = renderLayers(layers, {}) as any;
  assertEqual(
    result,
    { l: { text: 'Plain text with no template', font: 'Inter' } },
    'Leaves without placeholders are returned unchanged',
  );
})();

(function testMultiplePlaceholdersInOneLeaf() {
  const layers = { l: { text: '{{a}} + {{b}} = {{c}}' } };
  const result = renderLayers(layers, { a: 'Tom & Jerry', b: '<x>', c: "O'Brien" }) as any;
  assertEqual(
    result.l.text,
    "Tom & Jerry + <x> = O'Brien",
    'Multiple placeholders in one leaf all interpolate without escaping',
  );
})();

(function testContextPathNavigation() {
  const layers = { l: { text: '{{student.givenName}} {{event.title}}' } };
  const result = renderLayers(layers, {
    student: { givenName: "O'Brien" },
    event: { title: 'Research & Development' },
  }) as any;
  assertEqual(result.l.text, "O'Brien Research & Development", 'Dot-path navigation into context objects works');
})();

// --- renderLayers: now -------------------------------------------------------------------

(function testNowResolvesToDate() {
  const result = renderLayers({ l: { text: '{{now}}' } }, {}) as any;
  assert(typeof result.l.text === 'string' && result.l.text.length > 0, '{{now}} resolves to a non-empty string');
  assert(/\d{4}/.test(result.l.text), '{{now}} resolves to something that looks like a date');
})();

(function testNowIsConsistentWithinOneCall() {
  // generateMedia previously created a single `new Date()` for all layers; renderLayers must
  // preserve that so a certificate that repeats {{now}} doesn't show two different timestamps.
  const result = renderLayers({ a: { text: '{{now}}' }, b: { text: '{{now}}' } }, {}) as any;
  assertEqual(result.a.text, result.b.text, 'All {{now}} interpolations in one renderLayers call share one Date');
})();

// --- renderLayers: returns a JS object safe to JSON.stringify ----------------------------

(function testResultIsObjectAndJsonSerializable() {
  const layers = { l: { text: '{{v}}' }, n: 1, arr: [{ t: '{{v}}' }] };
  const result = renderLayers(layers, { v: 'He said "hi" & she said \'bye\'' });
  assert(typeof result === 'object' && result !== null, 'renderLayers returns a JS object, not a JSON string');
  let serialized: string | null = null;
  try {
    serialized = JSON.stringify(result);
  } catch (e) {
    failures += 1;
    console.error(`FAILED: renderLayers result is JSON-serializable (${(e as Error).message})`);
  }
  assert(
    serialized !== null && serialized!.includes("& she said 'bye'") && serialized!.includes('\\"hi\\"'),
    'renderLayers result JSON-serializes and contains the raw (unescaped) &, \', and " characters',
  );
  assert(
    serialized !== null && !NO_ENTITY.test(serialized!),
    'No HTML entities appear in the JSON-serialized renderLayers result',
  );
})();

// --- generateMedia: end-to-end pipeline sends unescaped text to Placid -------------------

type CapturedRequest = { url: string; method: string; body: string; headers: Record<string, string> };

function stubFetch(response: object): { captured: CapturedRequest[]; restore: () => void } {
  const captured: CapturedRequest[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => ({
    json: async () => {
      captured.push({
        url: typeof url === 'string' ? url : url.url,
        method: init?.method,
        body: init?.body ?? '',
        headers: init?.headers ?? {},
      });
      return response;
    },
  })) as typeof globalThis.fetch;
  return { captured, restore: () => { globalThis.fetch = original; } };
}

async function testGenerateMediaSendsUnescapedText(): Promise<void> {
  const { captured, restore } = stubFetch({ polling_url: 'https://example.com/poll/1' });
  try {
    const pollingUrl = await generateMedia(
      'tpl-1',
      FileTypeType.IMAGE,
      { name_layer: { text: '{{student.givenName}} {{student.surname}}' } },
      { student: { givenName: "O'Brien", surname: 'Tom & Jerry' } },
    );

    assertEqual(pollingUrl, 'https://example.com/poll/1', 'generateMedia returns the polling_url from Placid');
    assertEqual(captured.length, 1, 'generateMedia makes exactly one POST to Placid');
    assert(
      captured[0].url === 'https://api.placid.app/api/rest/images',
      'generateMedia POSTs to the IMAGE endpoint for FileTypeType.IMAGE',
    );
    assertEqual(captured[0].method, 'POST', 'The request method is POST');
    assertEqual(
      captured[0].headers.Authorization,
      'Bearer test',
      'The Authorization header uses the configured Placid API token',
    );

    const body = JSON.parse(captured[0].body);
    assertEqual(body.template_uuid, 'tpl-1', 'The request body carries the template_uuid');
    assertEqual(
      body.layers.name_layer.text,
      "O'Brien Tom & Jerry",
      'The body sent to Placid contains the unescaped text (no HTML entities)',
    );
    assert(
      !NO_ENTITY.test(captured[0].body),
      'No HTML entities appear anywhere in the POSTed JSON body',
    );
  } finally {
    restore();
  }
}

async function testGenerateMediaVideoWrapsInClips(): Promise<void> {
  const { captured, restore } = stubFetch({ polling_url: 'https://example.com/poll/v' });
  try {
    const pollingUrl = await generateMedia(
      'tpl-v',
      FileTypeType.VIDEO,
      { l: { text: '{{v}}' } },
      { v: "O'Brien & Co." },
    );
    assertEqual(pollingUrl, 'https://example.com/poll/v', 'VIDEO generation returns the polling_url');
    const body = JSON.parse(captured[0].body);
    assert(Array.isArray(body.clips), 'VIDEO request body is wrapped in a clips array');
    assertEqual(body.clips[0].template_uuid, 'tpl-v', 'The clip carries the template_uuid');
    assertEqual(body.clips[0].layers.l.text, "O'Brien & Co.", 'VIDEO clip layers carry the unescaped text');
    assert(captured[0].url === 'https://api.placid.app/api/rest/videos', 'VIDEO POSTs to the videos endpoint');
  } finally {
    restore();
  }
}

async function testGenerateMediaPdfWrapsInPages(): Promise<void> {
  const { captured, restore } = stubFetch({ polling_url: 'https://example.com/poll/p' });
  try {
    const pollingUrl = await generateMedia(
      'tpl-p',
      FileTypeType.PDF,
      { l: { text: '{{v}}' } },
      { v: "O'Brien & Co." },
    );
    assertEqual(pollingUrl, 'https://example.com/poll/p', 'PDF generation returns the polling_url');
    const body = JSON.parse(captured[0].body);
    assert(Array.isArray(body.pages), 'PDF request body is wrapped in a pages array');
    assertEqual(body.pages[0].template_uuid, 'tpl-p', 'The page carries the template_uuid');
    assertEqual(body.pages[0].layers.l.text, "O'Brien & Co.", 'PDF page layers carry the unescaped text');
    assert(captured[0].url === 'https://api.placid.app/api/rest/pdfs', 'PDF POSTs to the pdfs endpoint');
  } finally {
    restore();
  }
}

async function testGenerateMediaReturnsIdUrlWhenNoPollingUrl(): Promise<void> {
  const { captured, restore } = stubFetch({ id: 'abc123' });
  try {
    const url = await generateMedia('tpl-1', FileTypeType.IMAGE, { l: { text: '{{v}}' } }, { v: 'x' });
    assertEqual(url, 'https://api.placid.app/api/rest/images/abc123', 'Falls back to /{endpoint}/{id} when polling_url is absent but id is present');
  } finally {
    restore();
  }
}

async function testGenerateMediaThrowsWhenPlacidReturnsNeitherPollingUrlNorId(): Promise<void> {
  const { restore } = stubFetch({ message: 'something went wrong' });
  try {
    let threw = false;
    let errMsg = '';
    try {
      await generateMedia('tpl-1', FileTypeType.IMAGE, { l: { text: '{{v}}' } }, { v: 'x' });
    } catch (e) {
      threw = true;
      errMsg = (e as Error).message;
    }
    assert(threw, 'generateMedia throws when Placid returns neither polling_url nor id');
    assertEqual(errMsg, 'API did not return polling URL.', 'The error message matches the prior behavior (no regression)');
  } finally {
    restore();
  }
}

async function main(): Promise<void> {
  await testGenerateMediaSendsUnescapedText();
  await testGenerateMediaVideoWrapsInClips();
  await testGenerateMediaPdfWrapsInPages();
  await testGenerateMediaReturnsIdUrlWhenNoPollingUrl();
  await testGenerateMediaThrowsWhenPlacidReturnsNeitherPollingUrlNorId();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
