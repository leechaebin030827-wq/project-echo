import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = process.argv[2];
const outputRoot = process.argv[3] ?? 'public/textures/southafrica/ct2-pbr-v2';
if (!sourceRoot) {
  throw new Error('Usage: node scripts/prepare-ct2-ground-textures.mjs unpacked-pack-directory [output-directory]');
}

const materials = [
  ['soil', '01_Cape_Dry_Gravel_Soil', 'Cape_Dry_Gravel_Soil'],
  ['concrete', '02_Industrial_Concrete', 'Industrial_Concrete'],
  ['asphalt', '03_Road_Asphalt', 'Road_Asphalt'],
];
const channels = [
  ['color', 'BaseColor'],
  ['normal', 'Normal_OpenGL'],
  ['roughness', 'Roughness'],
  ['height', 'Height_Bump'],
];

function runFfmpeg(args, input) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
    input, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString() || 'ffmpeg failed');
  return result.stdout;
}

function closeSeams(pixels, size) {
  const stride = size * 3;
  // Lossless PNG preserves these exact edges after resize. A generic image
  // resampler can otherwise make opposite edges differ by a few pixels.
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    pixels.copy(pixels, row + stride - 3, row, row + 3);
  }
  pixels.copy(pixels, (size - 1) * stride, 0, stride);
}

fs.mkdirSync(outputRoot, { recursive: true });
for (const [name, folder, prefix] of materials) {
  for (const [channel, suffix] of channels) {
    const size = channel === 'color' ? 1024 : 512;
    const input = path.join(sourceRoot, folder, `${prefix}_2048_${suffix}.png`);
    const output = path.join(outputRoot, `${name}-${channel}.png`);
    const pixels = runFfmpeg([
      '-i', input, '-vf', `scale=${size}:${size}:flags=lanczos`,
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    ]);
    if (pixels.length !== size * size * 3) throw new Error(`Unexpected decoded size: ${input}`);
    closeSeams(pixels, size);
    runFfmpeg([
      '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${size}x${size}`, '-i', 'pipe:0',
      '-frames:v', '1', '-c:v', 'png', '-compression_level', '9', output,
    ], pixels);
    console.log(`${name}-${channel}: ${(fs.statSync(output).size / 1024).toFixed(0)} KiB`);
  }
}
