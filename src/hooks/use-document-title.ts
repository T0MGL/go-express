import { useEffect } from 'react';

const DEFAULT_TITLE = 'Go Express Paraguay | Servicio de Courier y Logistica Corporativa';

/**
 * Sets document.title on mount and restores the default on unmount.
 * Passing a falsy value keeps the current title untouched.
 */
export function useDocumentTitle(title: string | null | undefined, options?: { restoreOnUnmount?: boolean }) {
  const restore = options?.restoreOnUnmount ?? true;

  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title;
    return () => {
      if (restore) document.title = prev || DEFAULT_TITLE;
    };
  }, [title, restore]);
}
