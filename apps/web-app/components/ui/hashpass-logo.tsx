import Image from 'next/image';
import type { ComponentProps } from 'react';

/**
 * The canonical HASHPASS mark for product-facing UI.
 *
 * Keep the Hashpass Club artwork in browser-icon contexts only (manifest,
 * favicon, and app shortcuts). Content UI must use this asset so it remains
 * recognisably HASHPASS across the site.
 */
export const HASHPASS_LOGO_SRC = '/logo-hashpass.svg' as const;

type HashpassLogoProps = Omit<ComponentProps<typeof Image>, 'src' | 'alt'> & {
  alt?: string;
};

export function HashpassLogo({ alt = 'HASHPASS', ...props }: HashpassLogoProps) {
  return <Image src={HASHPASS_LOGO_SRC} alt={alt} {...props} />;
}
