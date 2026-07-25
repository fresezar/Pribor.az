import { z } from "zod";

/** OTP kod isteği — doğrulama numarasına SMS kodu gönderir. */
export const OtpRequestDto = z.object({
  phone: z.string().min(5).max(20),
});
export type OtpRequestDto = z.infer<typeof OtpRequestDto>;

export const OtpRequestResult = z.object({
  sent: z.literal(true),
  expiresInSec: z.number().int(),
  /** Yalnızca non-production: gerçek SMS yokken kod arayüzde gösterilebilsin. */
  devCode: z.string().optional(),
});
export type OtpRequestResult = z.infer<typeof OtpRequestResult>;
