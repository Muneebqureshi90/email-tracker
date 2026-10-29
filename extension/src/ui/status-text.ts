import type { Connection, Status } from '../core/messages';

const LABELS: Record<Connection, string> = {
  ok: 'Connected',
  unconfigured: 'Not set up',
  offline: 'MailPulse not reachable',
  unauthorized: 'API token rejected',
  'origin-rejected': 'Extension not allowed',
  error: 'Problem',
};

export function connectionLabel(status: Status): string {
  return LABELS[status.connection];
}

export function connectionTone(status: Status): 'good' | 'warn' | 'bad' {
  if (status.connection === 'ok') return status.paused ? 'warn' : 'good';
  return status.connection === 'unconfigured' ? 'warn' : 'bad';
}
