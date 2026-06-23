# Testing the Weekly Low Standup Report

This guide explains how to test the weekly Slack notification for students with consecutive low standup scores.

## Overview

The automation (`weeklyLowStandupReport.ts`) runs every Monday at 9 AM and posts to the `#stats` Slack channel. Before deploying, you should test it to ensure:
- The message formatting looks correct
- The Slack integration works
- The channel lookup succeeds
- No real students are pinged accidentally

## Prerequisites

1. **Environment variables** set up (copy `.env.test.example` to `.env` or use your real `.env`)
2. **Database access** to an active event with Slack integration
3. **Slack workspace access** - you need to be a member of the workspace

## Test Methods

### Method 1: Dry Run (Preview Only) ⭐ **Recommended First Step**

Preview the message without posting to Slack:

```bash
npx ts-node scripts/testWeeklyStandupReport.ts --dry-run
```

This will:
- ✅ Show the exact JSON that would be sent to Slack
- ✅ Validate your Slack credentials
- ✅ Find the channel
- ❌ NOT post anything to Slack

**Output:**
```json
{
  "channel": "C01234567",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⚠️ Weekly Low Standup Report [TEST]",
        ...
      }
    },
    ...
  ]
}
```

### Method 2: Post to Test Channel

Create a private test channel (e.g., `#test-notifications`) and post there:

```bash
npx ts-node scripts/testWeeklyStandupReport.ts --channel=test-notifications
```

This will:
- ✅ Post an actual message to Slack
- ✅ Use fake student data (no real students pinged)
- ✅ Let you see the formatted message in Slack
- ✅ Test the full integration

### Method 3: Post to #stats with Fake Data

When you're confident the formatting is correct:

```bash
npx ts-node scripts/testWeeklyStandupReport.ts --channel=stats
```

**⚠️ Note:** This posts to the real `#stats` channel but uses fake test data:
- Student names: "Alice TestStudent", "Bob DemoUser", "Charlie SampleStudent"
- No Slack IDs (so no @mentions)
- Clearly marked as **[TEST]** in the header

### Method 4: Use Real Data (Not Yet Implemented)

```bash
npx ts-node scripts/testWeeklyStandupReport.ts --channel=test-notifications --use-real-data
```

Currently falls back to fake data. To implement real data fetching, see TODO in script.

## What the Test Message Looks Like

The message will appear in Slack as:

---

**⚠️ Weekly Low Standup Report [TEST]**

**Event:** CodeDay Labs Test  
**Report Date:** June 16, 2026  
**Mode:** Fake Test Data

The following students had **two consecutive standup scores under 2** in the previous week:

• Alice TestStudent (Alice TestStudent)  
• Bob DemoUser (Bob DemoUser)  
• Charlie SampleStudent (Charlie SampleStudent)

*Total flagged students: 3 | This is a TEST message*

---

## Troubleshooting

### "No active event with Slack integration found"

Your database doesn't have an event with:
- `isActive = true`
- `slackWorkspaceAccessToken` set
- `slackWorkspaceId` set

**Fix:** Check your database or create a test event with Slack credentials.

### "Channel #test-notifications not found"

The channel doesn't exist or the bot doesn't have access.

**Fix:** 
1. Create the channel in Slack
2. Invite the bot to the channel: `/invite @BotName`
3. Or use `--channel=stats` if you know #stats exists

### "Available channels:" shows no channels

The Slack token might not have the right permissions.

**Fix:** Ensure the Slack app has `channels:read` and `groups:read` scopes.

## Next Steps

After successful testing:
1. ✅ Verify message formatting looks good
2. ✅ Confirm the [TEST] marker is clear
3. ✅ Remove test messages from channels (or ignore them)
4. ✅ The automation will run automatically on Mondays at 9 AM

## Running the Real Automation Manually

To trigger the actual automation (not the test script):

```bash
npx ts-node -e "require('./dist/automation/tasks/weeklyLowStandupReport').default()"
```

This uses real data and posts to #stats without any test markers.
