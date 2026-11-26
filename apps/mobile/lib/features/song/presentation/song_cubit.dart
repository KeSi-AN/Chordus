import 'dart:async';

import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/events/event_log.dart';
import 'package:chordus/features/library/data/library_repository.dart';
import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

/// Capo frets offered (the web app offers the same range).
const maxCapo = 9;

class SongState extends Equatable {
  const SongState({
    this.song,
    this.transpose,
    this.capo,
    this.loading = true,
    this.refreshing = false,
    this.fromCache = false,
    this.saving = false,
    this.error,
    this.saveError,
    this.justConfirmed = false,
  });

  final MobileSong? song;

  /// Current values with their provenance (suggested / edited here / confirmed).
  final PrefField<int>? transpose;
  final PrefField<int>? capo;
  final bool loading;

  /// Fetching the latest copy from the server while showing the saved one.
  final bool refreshing;

  /// What's shown is the copy on the phone (the server couldn't be reached).
  final bool fromCache;
  final bool saving;

  /// The song couldn't be loaded at all.
  final ApiException? error;

  /// The last Confirm failed (e.g. offline).
  final String? saveError;
  final bool justConfirmed;

  bool get dirty =>
      transpose?.state == PrefState.edited || capo?.state == PrefState.edited;

  bool get allConfirmed =>
      transpose?.state == PrefState.confirmed &&
      capo?.state == PrefState.confirmed;

  /// Key the song sounds in at the current transpose.
  String? get soundingKey => song?.soundingAt(transpose?.value ?? 0).key;

  /// Key of the chord shapes played (differs from [soundingKey] with a capo).
  String? get shapeKey =>
      song?.shapesAt(transpose?.value ?? 0, capo?.value ?? 0).key;

  /// Sheet chord token -> chord to show.
  Map<String, String> get chordTable =>
      song?.chordTable(transpose?.value ?? 0, capo?.value ?? 0) ?? const {};

  /// Capo options for the current transpose, most playable first.
  List<CapoOption> get capoOptions =>
      song?.soundingAt(transpose?.value ?? 0).capoOptions ?? const [];

  SongState copyWith({
    MobileSong? song,
    PrefField<int>? transpose,
    PrefField<int>? capo,
    bool? loading,
    bool? refreshing,
    bool? fromCache,
    bool? saving,
    ApiException? Function()? error,
    String? Function()? saveError,
    bool? justConfirmed,
  }) => SongState(
    song: song ?? this.song,
    transpose: transpose ?? this.transpose,
    capo: capo ?? this.capo,
    loading: loading ?? this.loading,
    refreshing: refreshing ?? this.refreshing,
    fromCache: fromCache ?? this.fromCache,
    saving: saving ?? this.saving,
    error: error == null ? this.error : error(),
    saveError: saveError == null ? this.saveError : saveError(),
    justConfirmed: justConfirmed ?? this.justConfirmed,
  );

  @override
  List<Object?> get props => [
    song?.version,
    song?.prefs,
    transpose,
    capo,
    loading,
    refreshing,
    fromCache,
    saving,
    error,
    saveError,
    justConfirmed,
  ];
}

/// Wraps a chord transpose into −11..+11, as the web app does (±12 is the original key).
int normalizeTranspose(int semitones) => semitones.remainder(12);

/// Suggest → edit → confirm for one song (plan section 7). Edits stay on the phone until
/// Confirm, which needs the server; transpose and capo work offline.
class SongCubit extends Cubit<SongState> {
  SongCubit({
    required this.songId,
    required this._library,
    required this._events,
    this.changeLogDelay = const Duration(seconds: 1),
  }) : super(const SongState());

  final String songId;
  final LibraryRepository _library;
  final EventLog _events;
  final Duration changeLogDelay;
  final _pendingLogs = <EventType, (Timer, int, int)>{};

  /// Shows the saved copy at once, then fetches the latest one from the server.
  Future<void> load() async {
    final cached = await _library.cachedSong(songId);
    if (cached != null) _show(cached, fromCache: true);
    emit(state.copyWith(refreshing: true));
    try {
      final fresh = await _library.refreshSong(songId);
      // Keep anything edited here while the fresh copy was on its way.
      _show(fresh, fromCache: false, keepEdits: cached != null);
    } on ApiException catch (e) {
      emit(
        state.copyWith(
          loading: false,
          refreshing: false,
          error: () => cached == null ? e : null,
        ),
      );
    }
    _events.log(EventType.openSong, songId: songId);
  }

  void _show(
    MobileSong song, {
    required bool fromCache,
    bool keepEdits = false,
  }) {
    PrefField<int> pick(PrefField<int>? local, PrefField<int> server) =>
        keepEdits && local?.state == PrefState.edited ? local! : server;
    emit(
      state.copyWith(
        song: song,
        transpose: pick(state.transpose, song.prefs.transpose),
        capo: pick(state.capo, song.prefs.capo),
        loading: false,
        refreshing: false,
        fromCache: fromCache,
        error: () => null,
      ),
    );
  }

  void transposeBy(int delta) =>
      setTranspose((state.transpose?.value ?? 0) + delta);

  void setTranspose(int value) {
    final current = state.transpose;
    if (current == null) return;
    final next = normalizeTranspose(value);
    if (next == current.value && current.state == PrefState.edited) return;
    _logChange(EventType.transposeChange, current.value, next);
    emit(state.copyWith(transpose: current.edited(next), justConfirmed: false));
  }

  void setCapo(int fret) {
    final current = state.capo;
    if (current == null) return;
    final next = fret.clamp(0, maxCapo);
    if (next == current.value && current.state == PrefState.edited) return;
    _logChange(EventType.capoChange, current.value, next);
    emit(state.copyWith(capo: current.edited(next), justConfirmed: false));
  }

  /// One event per field once the value settles, from where it started (like the web app).
  void _logChange(EventType type, int from, int to) {
    final pending = _pendingLogs.remove(type);
    pending?.$1.cancel();
    final origin = pending?.$2 ?? from;
    final timer = Timer(changeLogDelay, () {
      _pendingLogs.remove(type);
      _sendChange(type, origin, to);
    });
    _pendingLogs[type] = (timer, origin, to);
  }

  void _sendChange(EventType type, int from, int to) {
    if (from != to) {
      _events.log(type, songId: songId, payload: {'from': from, 'to': to});
    }
  }

  /// Saves transpose and capo as confirmed. Audio pitch and strum keep their current values
  /// (audio pitch follows the transpose when it is linked, as on the web).
  Future<void> confirm() async {
    final song = state.song;
    final transpose = state.transpose;
    final capo = state.capo;
    if (song == null || transpose == null || capo == null || state.saving) {
      return;
    }
    emit(
      state.copyWith(saving: true, saveError: () => null, justConfirmed: false),
    );
    final prefs = song.prefs;
    try {
      final updated = await _library.confirm(song, {
        'transposeSemitones': transpose.value,
        'audioPitchSemitones': prefs.pitchLinked
            ? song.soundingAt(transpose.value).audioShift
            : prefs.audioPitch.value,
        'pitchLinked': prefs.pitchLinked,
        'capoFret': capo.value,
        'strumPatternId': prefs.strum.value,
      });
      emit(
        state.copyWith(
          song: updated,
          transpose: updated.prefs.transpose,
          capo: updated.prefs.capo,
          saving: false,
          fromCache: false,
          justConfirmed: true,
        ),
      );
    } on ApiException catch (e) {
      emit(
        state.copyWith(
          saving: false,
          saveError: () => e.isOffline
              ? "Can't reach the Chordus server, so this isn't saved yet. "
                    'Your changes stay on screen; confirm again when connected.'
              : e.message,
        ),
      );
    }
  }

  @override
  Future<void> close() {
    // Send pending change events now rather than dropping them.
    for (final MapEntry(key: type, value: (timer, from, to))
        in _pendingLogs.entries) {
      timer.cancel();
      _sendChange(type, from, to);
    }
    _pendingLogs.clear();
    return super.close();
  }
}
