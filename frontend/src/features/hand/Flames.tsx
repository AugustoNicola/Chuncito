/**
 * The fire behind a limit hand's title, in the tier's own colours: flames
 * rising off the letters themselves (`fire.ts`). Rendered only for a hand with
 * a title, so an ordinary hand never pays for it.
 *
 * Sits in `.score__blaze` beside the title, and finds it there: the canvas is
 * laid out over the blaze, which is exactly as wide as the word.
 */
import { useEffect, useRef } from 'react';
import { startFire } from './fire';

export function Flames({ text }: {
  /** The title's text: the fire is redrawn when it changes. */
  text: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const blaze = canvas?.parentElement;
    const title = blaze?.querySelector<HTMLElement>('.score__title');
    const palette = blaze?.closest<HTMLElement>('.score');
    if (!canvas || !title || !palette) return;
    return startFire(canvas, title, palette);
  }, [text]);
  return <canvas ref={ref} className="flames" aria-hidden="true" />;
}
