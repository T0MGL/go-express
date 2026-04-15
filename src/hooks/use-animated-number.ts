import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

// Counts up from 0 to `target` over `duration` ms using ease-out cubic. If the
// user prefers reduced motion we jump straight to the final value so the UI
// never animates when it shouldn't. Re-runs whenever `target` changes, which
// is what we want for live counters fed by queries.
export function useAnimatedNumber(target: number, duration = 1200) {
  const [current, setCurrent] = useState(0);
  const rafId = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      setCurrent(target);
      return;
    }

    if (target === 0) {
      setCurrent(0);
      return;
    }

    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    }

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [target, duration, shouldReduceMotion]);

  return current;
}
