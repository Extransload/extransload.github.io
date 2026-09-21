import sharp from 'sharp';

// The approved source has a neutral checkerboard; gold has distinct chroma.
const source = process.argv[2] ?? 'public/images/extransload-wordmark-embroidered-v1.png';
const destination = process.argv[3] ?? 'public/images/extransload-wordmark.webp';
const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < info.width * info.height; i++) {
  const [r, g, b] = data.subarray(i * 3, i * 3 + 3);
  const chroma = Math.max(0, Math.min(r - b, (g - b) * 1.8));
  const alpha = Math.max(0, Math.min(1, (chroma - 8) / 22));
  rgba.set([r, g, b, Math.round(alpha * 255)], i * 4);
}
await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim()
  .extend({ top: 12, bottom: 12, left: 12, right: 12, background: '#00000000' })
  .webp({ lossless: true })
  .toFile(destination);
