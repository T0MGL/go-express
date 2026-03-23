import { useEffect, useState, useRef } from 'react';

export function useAnimatedNumber(target: number, duration = 600) {
  const [current, setCurrent] = useState(0);
  const rafId = useRef(0);

  useEffect(() => {
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
  }, [target, duration]);

  return current;
}
