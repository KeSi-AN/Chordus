import 'dart:async';

import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/storage/json_store.dart';
import 'package:chordus/features/song/domain/mobile_song.dart';

/// The event types the server accepts from clients (`clientEventSchema` in the web app).
enum EventType { openSong, transposeChange, capoChange, search }

extension on EventType {
  String get wire => switch (this) {
    EventType.openSong => 'open_song',
    EventType.transposeChange => 'transpose_change',
    EventType.capoChange => 'capo_change',
    EventType.search => 'search',
  };
}

/// Usage events feed the voice-fit learning on the server (CLAUDE.md: log every meaningful
/// action). Events made offline are queued on the phone and sent on the next sync.
class EventLog {
  EventLog(this._api, this._store);

  final ChordusApi _api;
  final JsonStore _store;
  static const _queueName = 'event_queue';
  static const _maxQueued = 500;
  Future<void> _pending = Future.value();

  void log(EventType type, {String? songId, Json payload = const {}}) {
    final event = <String, dynamic>{
      'type': type.wire,
      'songId': songId,
      'payload': {
        ...payload,
        'client': 'android',
        'at': DateTime.now().toUtc().toIso8601String(),
      },
    };
    unawaited(
      _serial(() async {
        final queue = [...await _queue(), event];
        // When the phone has been offline for very long, the oldest events go first.
        final keep = queue.length > _maxQueued
            ? queue.sublist(queue.length - _maxQueued)
            : queue;
        await _store.write(_queueName, keep);
      }),
    );
    unawaited(flush());
  }

  /// Sends queued events, oldest first; stops at the first one that can't be delivered.
  Future<void> flush() => _serial(() async {
    final queue = await _queue();
    var sent = 0;
    for (final event in queue) {
      try {
        await _api.logEvent(event);
        sent++;
      } on ApiException catch (e) {
        if (e.isOffline || e.failure == ApiFailure.unauthorized) break;
        sent++; // The server refused this one (e.g. its song was deleted): drop it.
      }
    }
    if (sent > 0) await _store.write(_queueName, queue.skip(sent).toList());
  });

  Future<List<Json>> _queue() async =>
      ((await _store.read(_queueName)) as List<dynamic>? ?? const [])
          .cast<Json>();

  /// One read-modify-write of the queue at a time.
  Future<void> _serial(Future<void> Function() action) {
    final next = _pending.then((_) => action()).catchError((Object _) {});
    _pending = next;
    return next;
  }
}
