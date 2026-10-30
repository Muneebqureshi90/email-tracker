import { useEffect, useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mailpulse-theme';

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(choice: ThemeChoice = readChoice()): void {
  const dark = choice === 'dark' || (choice === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/** A short colour fade when the owner switches themes (never on page load, see theme-init.js). */
function applyWithTransition(choice: ThemeChoice): void {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  applyTheme(choice);
  window.setTimeout(() => root.classList.remove('theme-transition'), 250);
}

const listeners = new Set<() => void>();
let current: ThemeChoice | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): ThemeChoice {
  current ??= readChoice();
  return current;
}

/** Light, dark or follow Windows; remembered in this browser only. Every switch shares one state. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, snapshot);

  useEffect(() => {
    applyTheme(choice);
    if (choice !== 'system' || typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const follow = () => applyTheme('system');
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [choice]);

  const update = (next: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice lasts for this tab only
    }
    applyWithTransition(next);
    current = next;
    for (const notify of listeners) notify();
  };
  return [choice, update];
}
