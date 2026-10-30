import type { Status } from '../core/messages';

/** One problem the popup and options page explain, with the steps that fix it (brief Part C). */
export interface Problem {
  id: 'setup' | 'offline' | 'token' | 'origin' | 'error' | 'public' | 'paused' | 'appId';
  tone: 'bad' | 'warn';
  title: string;
  detail: string;
  fix: string[];
  /** What the main button next to the steps does. */
  action: 'settings' | 'retry' | null;
}

export function problemsOf(status: Status): Problem[] {
  const problems: Problem[] = [];
  switch (status.connection) {
    case 'unconfigured':
      problems.push({
        id: 'setup',
        tone: 'warn',
        title: 'Not set up yet',
        detail: 'The extension has no API token, so it cannot talk to MailPulse.',
        fix: ['In the MailPulse dashboard, open Extension tokens and create a token.', 'Paste it in the extension settings and click Save and connect.'],
        action: 'settings',
      });
      break;
    case 'offline':
      problems.push({
        id: 'offline',
        tone: 'bad',
        title: 'MailPulse is not running',
        detail: `No answer from ${status.backendUrl}. Emails are sent without tracking until it is back.`,
        fix: [
          'Start Docker Desktop and wait until the engine is running.',
          'In PowerShell, in the MailPulse folder, run .\\scripts\\dev.ps1.',
          'Check that the backend URL in the extension settings matches the dashboard address.',
        ],
        action: 'retry',
      });
      break;
    case 'unauthorized':
      problems.push({
        id: 'token',
        tone: 'bad',
        title: 'API token invalid',
        detail: 'MailPulse rejected the saved token: it was revoked or replaced.',
        fix: ['In the dashboard, open Extension tokens and create a new token.', 'Paste it in the extension settings and click Save and connect.'],
        action: 'settings',
      });
      break;
    case 'origin-rejected':
      problems.push({
        id: 'origin',
        tone: 'bad',
        title: 'This extension is not allowed yet',
        detail: 'The backend does not accept requests from this extension ID.',
        fix: [`Add ${status.extensionOrigin} to MAILPULSE_EXTENSION_ORIGINS in infra\\.env.`, 'Restart MailPulse: .\\scripts\\dev.ps1.'],
        action: 'retry',
      });
      break;
    case 'error':
      problems.push({
        id: 'error',
        tone: 'bad',
        title: 'MailPulse reported a problem',
        detail: status.message ?? 'The backend gave an unexpected answer.',
        fix: ['Look at the backend log: docker compose -p mailpulse logs backend.', 'Then test the connection again.'],
        action: 'retry',
      });
      break;
    case 'ok':
      break;
  }
  if (status.connection === 'ok' && status.publicCheck === 'down') {
    problems.push({
      id: 'public',
      tone: 'bad',
      title: 'Public address down',
      detail: `Recipients cannot reach ${status.config?.publicBaseUrl ?? 'the public address'}, so their opens and clicks are not recorded.`,
      fix: [
        'Make sure Tailscale is running and signed in on this PC.',
        'In PowerShell, in the MailPulse folder, run .\\scripts\\funnel.ps1.',
        'Keep the PC on and awake while you wait for opens.',
      ],
      action: 'retry',
    });
  }
  if (status.paused) {
    problems.push({
      id: 'paused',
      tone: 'warn',
      title: 'Tracking is paused',
      detail: 'New emails are sent without tracking.',
      fix: ['Turn on "Track emails I send" in the extension popup.'],
      action: null,
    });
  }
  if (!status.appIdSet) {
    problems.push({
      id: 'appId',
      tone: 'warn',
      title: 'No InboxSDK App ID',
      detail: 'Gmail shows an InboxSDK registration bar until the extension is built with an App ID.',
      fix: [
        'Register for free at register.inboxsdk.com.',
        'Put MAILPULSE_INBOXSDK_APP_ID=<id> in infra\\.env.',
        'Run npm run build in the extension folder and reload the extension.',
      ],
      action: null,
    });
  }
  return problems;
}
