import 'package:material_ui/material_ui.dart';

/// App-wide look. Tuned for reading a chord sheet on a music stand: dark by default at night,
/// big touch targets for the controls you hit mid-song.
abstract final class AppTheme {
  static const _seed = Color(0xFF7C3AED); // violet

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final scheme = ColorScheme.fromSeed(
      seedColor: _seed,
      brightness: brightness,
    );
    return ThemeData(
      colorScheme: scheme,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
    );
  }
}

/// Colours that carry meaning in a sheet (shared by the sheet and the legend).
extension SheetColors on ColorScheme {
  Color get chord => primary;

  /// Underline for chords detected from audio with low confidence.
  Color get uncertain => const Color(0xFFF59E0B);
}
