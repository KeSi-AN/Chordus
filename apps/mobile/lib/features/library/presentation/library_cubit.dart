import 'dart:async';

import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/events/event_log.dart';
import 'package:chordus/features/library/data/library_repository.dart';
import 'package:chordus/features/library/domain/song_summary.dart';
import 'package:chordus/features/settings/data/settings_repository.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class LibraryState extends Equatable {
  const LibraryState({
    this.loaded = false,
    this.songs = const [],
    this.query = '',
    this.syncing = false,
    this.progress,
    this.error,
    this.offline = false,
    this.lastSync,
  });

  /// The saved copy has been read (the list may still be empty).
  final bool loaded;
  final List<SongSummary> songs;
  final String query;
  final bool syncing;

  /// Songs downloaded so far in this sync, out of how many.
  final (int, int)? progress;
  final ApiException? error;

  /// The last sync couldn't reach the server: what's shown is the copy on the phone.
  final bool offline;
  final DateTime? lastSync;

  List<SongSummary> get visible {
    final rows = songs.where((s) => s.matches(query)).toList()
      ..sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
    return rows;
  }

  LibraryState copyWith({
    bool? loaded,
    List<SongSummary>? songs,
    String? query,
    bool? syncing,
    (int, int)? Function()? progress,
    ApiException? Function()? error,
    bool? offline,
    DateTime? lastSync,
  }) => LibraryState(
    loaded: loaded ?? this.loaded,
    songs: songs ?? this.songs,
    query: query ?? this.query,
    syncing: syncing ?? this.syncing,
    progress: progress == null ? this.progress : progress(),
    error: error == null ? this.error : error(),
    offline: offline ?? this.offline,
    lastSync: lastSync ?? this.lastSync,
  );

  @override
  List<Object?> get props => [
    loaded,
    songs,
    query,
    syncing,
    progress,
    error,
    offline,
    lastSync,
  ];
}

class LibraryCubit extends Cubit<LibraryState> {
  LibraryCubit({
    required this._library,
    required this._settings,
    required this._events,
  }) : super(const LibraryState());

  final LibraryRepository _library;
  final SettingsRepository _settings;
  final EventLog _events;
  Timer? _searchLog;

  /// Shows the saved copy right away, then syncs in the background.
  Future<void> start() async {
    emit(
      state.copyWith(
        loaded: true,
        songs: await _library.cachedLibrary(),
        lastSync: _settings.lastSync,
      ),
    );
    await sync();
  }

  Future<void> sync() async {
    if (state.syncing) return;
    if (!_settings.server.isConfigured) {
      emit(state.copyWith(offline: false, error: () => null));
      return;
    }
    emit(
      state.copyWith(syncing: true, error: () => null, progress: () => null),
    );
    try {
      await _library.sync(
        onProgress: (done, total) =>
            emit(state.copyWith(progress: () => (done, total))),
      );
      final now = DateTime.now();
      await _settings.saveLastSync(now);
      emit(
        state.copyWith(
          songs: await _library.cachedLibrary(),
          syncing: false,
          offline: false,
          progress: () => null,
          lastSync: now,
        ),
      );
      unawaited(_events.flush());
    } on ApiException catch (e) {
      emit(
        state.copyWith(
          songs: await _library.cachedLibrary(),
          syncing: false,
          offline: e.isOffline,
          error: () => e,
          progress: () => null,
        ),
      );
    }
  }

  void search(String query) {
    emit(state.copyWith(query: query));
    _searchLog?.cancel();
    final q = query.trim();
    if (q.isEmpty) return;
    _searchLog = Timer(
      const Duration(milliseconds: 800),
      () => _events.log(EventType.search, payload: {'query': q}),
    );
  }

  @override
  Future<void> close() {
    _searchLog?.cancel();
    return super.close();
  }
}
