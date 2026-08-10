/**
 * Idempotent, manually-run setup for the Attio "Alumni Interactions" list schema.
 *
 * NOT part of the nightly sync — schema changes to Attio happen when a human runs this,
 * not automatically. Safe to re-run: lists existing lists/attributes first and only
 * creates what's missing.
 *
 * Required token scopes: record_permission:read-write, object_configuration:read,
 * list_entry:read-write, list_configuration:read-write.
 *
 * Run with:
 *   npx ts-node scripts/attio-setup.ts
 */
import config from '../src/config';
import { createAttioClient, AttioApiError } from '../src/attio/client';

const LIST_NAME = 'Alumni Interactions';
const LIST_PARENT_OBJECT = 'people';

interface AttributeSpec {
  apiSlug: string;
  title: string;
  type: string;
  isUnique?: boolean;
  selectOptions?: string[];
}

const ATTRIBUTES: AttributeSpec[] = [
  {
    apiSlug: 'interaction_id', title: 'Interaction ID', type: 'text', isUnique: true,
  },
  {
    apiSlug: 'participation_type', title: 'Participation Type', type: 'select', selectOptions: ['Mentor', 'Student'],
  },
  {
    apiSlug: 'event_type', title: 'Event Type', type: 'select', selectOptions: ['CodeDay Event', 'Labs'],
  },
  { apiSlug: 'event', title: 'Event', type: 'text' },
  { apiSlug: 'participated_at', title: 'Participated At', type: 'date' },
];

interface AttioListSummary {
  id: { list_id: string };
  api_slug: string;
  name: string;
}

interface AttioAttributeSummary {
  id: { attribute_id: string };
  api_slug: string;
  type: string;
}

interface AttioSelectOption {
  id: { option_id: string };
  title: string;
}

async function findListBySlug(
  client: ReturnType<typeof createAttioClient>,
  slug: string,
): Promise<AttioListSummary | null> {
  const { data } = await client.get<{ data: AttioListSummary[] }>('/v2/lists');
  return data.find((l) => l.api_slug === slug) ?? null;
}

async function ensureList(
  client: ReturnType<typeof createAttioClient>,
  slug: string,
): Promise<{ listId: string; created: boolean }> {
  const existing = await findListBySlug(client, slug);
  if (existing) return { listId: existing.id.list_id, created: false };

  const { data } = await client.write<{ data: AttioListSummary }>('POST', '/v2/lists', {
    data: {
      name: LIST_NAME,
      api_slug: slug,
      parent_object: LIST_PARENT_OBJECT,
      workspace_access: 'full-access',
      workspace_member_access: [],
    },
  }, 'attio-setup:create-list');
  return { listId: data.id.list_id, created: true };
}

async function ensureAttribute(
  client: ReturnType<typeof createAttioClient>,
  listId: string,
  existingAttributes: AttioAttributeSummary[],
  spec: AttributeSpec,
): Promise<{ created: boolean; attributeId: string }> {
  const existing = existingAttributes.find((a) => a.api_slug === spec.apiSlug);
  if (existing) return { created: false, attributeId: existing.id.attribute_id };

  const { data } = await client.write<{ data: { id: { attribute_id: string } } }>(
    'POST',
    `/v2/lists/${listId}/attributes`,
    {
      data: {
        title: spec.title,
        description: `Managed by scripts/attio-setup.ts for the alumni interactions sync.`,
        api_slug: spec.apiSlug,
        type: spec.type,
        is_unique: spec.isUnique ?? false,
        // Attio rejects is_required: true on list attributes ("Required attributes are
        // not permitted on lists"), but the field itself must still be present and false.
        is_required: false,
        is_multiselect: false,
        config: {},
      },
    },
    `attio-setup:create-attribute:${spec.apiSlug}`,
  );
  return { created: true, attributeId: data.id.attribute_id };
}

async function ensureSelectOptions(
  client: ReturnType<typeof createAttioClient>,
  listId: string,
  attributeId: string,
  desiredOptions: string[],
): Promise<{ created: string[]; skipped: string[] }> {
  const { data: existingOptions } = await client.get<{ data: AttioSelectOption[] }>(
    `/v2/lists/${listId}/attributes/${attributeId}/options`,
  );
  const existingTitles = new Set(existingOptions.map((o) => o.title));

  const created: string[] = [];
  const skipped: string[] = [];
  for (const title of desiredOptions) {
    if (existingTitles.has(title)) {
      skipped.push(title);
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await client.write(
      'POST',
      `/v2/lists/${listId}/attributes/${attributeId}/options`,
      { data: { title } },
      `attio-setup:create-option:${title}`,
    );
    created.push(title);
  }
  return { created, skipped };
}

async function main(): Promise<void> {
  if (!config.attio.apiToken) {
    throw new Error('The ATTIO_API_TOKEN environment variable is required to run attio-setup.');
  }
  if (!config.attio.alumniListId) {
    throw new Error('The ATTIO_ALUMNI_LIST environment variable is required to run attio-setup (pick a slug, e.g. "alumni_interactions").');
  }

  const client = createAttioClient(config.attio.apiToken);
  const listSlug = config.attio.alumniListId;

  const { listId, created: listCreated } = await ensureList(client, listSlug);
  console.log(listCreated
    ? `Created list "${LIST_NAME}" (slug: ${listSlug}, id: ${listId}).`
    : `List "${LIST_NAME}" (slug: ${listSlug}, id: ${listId}) already exists, skipping creation.`);

  const { data: existingAttributes } = await client.get<{ data: AttioAttributeSummary[] }>(
    `/v2/lists/${listId}/attributes`,
  );

  for (const spec of ATTRIBUTES) {
    // eslint-disable-next-line no-await-in-loop
    const { created, attributeId } = await ensureAttribute(client, listId, existingAttributes, spec);
    console.log(created
      ? `Created attribute "${spec.apiSlug}" (${spec.type}).`
      : `Attribute "${spec.apiSlug}" already exists, skipping creation.`);

    if (spec.selectOptions) {
      // eslint-disable-next-line no-await-in-loop
      const { created: createdOptions, skipped: skippedOptions } = await ensureSelectOptions(
        client,
        listId,
        attributeId,
        spec.selectOptions,
      );
      if (createdOptions.length > 0) console.log(`  Created options for "${spec.apiSlug}": ${createdOptions.join(', ')}`);
      if (skippedOptions.length > 0) console.log(`  Options already present for "${spec.apiSlug}": ${skippedOptions.join(', ')}`);
    }
  }

  console.log('\nDone. If ATTIO_ALUMNI_LIST was a newly-picked slug, make sure it\'s set in the environment used by the nightly sync job too.');
}

main().catch((ex) => {
  if (ex instanceof AttioApiError) {
    console.error(`Attio API error ${ex.status}: ${JSON.stringify(ex.body)}`);
  } else {
    console.error(ex);
  }
  process.exit(1);
});
