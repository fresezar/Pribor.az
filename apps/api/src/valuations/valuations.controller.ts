import { BadRequestException, Body, Controller, Param, Post } from "@nestjs/common";
import { CreateValuationDto } from "@pribor/contracts";
import { ValuationsService } from "./valuations.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("valuations")
export class ValuationsController {
  constructor(private readonly valuations: ValuationsService) {}

  @Post()
  async create(@Body() body: unknown) {
    const parsed = CreateValuationDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Doğrulama hatası — alanları kontrol edin",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return this.valuations.create(parsed.data);
  }

  /** "Bu qiymətlə elan yerləşdir" — değerlemeden taslak ilana köprü. */
  @Post(":id/convert")
  async convert(@Param("id") id: string) {
    if (!UUID_RE.test(id)) throw new BadRequestException("Geçersiz değerleme kimliği");
    return this.valuations.convertToListing(id);
  }
}
