import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { MockLoginDto, UpgradeDto } from "@pribor/contracts";
import { AuthService } from "./auth.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Mock giriş/kayıt — telefon + ad. Rol sunucuda belirlenir (ADMIN_PHONES). */
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
