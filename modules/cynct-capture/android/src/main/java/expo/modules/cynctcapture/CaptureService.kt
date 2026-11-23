package expo.modules.cynctcapture

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * Android shows a notification listener every notification on the phone. This one throws away
 * everything except notifications from the wallet and bank apps on the allowlist that mention a number.
 */
class CaptureService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    try {
      val prefs = getSharedPreferences(CaptureStore.PREFS, Context.MODE_PRIVATE)
      val packages = prefs.getStringSet(CaptureStore.KEY_PACKAGES, null) ?: CaptureStore.DEFAULT_PACKAGES
      val names = prefs.getStringSet(CaptureStore.KEY_NAMES, null) ?: CaptureStore.DEFAULT_NAMES
      val label = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
      } catch (_: Exception) { "" }
      if (sbn.packageName !in packages && label.trim().lowercase() !in names) return

      val n = sbn.notification ?: return
      if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
      val ex = n.extras ?: return
      val title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
      val text = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: ex.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
      if (!Regex("\\d").containsMatchIn(title + " " + text)) return // promos and "card on its way" messages

      val obj = JSONObject()
        .put("key", sbn.key)
        .put("pkg", sbn.packageName)
        .put("app", label)
        .put("title", title)
        .put("text", text)
        .put("postedAt", sbn.postTime)
      CaptureStore.append(applicationContext, obj.toString())
    } catch (_: Throwable) {
      // Never crash the listener over one odd notification.
    }
  }
}
