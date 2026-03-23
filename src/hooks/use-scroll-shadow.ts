import { useEffect, useState, type RefObject } from 'react';

export function useScrollShadow(ref: RefObject<HTMLElement | null>) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleScroll = () => {
      setScrolled(el.scrollTop > 2);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [ref]);

  return scrolled;
}
