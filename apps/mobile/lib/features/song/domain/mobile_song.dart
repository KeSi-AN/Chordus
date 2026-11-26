import 'package:equatable/equatable.dart';

typedef Json = Map<String, dynamic>;

/// Where a value came from (plan section 7): suggested by the engine, edited on this device
/// and not saved yet, or confirmed.
enum PrefState { suggested, edited, confirmed }

/// One preference with its provenance, as the server's `PrefsView` sends it.
class PrefField<T> extends Equatable {
  const PrefField({
    required this.value,
    required this.state,
    required this.source,
    required this.confidence,
    required this.reason,
  });

  factory PrefField.fromJson(Json json, T Function(Object? value) read) =>
      PrefField(
        value: read(json['value']),
        state: PrefState.values.byName(json['state'] as String),
        source: json['source'] as String,
        confidence: (json['confidence'] as num).toDouble(),
        reason: json['reason'] as String,
      );

  final T value;
  final PrefState state;
  final String source;
  final double confidence;
  final String reason;

  /// The same field after the user changed it here (not saved until Confirm).
  PrefField<T> edited(T newValue) => PrefField(
    value: newValue,
    state: PrefState.edited,
    source: 'user',
    confidence: confidence,
    reason: 'Changed by you, not saved yet',
  );

  @override
  List<Object?> get props => [value, state, source, confidence, reason];
}

int _int(Object? v) => (v! as num).toInt();
String? _stringOrNull(Object? v) => v as String?;

class SongPrefs extends Equatable {
  const SongPrefs({
    required this.transpose,
    required this.audioPitch,
    required this.capo,
    required this.strum,
    required this.pitchLinked,
    required this.confirmedAt,
  });

  factory SongPrefs.fromJson(Json json) => SongPrefs(
    transpose: PrefField.fromJson(json['transpose'] as Json, _int),
    audioPitch: PrefField.fromJson(json['audioPitch'] as Json, _int),
    capo: PrefField.fromJson(json['capo'] as Json, _int),
    strum: PrefField.fromJson(json['strum'] as Json, _stringOrNull),
    pitchLinked: json['pitchLinked'] as bool,
    confirmedAt: json['confirmedAt'] == null
        ? null
        : DateTime.parse(json['confirmedAt'] as String),
  );

  final PrefField<int> transpose;
  final PrefField<int> audioPitch;
  final PrefField<int> capo;
  final PrefField<String?> strum;
  final bool pitchLinked;
  final DateTime? confirmedAt;

  @override
  List<Object?> get props => [
    transpose,
    audioPitch,
    capo,
    strum,
    pitchLinked,
    confirmedAt,
  ];
}

/// A run of lyrics with the chord played at its start (null before the first chord).
class Segment extends Equatable {
  const Segment({
    required this.chord,
    required this.lyrics,
    this.uncertain = false,
  });

  factory Segment.fromJson(Json json) => Segment(
    chord: json['chord'] as String?,
    lyrics: json['lyrics'] as String,
    uncertain: json['uncertain'] as bool? ?? false,
  );

  final String? chord;
  final String lyrics;

  /// Detected from audio with low confidence: worth checking by ear.
  final bool uncertain;

  @override
  List<Object?> get props => [chord, lyrics, uncertain];
}

sealed class SheetLine {
  const SheetLine();

  factory SheetLine.fromJson(Json json) => switch (json['type']) {
    'lyrics' => LyricsLine(
      (json['segments'] as List<dynamic>)
          .cast<Json>()
          .map(Segment.fromJson)
          .toList(),
    ),
    'comment' => CommentLine(json['text'] as String),
    'tab' => TabLine(json['text'] as String),
    _ => const EmptyLine(),
  };
}

class LyricsLine extends SheetLine {
  const LyricsLine(this.segments);
  final List<Segment> segments;
}

class CommentLine extends SheetLine {
  const CommentLine(this.text);
  final String text;
}

class TabLine extends SheetLine {
  const TabLine(this.text);
  final String text;
}

class EmptyLine extends SheetLine {
  const EmptyLine();
}

class SheetSection {
  const SheetSection({
    required this.kind,
    required this.label,
    required this.lines,
    required this.isRepeat,
  });

  factory SheetSection.fromJson(Json json) => SheetSection(
    kind: json['kind'] as String,
    label: json['label'] as String?,
    lines: (json['lines'] as List<dynamic>)
        .cast<Json>()
        .map(SheetLine.fromJson)
        .toList(),
    isRepeat: json['isRepeat'] as bool? ?? false,
  );

  final String kind;
  final String? label;
  final List<SheetLine> lines;

  /// A `{chorus}` recall of an earlier chorus.
  final bool isRepeat;
}

class Sheet {
  const Sheet({
    required this.id,
    required this.origin,
    required this.sections,
    required this.chords,
  });

  factory Sheet.fromJson(Json json) {
    final parsed = json['parsed'] as Json;
    return Sheet(
      id: json['id'] as String,
      origin: json['origin'] as String,
      sections: (parsed['sections'] as List<dynamic>)
          .cast<Json>()
          .map(SheetSection.fromJson)
          .toList(),
      chords: (json['chords'] as List<dynamic>).cast<String>(),
    );
  }

  final String id;

  /// detected | pasted | imported_open | edited
  final String origin;
  final List<SheetSection> sections;

  /// Every chord token in the sheet, in the order the [ShapeSet] lists use.
  final List<String> chords;

  bool get isDetectedDraft => origin == 'detected';
}

/// The chords shown when the shapes sit some number of semitones above the original.
class ShapeSet {
  const ShapeSet({required this.key, required this.chords});

  factory ShapeSet.fromJson(Json json) => ShapeSet(
    key: json['key'] as String?,
    chords: (json['chords'] as List<dynamic>).cast<String>(),
  );

  final String? key;
  final List<String> chords;
}

class CapoOption {
  const CapoOption({
    required this.capo,
    required this.shapeKey,
    required this.score,
    required this.reason,
  });

  factory CapoOption.fromJson(Json json) => CapoOption(
    capo: _int(json['capo']),
    shapeKey: json['shapeKey'] as String,
    score: (json['score'] as num).toDouble(),
    reason: json['reason'] as String,
  );

  final int capo;
  final String shapeKey;
  final double score;
  final String reason;
}

/// The song at one transpose: its key, the ranked capo options and the linked audio shift.
class Sounding {
  const Sounding({
    required this.key,
    required this.capoOptions,
    required this.audioShift,
  });

  factory Sounding.fromJson(Json json) => Sounding(
    key: json['key'] as String?,
    capoOptions: (json['capoOptions'] as List<dynamic>)
        .cast<Json>()
        .map(CapoOption.fromJson)
        .toList(),
    audioShift: _int(json['audioShift']),
  );

  final String? key;
  final List<CapoOption> capoOptions;
  final int audioShift;
}

class AudioRef {
  const AudioRef({required this.sourceId, this.filename, this.mimeType});

  factory AudioRef.fromJson(Json json) => AudioRef(
    sourceId: json['sourceId'] as String,
    filename: json['filename'] as String?,
    mimeType: json['mimeType'] as String?,
  );

  final String sourceId;
  final String? filename;
  final String? mimeType;
}

/// One song as `GET /api/mobile/songs/:id` sends it, with every transpose and capo choice
/// worked out by the server, so the app needs no music theory of its own and works offline.
class MobileSong {
  MobileSong._(
    this.raw, {
    required this.id,
    required this.title,
    required this.artist,
    required this.originalKey,
    required this.bpm,
    required this.timeSignature,
    required this.version,
    required this.sheet,
    required this.shapes,
    required this.sounding,
    required this.prefs,
    required this.audio,
  });

  factory MobileSong.fromJson(Json json) {
    final shapes = (json['shapes'] as List<dynamic>)
        .cast<Json>()
        .map(ShapeSet.fromJson)
        .toList();
    final sounding = (json['sounding'] as List<dynamic>)
        .cast<Json>()
        .map(Sounding.fromJson)
        .toList();
    if (shapes.length != 12 || sounding.length != 12) {
      throw const FormatException('A song needs 12 shape and sounding entries');
    }
    return MobileSong._(
      json,
      id: json['id'] as String,
      title: json['title'] as String,
      artist: json['artist'] as String,
      originalKey: json['originalKey'] as String?,
      bpm: (json['bpm'] as num?)?.toDouble(),
      timeSignature: json['timeSignature'] as String,
      version: json['version'] as String,
      sheet: json['sheet'] == null
          ? null
          : Sheet.fromJson(json['sheet'] as Json),
      shapes: shapes,
      sounding: sounding,
      prefs: SongPrefs.fromJson(json['prefs'] as Json),
      audio: json['audio'] == null
          ? null
          : AudioRef.fromJson(json['audio'] as Json),
    );
  }

  /// The JSON this was parsed from, kept for the offline cache.
  final Json raw;
  final String id;
  final String title;
  final String artist;
  final String? originalKey;
  final double? bpm;
  final String timeSignature;
  final String version;
  final Sheet? sheet;
  final List<ShapeSet> shapes;
  final List<Sounding> sounding;
  final SongPrefs prefs;
  final AudioRef? audio;

  /// The song at a chord transpose (any integer; only its value mod 12 matters).
  Sounding soundingAt(int transpose) => sounding[transpose % 12];

  /// The chord shapes played at a transpose with a capo.
  ShapeSet shapesAt(int transpose, int capo) => shapes[(transpose - capo) % 12];

  /// Sheet chord token -> chord to show, for a transpose and capo.
  Map<String, String> chordTable(int transpose, int capo) {
    final shown = shapesAt(transpose, capo).chords;
    final tokens = sheet?.chords ?? const <String>[];
    return {
      for (var i = 0; i < tokens.length && i < shown.length; i++)
        tokens[i]: shown[i],
    };
  }

  /// The same song with the prefs the server returned after a confirm.
  MobileSong withPrefs(Json prefs) =>
      MobileSong.fromJson({...raw, 'prefs': prefs});
}
