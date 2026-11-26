import 'package:chordus/core/theme/app_theme.dart';
import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:material_ui/material_ui.dart';

/// Urdu, Arabic and Hebrew lyrics read right to left.
final _rtl = RegExp('[֐-ࣿיִ-﷿ﹰ-ﻼ]');

/// A chord sheet, chords above lyrics. Chords are shown through [chordTable] (sheet token ->
/// chord at the current transpose and capo).
class SheetView extends StatelessWidget {
  const SheetView({
    required this.sheet,
    required this.chordTable,
    required this.fontSize,
    super.key,
  });

  final Sheet sheet;
  final Map<String, String> chordTable;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    if (sheet.sections.isEmpty) {
      return const Text('This sheet is empty.');
    }
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final section in sheet.sections)
          Padding(
            padding: EdgeInsets.only(bottom: fontSize),
            child: _Section(
              section: section,
              chordTable: chordTable,
              fontSize: fontSize,
              scheme: scheme,
            ),
          ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.section,
    required this.chordTable,
    required this.fontSize,
    required this.scheme,
  });

  final SheetSection section;
  final Map<String, String> chordTable;
  final double fontSize;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final label = section.label;
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (label != null && section.kind != 'none')
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              section.isRepeat
                  ? '${label.toUpperCase()} (repeat)'
                  : label.toUpperCase(),
              style: TextStyle(
                fontSize: fontSize * 0.72,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.8,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ),
        for (final line in section.lines) _line(line),
      ],
    );
    if (section.kind != 'chorus') return body;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(
          left: BorderSide(
            color: scheme.primary.withValues(alpha: 0.35),
            width: 3,
          ),
        ),
      ),
      child: Padding(padding: const EdgeInsets.only(left: 12), child: body),
    );
  }

  Widget _line(SheetLine line) => switch (line) {
    EmptyLine() => SizedBox(height: fontSize * 0.9),
    CommentLine(:final text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Text(
        text,
        style: TextStyle(
          fontSize: fontSize * 0.85,
          fontStyle: FontStyle.italic,
          color: scheme.onSurfaceVariant,
        ),
      ),
    ),
    TabLine(:final text) => SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Text(
        text,
        style: TextStyle(
          fontFamily: 'monospace',
          fontSize: fontSize * 0.8,
          height: 1.15,
        ),
      ),
    ),
    LyricsLine(:final segments) => LyricLine(
      segments: segments,
      chordTable: chordTable,
      fontSize: fontSize,
    ),
  };
}

/// One lyric line. Each word is its own column (chord on top, word below), so long lines wrap
/// between words on a narrow screen and every chord stays above the syllable it belongs to.
class LyricLine extends StatelessWidget {
  const LyricLine({
    required this.segments,
    required this.chordTable,
    required this.fontSize,
    super.key,
  });

  final List<Segment> segments;
  final Map<String, String> chordTable;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasChords = segments.any((s) => s.chord != null);
    final direction = segments.any((s) => _rtl.hasMatch(s.lyrics))
        ? TextDirection.rtl
        : TextDirection.ltr;
    final lyricStyle = TextStyle(
      fontSize: fontSize,
      height: 1.25,
      color: scheme.onSurface,
    );
    if (!hasChords) {
      return Text(
        segments.map((s) => s.lyrics).join(),
        textDirection: direction,
        style: lyricStyle.copyWith(height: 1.45),
      );
    }
    final hasLyrics = segments.any((s) => s.lyrics.trim().isNotEmpty);
    final chordStyle = TextStyle(
      fontSize: fontSize,
      height: 1.25,
      fontWeight: FontWeight.w700,
      color: scheme.chord,
    );

    final cells = <Widget>[];
    for (final seg in segments) {
      final words = _words(seg.lyrics);
      for (var i = 0; i < words.length; i++) {
        final chord = i == 0 ? seg.chord : null;
        cells.add(
          _Cell(
            chord: chord == null ? null : (chordTable[chord] ?? chord),
            uncertain: i == 0 && seg.uncertain,
            lyric: hasLyrics ? words[i] : null,
            chordStyle: chordStyle,
            lyricStyle: lyricStyle,
            uncertainColor: scheme.uncertain,
          ),
        );
      }
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Wrap(
        textDirection: direction,
        crossAxisAlignment: WrapCrossAlignment.end,
        children: cells,
      ),
    );
  }

  /// "cavern, in a " -> ["cavern, ", "in ", "a "]; a chord over no lyrics keeps one empty cell.
  static List<String> _words(String lyrics) {
    final words = RegExp(r'\S+\s*|\s+')
        .allMatches(lyrics)
        .map((m) => m.group(0)!)
        .toList();
    return words.isEmpty ? [''] : words;
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.chord,
    required this.uncertain,
    required this.lyric,
    required this.chordStyle,
    required this.lyricStyle,
    required this.uncertainColor,
  });

  final String? chord;
  final bool uncertain;
  final String? lyric;
  final TextStyle chordStyle;
  final TextStyle lyricStyle;
  final Color uncertainColor;

  @override
  Widget build(BuildContext context) {
    final chordText = Text(
      // Room after a chord so the next one never touches it.
      chord == null ? ' ' : '$chord ',
      style: uncertain
          ? chordStyle.copyWith(
              decoration: TextDecoration.underline,
              decorationStyle: TextDecorationStyle.dotted,
              decorationColor: uncertainColor,
              decorationThickness: 2,
            )
          : chordStyle,
      semanticsLabel: chord == null ? '' : 'chord $chord',
    );
    final lyricText = lyric;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (uncertain)
          Tooltip(
            message: 'Low-confidence chord detected from audio. Check it.',
            child: chordText,
          )
        else
          chordText,
        if (lyricText != null)
          Text(lyricText.isEmpty ? ' ' : lyricText, style: lyricStyle),
      ],
    );
  }
}
