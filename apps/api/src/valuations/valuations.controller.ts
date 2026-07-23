import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { CreateValuationDto } from "@pribor/contracts";
import { ValuationsService } from "./valuations.service";

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
}
