import { createContext, useContext } from 'react';

/**
 * Slots in the fixed top bar. Pages render their title, actions and toolbar into them through
 * PageHeader (portals), so the top bar sits outside the scroll container and never scrolls.
 */
export interface TopBarSlots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  toolbar: HTMLElement | null;
}

export const TopBarContext = createContext<TopBarSlots | null>(null);

export function useTopBar(): TopBarSlots | null {
  return useContext(TopBarContext);
}
