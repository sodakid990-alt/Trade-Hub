import { app, nativeImage } from 'electron'
import { dirname, sep } from 'node:path'
import { createWorker, type Worker } from 'tesseract.js'
import { parseTradeText } from './parseTradeText'

// Language data ships with the app, so reading screenshots is free and works offline.
// Packaged builds keep these files outside app.asar (see asarUnpack in electron-builder.yml).
const unpacked = (p: string) => p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
const langPath = () => unpacked(dirname(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')))

let worker: Promise<Worker> | null = null
function getWorker() {
  worker ??= createWorker('eng', 1, { langPath: langPath(), gzip: true, cacheMethod: 'none' })
  return worker
}
app.on('will-quit', () => worker?.then((w) => w.terminate()))

/**
 * Prepares a screenshot for OCR: grayscale, inverted when the theme is dark
 * (Tesseract reads dark text on light best), and upscaled when small.
 */
function preprocess(png: Buffer): Buffer {
  let img = nativeImage.createFromBuffer(png)
  const { width } = img.getSize()
  if (width < 1600) img = img.resize({ width: Math.round(width * 2), quality: 'best' })
  const { width: w, height: h } = img.getSize()
  const bgra = img.toBitmap()
  let sum = 0
  for (let i = 0; i < bgra.length; i += 4) sum += (bgra[i] + bgra[i + 1] + bgra[i + 2]) / 3
  const dark = sum / (bgra.length / 4) < 128
  for (let i = 0; i < bgra.length; i += 4) {
    let v = 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2]
    if (dark) v = 255 - v
    bgra[i] = bgra[i + 1] = bgra[i + 2] = v
  }
  return nativeImage.createFromBitmap(bgra, { width: w, height: h }).toPNG()
}

export async function readTradesFromImage(imageBase64: string) {
  const w = await getWorker()
  const { data } = await w.recognize(preprocess(Buffer.from(imageBase64, 'base64')))
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  return { trades: parseTradeText(data.text, today), text: data.text }
}
