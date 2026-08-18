import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSlackChannelId } from '../src/slack/findSlackChannelByName';

test('returns a configured channel ID without doing any lookup', async () => {
    const slack = {
        paginate: async () => {
            throw new Error('paginate should not be called when a configured channel id exists');
        },
    } as any;

    const result = await resolveSlackChannelId(slack, 'C123');

    assert.equal(result, 'C123');
});

test('returns null when no configured channel ID exists', async () => {
    const slack = {
        paginate: async () => {
            throw new Error('paginate should not be called when no configured channel id exists');
        },
    } as any;

    const result = await resolveSlackChannelId(slack, null);

    assert.equal(result, null);
});
