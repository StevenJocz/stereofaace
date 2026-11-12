import { z } from "zod";
import { httpsUrlSchema } from "@/lib/validation";

export const SOCIAL_KEYS = ["instagram", "youtube", "spotify", "soundcloud", "x"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

const text = (max: number) => z.string().trim().max(max);

export const siteSchema = z.object({ name: text(60).min(1), tagline: text(120), description: text(300) });
export const socialSchema = z.object({
  instagram: httpsUrlSchema.optional(),
  youtube: httpsUrlSchema.optional(),
  spotify: httpsUrlSchema.optional(),
  soundcloud: httpsUrlSchema.optional(),
  x: httpsUrlSchema.optional(),
});
export const newsletterSchema = z.object({ title: text(60).min(1), text: text(160) });
export const footerSchema = z.object({ text: text(300) });

export const siteSettingsSchema = z.object({
  site: siteSchema,
  social: socialSchema,
  newsletter: newsletterSchema,
  footer: footerSchema,
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
