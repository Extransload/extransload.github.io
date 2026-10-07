import * as THREE from 'three';

const repairedMaps = new WeakMap<THREE.Texture, THREE.Texture>();

export function repairLunaSkinTexture(source: THREE.Texture): THREE.Texture {
  const cached = repairedMaps.get(source);
  if (cached) return cached;
  const image = source.image as HTMLImageElement | ImageBitmap;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Cannot prepare Luna-base skin texture');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const top = Math.floor(canvas.height * 0.43);
  const height = Math.ceil(canvas.height * 0.66) - top;
  const core = new Uint8Array(width * height);
  const margin = Math.max(3, Math.round(width / 512));
  const distance = new Uint8Array(core.length).fill(255);

  for (let y = 0; y < height; y++) {
    const v = (top + y + 0.5) / canvas.height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const waist = u >= 0.237 && u <= 0.763 && v >= 0.445 && v <= 0.648;
      const sides = (u < 0.24 || u > 0.76) && v >= 0.49 && v <= 0.526;
      const pixel = ((top + y) * width + x) * 4;
      if ((waist || sides) && pixels.data[pixel + 2] >= pixels.data[pixel] + 2) core[y * width + x] = 1;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!core[y * width + x]) continue;
      for (let dy = -margin; dy <= margin; dy++) {
        if (y + dy < 0 || y + dy >= height) continue;
        for (let dx = -margin; dx <= margin; dx++) {
          if (x + dx < 0 || x + dx >= width) continue;
          const index = (y + dy) * width + x + dx;
          distance[index] = Math.min(distance[index], Math.max(Math.abs(dx), Math.abs(dy)));
        }
      }
    }
  }

  const scale = 4;
  const gridWidth = Math.ceil(width / scale);
  const gridHeight = Math.ceil(height / scale);
  const count = gridWidth * gridHeight;
  const unknown = new Uint8Array(count);
  const colors = new Float32Array(count * 3);
  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const index = gy * gridWidth + gx;
      let samples = 0;
      for (let dy = 0; dy < scale && gy * scale + dy < height; dy++) {
        for (let dx = 0; dx < scale && gx * scale + dx < width; dx++) {
          const x = gx * scale + dx;
          const y = gy * scale + dy;
          if (distance[y * width + x] <= margin) unknown[index] = 1;
          const pixel = ((top + y) * width + x) * 4;
          for (let channel = 0; channel < 3; channel++) colors[index * 3 + channel] += pixels.data[pixel + channel];
          samples++;
        }
      }
      for (let channel = 0; channel < 3; channel++) colors[index * 3 + channel] /= samples;
    }
  }

  const neighbors = (index: number) => {
    const x = index % gridWidth;
    const list: number[] = [];
    if (x > 0) list.push(index - 1);
    if (x + 1 < gridWidth) list.push(index + 1);
    if (index >= gridWidth) list.push(index - gridWidth);
    if (index + gridWidth < count) list.push(index + gridWidth);
    return list;
  };
  const patches: { index: number; neighbors: number[] }[] = [];
  const filled = Uint8Array.from(unknown, (value) => 1 - value);
  const queue: number[] = [];
  for (let index = 0; index < count; index++) {
    if (!unknown[index]) continue;
    const adjacent = neighbors(index);
    patches.push({ index, neighbors: adjacent });
    const boundary = adjacent.filter((neighbor) => !unknown[neighbor]);
    if (!boundary.length) continue;
    for (let channel = 0; channel < 3; channel++) {
      colors[index * 3 + channel] =
        boundary.reduce((sum, neighbor) => sum + colors[neighbor * 3 + channel], 0) / boundary.length;
    }
    filled[index] = 1;
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    for (const neighbor of neighbors(index)) {
      if (filled[neighbor]) continue;
      for (let channel = 0; channel < 3; channel++) colors[neighbor * 3 + channel] = colors[index * 3 + channel];
      filled[neighbor] = 1;
      queue.push(neighbor);
    }
  }
  for (let iteration = 0; iteration < 400; iteration++) {
    let largestChange = 0;
    for (const { index, neighbors: adjacent } of patches) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (const neighbor of adjacent) sum += colors[neighbor * 3 + channel];
        const delta = (sum / adjacent.length - colors[index * 3 + channel]) * 1.65;
        colors[index * 3 + channel] += delta;
        largestChange = Math.max(largestChange, Math.abs(delta));
      }
    }
    if (iteration >= 64 && largestChange < 0.015) break;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edgeDistance = distance[y * width + x];
      if (edgeDistance > margin) continue;
      const gx = Math.max(0, Math.min(gridWidth - 1, (x + 0.5) / scale - 0.5));
      const gy = Math.max(0, Math.min(gridHeight - 1, (y + 0.5) / scale - 0.5));
      const x0 = Math.floor(gx),
        y0 = Math.floor(gy);
      const x1 = Math.min(x0 + 1, gridWidth - 1),
        y1 = Math.min(y0 + 1, gridHeight - 1);
      const weight = edgeDistance <= margin - 2 ? 1 : (margin + 1 - edgeDistance) / 3;
      const pixel = ((top + y) * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const upper = THREE.MathUtils.lerp(
          colors[(y0 * gridWidth + x0) * 3 + channel],
          colors[(y0 * gridWidth + x1) * 3 + channel],
          gx - x0,
        );
        const lower = THREE.MathUtils.lerp(
          colors[(y1 * gridWidth + x0) * 3 + channel],
          colors[(y1 * gridWidth + x1) * 3 + channel],
          gx - x0,
        );
        pixels.data[pixel + channel] = Math.round(
          THREE.MathUtils.lerp(pixels.data[pixel + channel], THREE.MathUtils.lerp(upper, lower, gy - y0), weight),
        );
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  const repaired = source.clone();
  repaired.source = new THREE.TextureSource(canvas);
  repaired.needsUpdate = true;
  repairedMaps.set(source, repaired);
  return repaired;
}
