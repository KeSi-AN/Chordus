import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:equatable/equatable.dart';

/// A library row, as `GET /api/mobile/songs` sends it.
class SongSummary extends Equatable {
  const SongSummary({
    required this.id,
    required this.title,
    required this.artist,
    required this.originalKey,
    required this.hasAudio,
    required this.confirmed,
    required this.version,
    this.lastOpenedAt,
  });

  factory SongSummary.fromJson(Json json) => SongSummary(
    id: json['id'] as String,
    title: json['title'] as String,
    artist: json['artist'] as String,
    originalKey: json['originalKey'] as String?,
    hasAudio: json['hasAudio'] as bool? ?? false,
    confirmed: json['confirmed'] as bool? ?? false,
    version: json['version'] as String,
    lastOpenedAt: json['lastOpenedAt'] == null
        ? null
        : DateTime.tryParse(json['lastOpenedAt'] as String),
  );

  final String id;
  final String title;
  final String artist;
  final String? originalKey;
  final bool hasAudio;
  final bool confirmed;

  /// Changes whenever the song's sheet, prefs or audio change on the server.
  final String version;
  final DateTime? lastOpenedAt;

  Json toJson() => {
    'id': id,
    'title': title,
    'artist': artist,
    'originalKey': originalKey,
    'hasAudio': hasAudio,
    'confirmed': confirmed,
    'version': version,
    'lastOpenedAt': lastOpenedAt?.toIso8601String(),
  };

  /// Case-insensitive match on title or artist.
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return title.toLowerCase().contains(q) || artist.toLowerCase().contains(q);
  }

  @override
  List<Object?> get props => [
    id,
    title,
    artist,
    originalKey,
    hasAudio,
    confirmed,
    version,
    lastOpenedAt,
  ];
}
