import { z } from 'zod';

/**
 * An image, and the flags that are images.
 *
 * Flags are not a separate concept in ORE Studio: a country carries an
 * `image_id`, and the image is an SVG in the assets service. That is why there
 * is no "flag" field anywhere — there is a reference to an image, and the image
 * happens to be a flag.
 *
 * The bytes arrive in whatever form the codec chose for a byte vector, so all
 * three plausible shapes are accepted and normalised at the boundary. Guessing
 * one would produce a route that works against one codec and silently returns
 * nothing against another.
 */
const imageBytes = z.union([
  z.string(),
  z.array(z.number().int().min(0).max(255)),
  z.instanceof(Uint8Array),
]);

export const imageSchema = z.object({
  version: z.int().nonnegative().default(0),
  image_id: z.string().default(''),
  tenant_id: z.string().default(''),
  key: z.string().default(''),
  description: z.string().default(''),
  mime_type: z.string().default('image/svg+xml'),
  data: imageBytes,
  modified_by: z.string().default(''),
  change_reason_code: z.string().default(''),
  change_commentary: z.string().default(''),
  performed_by: z.string().default(''),
  recorded_at: z.string().default(''),
});

export type WireImage = z.infer<typeof imageSchema>;

export const getImagesRequestSchema = z.object({
  image_ids: z.array(z.string()),
});

export const getImagesResponseSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().default(''),
  images: z.array(imageSchema).default([]),
});

/**
 * The bytes, as a buffer.
 *
 * A string is already the image text, an array of numbers is the bytes one by
 * one, and a `Uint8Array` is the codec's own binary type. All three end up the
 * same way, so nothing downstream has to care which arrived.
 */
export function imageBytesToBuffer(data: WireImage['data']): Buffer {
  if (typeof data === 'string') return Buffer.from(data, 'binary');
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(data);
}

/**
 * The bytes as text.
 *
 * Most of these images are SVG, which is text, so the useful form for an
 * inspection or a test is the markup rather than a byte count.
 */
export function imageBytesToText(data: WireImage['data']): string {
  if (typeof data === 'string') return data;
  return Buffer.from(data instanceof Uint8Array ? data : Uint8Array.from(data)).toString('utf8');
}
