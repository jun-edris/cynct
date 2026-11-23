package expo.modules.cynctcapture

import android.content.Context
import org.json.JSONArray
import java.io.File

/**
 * On-device queue of captured payment notifications (one JSON object per line).
 * Cynct drains it when the app opens; nothing here ever leaves the phone.
 */
object CaptureStore {
  private const val FILE = "cynct-capture.jsonl"
  private const val MAX_LINES = 500
  const val PREFS = "cynct-capture"
  const val KEY_PACKAGES = "packages"
  const val KEY_NAMES = "names"

  // Package ids we're confident about, plus app names to match when an id is unknown (GoTyme, renamed apps).
  val DEFAULT_PACKAGES = setOf("com.paymaya", "com.transferwise.android", "com.globe.gcash.android")
  val DEFAULT_NAMES = setOf("maya", "wise", "gotyme", "gotyme bank", "gotyme ph", "gcash")

  private val lock = Any()

  fun append(ctx: Context, line: String) = synchronized(lock) {
    val f = File(ctx.filesDir, FILE)
    f.appendText(line.replace("\n", " ") + "\n")
    val lines = f.readLines()
    if (lines.size > MAX_LINES) f.writeText(lines.takeLast(MAX_LINES).joinToString("\n", postfix = "\n"))
  }

  /** Returns everything queued as a JSON array string and empties the queue. */
  fun drain(ctx: Context): String = synchronized(lock) {
    val f = File(ctx.filesDir, FILE)
    if (!f.exists()) return "[]"
    val arr = JSONArray()
    f.readLines().filter { it.isNotBlank() }.forEach { arr.put(org.json.JSONObject(it)) }
    f.delete()
    arr.toString()
  }
}
