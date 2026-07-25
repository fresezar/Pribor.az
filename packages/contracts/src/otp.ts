import { z } from "zod";

/** OTP kod isteği — email adresine doğrulama kodu gönderir. */
export const OtpRequestDto = z.object({
  email: z.string().email().max(255),
});
export type OtpRequestDto = z.infer<typeof OtpRequestDto>;

export const OtpRequestResult = z.object({
  sent: z.literal(true),
  expiresInSec: z.number().int(),
  /** Yalnızca non-production: gerçek SMS yokken kod arayüzde gösterilebilsin. */
  devCode: z.string().optional(),
});
export type OtpRequestResult = z.infer<typeof OtpRequestResult>;
