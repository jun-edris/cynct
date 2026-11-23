package expo.modules.cynctcapture

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CynctCaptureModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext

  private fun component(c: Context) = ComponentName(c, CaptureService::class.java)

  private fun enabled(c: Context): Boolean {
    val flat = Settings.Secure.getString(c.contentResolver, "enabled_notification_listeners") ?: return false
    val me = component(c)
    return flat.split(":").any { ComponentName.unflattenFromString(it) == me }
  }

  override fun definition() = ModuleDefinition {
    Name("CynctCapture")

    /** True when the person has turned on notification access for Cynct. */
    Function("isEnabled") { ctx?.let { enabled(it) } ?: false }

    /** Opens Android's notification access screen. */
    Function("openSettings") {
      val c = ctx ?: return@Function false
      c.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }

    /** Asks Android to reconnect the listener (some phones drop it after an update or a battery cleanup). */
    Function("rebind") {
      val c = ctx ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && enabled(c)) NotificationListenerService.requestRebind(component(c))
      true
    }

    /** Which apps to read, by package id and by visible app name (lowercase). */
    Function("setAllowlist") { packages: List<String>, names: List<String> ->
      val c = ctx ?: return@Function false
      c.getSharedPreferences(CaptureStore.PREFS, Context.MODE_PRIVATE).edit()
        .putStringSet(CaptureStore.KEY_PACKAGES, packages.toSet())
        .putStringSet(CaptureStore.KEY_NAMES, names.map { it.trim().lowercase() }.toSet())
        .apply()
      true
    }

    /** Everything captured since the last call, as a JSON array string; empties the queue. */
    AsyncFunction("drain") {
      val c = ctx ?: return@AsyncFunction "[]"
      CaptureStore.drain(c)
    }
  }
}
