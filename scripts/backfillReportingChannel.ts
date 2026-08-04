import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import { registerDi } from '../src/di';
import { getSlackClientForEvent, resolveSlackChannelId } from '../src/slack';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const channelArg = args.find(arg => arg.startsWith('--channel='));
const channelName = channelArg ? channelArg.split('=')[1] : 'stats';

type EventRow = {
  id: string;
  name: string;
  slackWorkspaceId: string;
  slackWorkspaceAccessToken: string;
  slackReportingChannelId: string | null;
};

async function main() {
  registerDi();
  const prisma = Container.get(PrismaClient);

  const events = await prisma.event.findMany({
    where: {
      isActive: true,
      slackWorkspaceAccessToken: { not: null },
      slackWorkspaceId: { not: null },
    },
    select: {
      id: true,
      name: true,
      slackWorkspaceId: true,
      slackWorkspaceAccessToken: true,
      slackReportingChannelId: true,
    },
  }) as EventRow[];

  console.log(`Found ${events.length} active events with Slack integration.`);
  console.log(`Target channel name: #${channelName}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${force ? ' (force overwrite enabled)' : ''}`);

  let updated = 0;
  let skippedConfigured = 0;
  let skippedNotFound = 0;
  let failed = 0;

  for (const event of events) {
    if (event.slackReportingChannelId && !force) {
      skippedConfigured += 1;
      console.log(`- ${event.id}: already configured (${event.slackReportingChannelId}), skipping`);
      continue;
    }

    try {
      const slack = getSlackClientForEvent(event);
      const channelId = await resolveSlackChannelId(slack, event.slackReportingChannelId);

      if (!channelId) {
        skippedNotFound += 1;
        console.log(`- ${event.id}: no configured reporting channel ID, skipping`);
        continue;
      }

      if (dryRun) {
        updated += 1;
        console.log(`- ${event.id}: would set slackReportingChannelId=${channelId}`);
        continue;
      }

      await prisma.event.update({
        where: { id: event.id },
        data: { slackReportingChannelId: channelId } as any,
      });
      updated += 1;
      console.log(`- ${event.id}: set slackReportingChannelId=${channelId}`);
    } catch (error: any) {
      failed += 1;
      console.log(`- ${event.id}: failed (${error?.message || error})`);
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`updated: ${updated}`);
  console.log(`skipped (already configured): ${skippedConfigured}`);
  console.log(`skipped (channel not found): ${skippedNotFound}`);
  console.log(`failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});