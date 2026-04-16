import { useEffect, useState } from 'react';

/**
 * Detects if the app is running as an installed PWA (standalone mode).
 *
 * Covers:
 * - iOS Safari: `navigator.standalone === true`
 * - Android / Chrome / Edge: `display-mode: standalone` media query
 * - Android TWA: referrer `android-app://`
 */
export function useIsStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkStandalone());

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = () => setIsStandalone(checkStandalone());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isStandalone;
}

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const androidTwa = document.referrer.startsWith('android-app://');
  return mq || iosStandalone || androidTwa;
}
