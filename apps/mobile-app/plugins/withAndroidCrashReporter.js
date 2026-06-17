/**
 * Expo config plugin: inject uncaught-exception handler into MainApplication.kt.
 * Writes the crash stack trace to {filesDir}/native_crash.txt so it survives restarts.
 * Also shows an AlertDialog on the NEXT launch (before React loads) if a crash file exists.
 */
// pnpm isolates packages — @expo/config-plugins is not a direct dep, so resolve
// it through expo (which IS a direct dep and always depends on config-plugins).
const path = require('path');
let withMainApplication, withMainActivity;
try {
  ({ withMainApplication, withMainActivity } = require('@expo/config-plugins'));
} catch (_) {
  const expoRoot = path.dirname(require.resolve('expo/package.json'));
  ({ withMainApplication, withMainActivity } = require(
    require.resolve('@expo/config-plugins', { paths: [expoRoot] })
  ));
}

function addCrashHandlerToMainApplication(config) {
  return withMainApplication(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes('NativeCrashReporter')) return mod; // idempotent

    // Imports
    src = src.replace(
      /^(package .+\n)/m,
      `$1\nimport java.io.File\n`
    );

    // Handler code injected at the top of onCreate(), before super.onCreate()
    const handler = `
    // NativeCrashReporter: capture JVM crashes to a file before React starts.
    val crashFile = File(filesDir, "native_crash.txt")
    val prevHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val sb = StringBuilder()
        sb.appendLine("Thread: \${thread.name}")
        sb.appendLine("Exception: \${throwable.javaClass.name}: \${throwable.message}")
        throwable.stackTrace.take(30).forEach { sb.appendLine("  at \$it") }
        var cause = throwable.cause
        while (cause != null) {
          sb.appendLine("Caused by: \${cause.javaClass.name}: \${cause.message}")
          cause.stackTrace.take(10).forEach { sb.appendLine("  at \$it") }
          cause = cause.cause
        }
        crashFile.writeText(sb.toString())
      } catch (_: Exception) { /* don't recurse */ }
      prevHandler?.uncaughtException(thread, throwable)
    }
`;

    src = src.replace(
      /override fun onCreate\(\) \{/,
      `override fun onCreate() {${handler}`
    );

    mod.modResults.contents = src;
    return mod;
  });
}

function addCrashDisplayToMainActivity(config) {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes('NativeCrashDisplay')) return mod; // idempotent

    src = src.replace(
      /^(package .+\n)/m,
      `$1\nimport android.app.AlertDialog\nimport java.io.File\n`
    );

    // Show previous crash BEFORE React starts
    const checker = `
    // NativeCrashDisplay: show previous native crash before React loads.
    val crashFile = File(filesDir, "native_crash.txt")
    if (crashFile.exists()) {
      val msg = try { crashFile.readText().take(2000) } catch (_: Exception) { "unreadable" }
      crashFile.delete()
      runOnUiThread {
        AlertDialog.Builder(this)
          .setTitle("Native Crash (prev launch)")
          .setMessage(msg)
          .setPositiveButton("OK") { _, _ -> }
          .show()
      }
    }
`;

    // Inject BEFORE super.onCreate() in MainActivity
    src = src.replace(
      /override fun onCreate\(savedInstanceState: Bundle\?\) \{/,
      `override fun onCreate(savedInstanceState: Bundle?) {${checker}`
    );

    mod.modResults.contents = src;
    return mod;
  });
}

module.exports = function withAndroidCrashReporter(config) {
  config = addCrashHandlerToMainApplication(config);
  config = addCrashDisplayToMainActivity(config);
  return config;
};
