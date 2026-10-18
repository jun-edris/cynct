// Turns an HTML page into a PDF and opens the share sheet (save to Files/Drive, send by email, Messenger...).
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

export async function sharePdf(html: string, fileName: string, dialogTitle = 'Share PDF') {
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 }); // US Letter points; A4 prints fine too
  // Give the file a readable name instead of a random one.
  const safe = fileName.replace(/[^\w.-]+/g, '-');
  const named = new File(Paths.cache, safe.endsWith('.pdf') ? safe : `${safe}.pdf`);
  try { if (named.exists) named.delete(); new File(uri).move(named); } catch { /* keep the original name */ }
  const target = named.exists ? named.uri : uri;
  await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle, UTI: 'com.adobe.pdf' });
}
