import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ListingQuery } from "@pribor/contracts";
import { ListingsService } from "./listings.service";

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
}
