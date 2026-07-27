import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const DATA_URI_RE = /^data:(image\/\w+);base64,(.+)$/;

/**
 * İlan fotoğraflarını Cloudflare R2'ye (S3 uyumlu) yükler. R2 env'leri
 * yoksa no-op'tur — data URI'lar olduğu gibi geri döner (MVP fallback,
 * fotoğraflar DB'ye gömülür). Zaten http(s) URL olan girişler (düzenlemede
 * değişmeyen fotoğraflar) dokunulmadan geçer.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private client: S3Client | null = null;

  private s3(): S3Client {
    if (this.client) return this.client;
    this.client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
    return this.client;
  }

  /** prefix altında benzersiz anahtarlarla yükler; sonuç herkese açık URL dizisi. */
  async uploadPhotos(photos: string[], prefix: string): Promise<string[]> {
    const bucket = process.env.R2_BUCKET;
    const publicBase = process.env.R2_PUBLIC_URL;
    if (!bucket || !publicBase || !process.env.R2_ENDPOINT) return photos;

    return Promise.all(
      photos.map(async (photo) => {
        const match = DATA_URI_RE.exec(photo);
        if (!match) return photo; // zaten URL ya da beklenmeyen format
        const [, mime, base64] = match;
        if (!mime || !base64) return photo;
        const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
        const key = `listings/${prefix}/${randomUUID()}.${ext}`;
        try {
          await this.s3().send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: Buffer.from(base64, "base64"),
              ContentType: mime,
            }),
          );
          return `${publicBase.replace(/\/$/, "")}/${key}`;
        } catch (err) {
          this.logger.error(`R2 yükleme uğursuz oldu: ${String(err)}`);
          return photo; // uğursuzsa data URI ile devam — ilan yine oluşur
        }
      }),
    );
  }

  /**
   * Verilen URL'lerin R2 nesnelerini siler (ilan silinince / düzenlemede foto
   * çıkarılınca). Best-effort: hata yalnız loglanır — çağıran akış (ilan silme)
   * bundan etkilenmez. Bizim public URL'imizle başlamayan girişler (data URI,
   * yabancı adres) atlanır; her yükleme benzersiz anahtar ürettiği için bir
   * nesne yalnız tek ilana aittir, paylaşımlı silme riski yoktur.
   */
  async deletePhotos(photos: string[]): Promise<void> {
    const bucket = process.env.R2_BUCKET;
    const publicBase = process.env.R2_PUBLIC_URL;
    if (!bucket || !publicBase || !process.env.R2_ENDPOINT || photos.length === 0) return;

    const base = `${publicBase.replace(/\/$/, "")}/`;
    const keys = photos
      .filter((p) => p.startsWith(base))
      .map((p) => decodeURIComponent(p.slice(base.length)))
      .filter(Boolean);
    if (keys.length === 0) return;

    try {
      // DeleteObjects tek çağrıda 1000 anahtara kadar alır; ilan başına max 5.
      await this.s3().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      this.logger.log(`R2-dən ${keys.length} foto silindi`);
    } catch (err) {
      this.logger.error(`R2 silmə uğursuz oldu: ${String(err)}`);
    }
  }
}
