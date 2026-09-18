import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../Primitives.js';
import { ICONS, type IconName } from './index.js';

/**
 * An icon, coloured by the text around it.
 *
 * Fluent icons ship with a hardcoded near-black fill, so dropping one in as an
 * `<img>` on this dark interface renders it invisible. Laid over a mask and
 * painted with `currentColor` instead, an icon takes the colour of whatever it
 * sits in, which is what the design needs: the same icon is muted in a sidebar
 * and full-strength in a toolbar.
 *
 * `background-color: currentColor` with `mask-image` is the standard way to do
 * this without editing every vendored file.
 */
export function MaskIcon({
  name,
  className,
  style,
}: {
  readonly name: IconName;
  readonly className?: string;
  readonly style?: CSSProperties;
}): ReactNode {
  return (
    <span
      aria-hidden
      className={cx('inline-block shrink-0 bg-current', className)}
      style={{
        maskImage: `url("${ICONS[name]}")`,
        WebkitMaskImage: `url("${ICONS[name]}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        ...style,
      }}
    />
  );
}
