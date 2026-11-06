package expo.modules.plaxnative

import android.os.Build
import android.view.HapticFeedbackConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * The two things the app needs that React Native cannot reach from JavaScript:
 *
 *  - the settings file of the native 1.x app (shared_prefs/plax.xml), so that a reader who updates keeps the topics they chose for
 *    For you, their theme and the feed they last used. It is read once, by the import of the old app's data, and only ever read;
 *  - the touch feedback of the screen, the same ticks the native app gave on a page change and on saving a story. They follow the
 *    reader's own touch feedback setting, and need no permission.
 *
 * Nothing else is here: no network, no storage of its own, nothing that outlives a call.
 */
class PlaxNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PlaxNative")

    AsyncFunction("readLegacyPreferences") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      val file = File(File(context.applicationInfo.dataDir, "shared_prefs"), "plax.xml")
      if (file.isFile && file.length() in 1..MAX_PREFERENCES_BYTES) file.readText(Charsets.UTF_8) else null
    }

    Function("tick") { feedback(HapticFeedbackConstants.CLOCK_TICK) }

    Function("confirm") {
      feedback(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
    }

    // Tells the system the first stories are on the screen: the time Google Play's vitals call "time to full display".
    Function("reportFullyDrawn") {
      try {
        appContext.currentActivity?.reportFullyDrawn()
      } catch (ignored: Exception) {
        // A phone that does not take the report is no worse off.
      }
    }
  }

  private fun feedback(kind: Int) {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread { activity.window?.decorView?.performHapticFeedback(kind) }
  }

  private companion object {
    /** The native app's settings were a few hundred bytes; a file of any other size is not them. */
    const val MAX_PREFERENCES_BYTES = 64L * 1024
  }
}
