// On-device text reading (Google ML Kit, bundled in the app, so it works offline). Loaded lazily: the native
// module doesn't exist in the web preview.
import { Platform } from 'react-native';
import { rowsFromLines, type OcrLine } from '../lib/receipt';

export const ocrSupported = Platform.OS !== 'web';

/** The image's text as printed rows, top to bottom. */
export async function readText(uri: string): Promise<string[]> {
  const { recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition');
  const res = await recognizeText(uri);
  const lines: OcrLine[] = res.blocks.flatMap(b => b.lines.map(l => ({ text: l.text, frame: l.frame })));
  // Rebuild rows from positions; fall back to plain blocks if positions are missing.
  return lines.length ? rowsFromLines(lines) : res.blocks.map(b => b.text);
}
