// Content script in Gmail. The only code that talks to InboxSDK lives in src/gmail/ (D-009).
import * as InboxSDK from '@inboxsdk/core';
import type { ThreadRowView } from '@inboxsdk/core';
import { isBroadcast } from '../core/messages';
import { ask } from './bridge';
import { ComposeSession } from './compose';
import { GmailEnv } from './env';
import { MessageViews } from './message-views';
import { ThreadRowMarks } from './rows';

async function main(): Promise<void> {
  // D-010: both switches off; DNR rules in the service worker block what they leave behind.
  const sdk = await InboxSDK.load(2, __APP_ID__, { appName: 'MailPulse', eventTracking: false, globalErrorLogging: false });
  const env = new GmailEnv(sdk.User.getEmailAddress(), ask);
  await env.refresh();
  const rows = new ThreadRowMarks(env, ask);
  const messages = new MessageViews(env, ask);

  sdk.Compose.registerComposeViewHandler((view) => {
    try {
      new ComposeSession(view, env, ask).start();
    } catch {
      // Fail open: the compose window works exactly as without MailPulse.
    }
  });
  sdk.Lists.registerThreadRowViewHandler((row: ThreadRowView) => {
    rows.add(row).catch(() => undefined);
  });
  sdk.Conversations.registerMessageViewHandler((view) => {
    try {
      messages.handle(view);
    } catch {
      // A broken mark must never break reading mail.
    }
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isBroadcast(message)) return;
    if (message.type === 'mp:marksChanged') {
      rows.refresh();
      messages.refresh();
    } else {
      void env.refresh().then(() => rows.refresh());
    }
  });
}

main().catch(() => undefined);
