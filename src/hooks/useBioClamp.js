import { useLayoutEffect } from 'react';

export function useBioClamp(containerRef, deps) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const bios = [...container.querySelectorAll('.tutor-card__bio')];
      // All reads first, then all writes: one layout instead of one per card.
      const overflowing = bios.map((bio) => bio.scrollHeight > bio.clientHeight + 1);
      bios.forEach((bio, i) => {
        bio.closest('.tutor-card').classList.toggle('has-more', overflowing[i]);
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
    };
  }, deps);
}
