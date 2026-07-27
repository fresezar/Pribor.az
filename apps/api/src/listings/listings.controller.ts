import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import {
  CreateListingDto,
  ListingQuery,
  parseRefNo,
  UpdateListingDto,
} from "@pribor/contracts";
import { AuthService } from "../auth/auth.service";
import { ListingsService } from "./listings.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("listings")
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Yönetim uçları (sil / redaktə / satıldı) oturum ister — bir ilanı yalnız
   * sahibi ya da admin değiştirebilir.
   * (MVP: kimlik query param'ı; Faz 3'te JWT guard'ı bunun yerini alır.)
   */
  private async requireUser(userId?: string): Promise<string> {
    if (!userId || !UUID_RE.test(userId)) {
      throw new UnauthorizedException("Bu əməliyyat üçün daxil olun");
    }
    if (!(await this.auth.exists(userId))) {
      throw new UnauthorizedException("Sessiya etibarsızdır — yenidən daxil olun");
    }
    return userId;
  }

  /**
   * İzleyici kimliği — VARSA doğrular, yoksa null döner (hata atmaz).
   * İlan detayı herkese açıktır: alıcının ilana bakmak için hesap açması
   * gereksiz sürtünmedir. Kimlik yalnızca "bu ilan benim mi / admin miyim"
   * (canManage) hesabı için kullanılır.
   */
  private async optionalUser(userId?: string): Promise<string | null> {
    if (!userId || !UUID_RE.test(userId)) return null;
    return (await this.auth.exists(userId)) ? userId : null;
  }

  /** GET /v1/listings?sort=deal&district=Yasamal&rooms=2&limit=12&offset=0 */
  @Get()
  async list(@Query() query: Record<string, string>) {
    const parsed = ListingQuery.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Geçersiz sorgu parametresi",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { items, total } = await this.listings.list(parsed.data);
    return { items, total, sort: parsed.data.sort };
  }

  /** Kullanıcının kendi ilanları — "Mənim elanlarım". */
  @Get("mine/:userId")
  async mine(@Param("userId") userId: string) {
    if (!UUID_RE.test(userId)) throw new BadRequestException("Geçersiz kullanıcı kimliği");
    return this.listings.myListings(userId);
  }

  /** İlan numarasıyla arama — herkese açık. */
  @Get("by-ref/:ref")
  async byRef(@Param("ref") ref: string, @Query("userId") userId?: string) {
    const viewer = await this.optionalUser(userId);
    const refNo = parseRefNo(ref);
    if (refNo == null) throw new BadRequestException("Elan nömrəsi düzgün deyil");
    return this.listings.findByRefNo(refNo, viewer);
  }

  /** İlan detayı — herkese açık (giriş yalnız yönetim aksiyonları için). */
  @Get(":id")
  async detail(@Param("id") id: string, @Query("userId") userId?: string) {
    const viewer = await this.optionalUser(userId);
    if (!UUID_RE.test(id)) throw new BadRequestException("Geçersiz elan kimliği");
    return this.listings.detail(id, viewer);
  }

  /** İlanı düzenle (kısmi) — sahip veya admin. Fiyat değişimi tarihçeye düşer. */
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    if (!UUID_RE.test(id)) throw new BadRequestException("Geçersiz elan kimliği");
    const parsed = UpdateListingDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Elan məlumatları yanlışdır",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    await this.requireUser(parsed.data.userId);
    return this.listings.updateListing(id, parsed.data);
  }

  /** İlanı sil — sahip veya admin. */
  @Delete(":id")
  async remove(@Param("id") id: string, @Query("userId") userId?: string) {
    const viewer = await this.requireUser(userId);
    if (!UUID_RE.test(id)) throw new BadRequestException("Geçersiz elan kimliği");
    return this.listings.deleteListing(id, viewer);
  }

  /** İlanı "Satıldı" olarak işaretle — sahip veya admin. */
  @Patch(":id/sold")
  async sold(@Param("id") id: string, @Query("userId") userId?: string) {
    const viewer = await this.requireUser(userId);
    if (!UUID_RE.test(id)) throw new BadRequestException("Geçersiz elan kimliği");
    return this.listings.markSold(id, viewer);
  }

  /** İlan verme — limit aşımında 402 + LISTING_LIMIT_EXCEEDED döner. */
  @Post()
  async create(@Body() body: unknown) {
    const parsed = CreateListingDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Elan məlumatları yanlışdır",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return this.listings.createUserListing(parsed.data);
  }
}
