/**
 * Fire rising off a word, in the colours of the limit tier it sits under
 * (`fire.ts`). Used for a limit hand's title on the score screen and for the
 * value in a "Best hand" box; rendered only where the hand is a limit hand.
 *
 * Goes inside a `.blaze`, beside the word that burns, which carries
 * `data-burns`. The canvas is laid out over the blaze, which is exactly as
 * wide as the word; the colours come from the nearest `[data-tier]`.
 */
import { useEffect, useRef } from 'react';
import { startFire } from './fire';

export function Flames({ text }: {
  /** The burning word's text: the fire is redrawn when it changes. */
  text: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const blaze = canvas?.parentElement;
    const word = blaze?.querySelector<HTMLElement>('[data-burns]');
    const palette = blaze?.closest<HTMLElement>('[data-tier]');
    if (!canvas || !word || !palette) return;
    return startFire(canvas, word, palette);
  }, [text]);
  return <canvas ref={ref} className="flames" aria-hidden="true" />;
}

/**
 * A word that burns when `burn` is set: the word in a `.blaze` with its fire,
 * else the word alone. For a "Best hand" box's value, whose fire follows the
 * box's own `data-tier`.
 */
export function BurningWord({ text, burn, className }: {
  text: string;
  burn: boolean;
  className: string;
}) {
  if (!burn) return <span className={className}>{text}</span>;
  return (
    <span className="blaze">
      <Flames text={text} />
      <span className={className} data-burns="">{text}</span>
    </span>
  );
}
