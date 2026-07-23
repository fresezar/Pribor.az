import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CreateListingDto, ListingQuery } from "@pribor/contracts";
import { ListingsService } from "./listings.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("listings")
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

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
