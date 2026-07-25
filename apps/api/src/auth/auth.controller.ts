import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { MockLoginDto, OtpRequestDto, UpgradeDto, VerifyLoginDto } from "@pribor/contracts";
import { AuthService } from "./auth.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Giriş için email'e OTP gönder. */
  @Post("otp/request")
  async otpRequest(@Body() body: unknown) {
    const parsed = OtpRequestDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Email düzgün deyil");
    return this.auth.requestOtp(parsed.data.email, "login");
  }

  /** OTP ile giriş: kod doğrulanırsa hesap açılır. Kod geçersizse 401. */
  @Post("verify-login")
  async verifyLogin(@Body() body: unknown) {
    const parsed = VerifyLoginDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Giriş məlumatları yanlışdır");
    const user = await this.auth.verifyLogin(
      parsed.data.email,
      parsed.data.name,
      parsed.data.code,
    );
    if (!user) throw new UnauthorizedException("Kod yanlış və ya vaxtı bitib");
    return user;
  }

  /** Mock giriş (test/geriye dönük) — OTP'siz. Frontend verify-login kullanır. */
  @Post("mock-login")
  async mockLogin(@Body() body: unknown) {
    const parsed = MockLoginDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Giriş məlumatları yanlışdır",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return this.auth.mockLogin(parsed.data);
  }

  /** Mock ödeme sonrası paket yükseltme (sınırsız ilan). */
  @Post("upgrade")
  async upgrade(@Body() body: unknown) {
    const parsed = UpgradeDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Geçersiz yükseltme isteği");
    return this.auth.upgrade(parsed.data.userId, parsed.data.planCode);
  }

  /** Oturum tazeleme — istemci localStorage'daki kullanıcıyı doğrular. */
  @Get(":id")
  async me(@Param("id") id: string) {
    if (!UUID_RE.test(id)) throw new BadRequestException("Geçersiz kullanıcı kimliği");
    return this.auth.getAuthUser(id);
  }
}
