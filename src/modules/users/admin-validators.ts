import { z } from "zod";
import { ROLES } from "./schema";

export const passwordSchema = z.string().min(12, "Mínimo 12 caracteres").max(200);

export const createUserSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  password: passwordSchema,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});
