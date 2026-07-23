/**
 * İstemci tarafı fotoğraf küçültme — data URI boyutunu makul tutar (MVP'de
 * fotoğraflar jsonb'de data URI olarak saklanır). En uzun kenar 1280px'e
 * indirilir, JPEG %72 kalite. Prod'da bu adım R2'ye doğrudan yüklemeye döner.
 */
export async function fileToResizedDataUri(
  file: File,
  maxDim = 1280,
  quality = 0.72,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas dəstəklənmir");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
