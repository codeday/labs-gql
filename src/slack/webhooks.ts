import { Request, Response } from 'express';
import { makeDebug } from '../utils';
import { handleHuddleEvent } from './events/huddleHandler';

const DEBUG = makeDebug('slack:webhooks');

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    user: { id: string; team_id: string };
    channel: { id: string };
    huddle: { id: string };
    huddle_client?: 'desktop' | 'mobile' | null;
    [key: string]: unknown;
  };
}

/**
 * Handle Slack webhook events
 * https://api.slack.com/events-api
 */
export async function processSlackEvent(req: Request, res: Response): Promise<void> {
  const body = req.body as SlackEvent;
  const { type, challenge, event } = body;

  DEBUG('Received Slack event:', { type, eventType: event?.type });

  // URL verification (Slack sends this once during setup)
  if (type === 'url_verification' && challenge) {
    DEBUG('URL verification request received');
    res.json({ challenge });
    return;
  }

  // Event callback
  if (type === 'event_callback' && event) {
    // Acknowledge immediately (Slack requires response <3 seconds)
    res.status(200).send('OK');

    // Process event asynchronously
    setImmediate(async () => {
      try {
        if (event.type === 'user_huddle_changed' && event.huddle) {
          await handleHuddleEvent(event as any);
        } else {
          DEBUG(`Unhandled event type: ${event.type}`);
        }
      } catch (err) {
        DEBUG('Error processing Slack event:', err);
      }
    });

    return;
  }

  DEBUG('Unknown event type or missing data');
  res.status(400).send('Unknown event type');
}
