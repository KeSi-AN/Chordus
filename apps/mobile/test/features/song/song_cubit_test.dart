import 'dart:io';

import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/events/event_log.dart';
import 'package:chordus/core/storage/json_store.dart';
import 'package:chordus/features/library/data/library_repository.dart';
import 'package:chordus/features/settings/domain/server_settings.dart';
import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:chordus/features/song/presentation/song_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_server.dart';

void main() {
  late Directory dir;
  late FakeServer server;
  late LibraryRepository library;
  late EventLog events;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('chordus-test-');
    server = FakeServer();
    final api = ChordusApi(
      settings: () => const ServerSettings(baseUrl: 'http://192.168.1.20:3000'),
      client: server.client,
    );
    final store = JsonStore(dir);
    library = LibraryRepository(api, store);
    events = EventLog(api, store);
  });

  tearDown(() async {
    await events
        .flush(); // let queued event writes finish before removing their folder
    dir.deleteSync(recursive: true);
  });

  SongCubit cubit(String id) => SongCubit(
    songId: id,
    library: library,
    events: events,
    changeLogDelay: Duration.zero,
  );

  test('normalizeTranspose wraps like the web app', () {
    expect(normalizeTranspose(12), 0);
    expect(normalizeTranspose(-12), 0);
    expect(normalizeTranspose(13), 1);
    expect(normalizeTranspose(-13), -1);
    expect(normalizeTranspose(-5), -5);
  });

  test(
    'loads the suggestion, then edits stay local and wrap at an octave',
    () async {
      final c = cubit('seed-amazing-grace');
      await c.load();
      expect(c.state.transpose?.value, -2);
      expect(c.state.transpose?.state, PrefState.suggested);
      expect(c.state.soundingKey, 'F');
      expect(c.state.shapeKey, 'D'); // suggested capo 3

      c
        ..setTranspose(11)
        ..transposeBy(1);
      expect(c.state.transpose?.value, 0);
      expect(c.state.transpose?.state, PrefState.edited);
      expect(c.state.dirty, isTrue);
      c.setCapo(0);
      expect(c.state.chordTable['G'], 'G');
      c.setCapo(42);
      expect(c.state.capo?.value, maxCapo);
      await c.close();
    },
  );

  test(
    'confirm sends the linked audio shift and marks everything confirmed',
    () async {
      final c = cubit('seed-amazing-grace');
      await c.load();
      c
        ..setTranspose(7)
        ..setCapo(2);
      await c.confirm();
      expect(server.confirms.single, {
        'transposeSemitones': 7,
        'audioPitchSemitones': -5, // same chords as +7, smaller audio shift
        'pitchLinked': true,
        'capoFret': 2,
        'strumPatternId': 'preset-waltz-downs',
      });
      expect(c.state.allConfirmed, isTrue);
      expect(c.state.dirty, isFalse);
      expect(c.state.justConfirmed, isTrue);
      await c.close();
    },
  );

  test(
    'offline: shows the saved copy, keeps edits when confirm fails',
    () async {
      await cubit('seed-clementine').load(); // saves a copy
      server.offline = true;
      final c = cubit('seed-clementine');
      await c.load();
      expect(c.state.song?.title, 'Oh My Darling, Clementine');
      expect(c.state.fromCache, isTrue);
      expect(c.state.error, isNull);

      c.transposeBy(1);
      await c.confirm();
      expect(c.state.saveError, contains("isn't saved yet"));
      expect(c.state.transpose?.state, PrefState.edited);
      await c.close();
    },
  );

  test(
    'a song never synced and no server is an error, not a blank page',
    () async {
      server.offline = true;
      final c = cubit('seed-clementine');
      await c.load();
      expect(c.state.song, isNull);
      expect(c.state.error?.failure, ApiFailure.unreachable);
      await c.close();
    },
  );

  test('logs the open and one change event per settled value', () async {
    final c = cubit('seed-amazing-grace');
    await c.load();
    c
      ..transposeBy(1)
      ..transposeBy(1)
      ..transposeBy(1);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await c.close();
    await events.flush();
    final types = server.events.map((e) => e['type']).toList();
    expect(types, ['open_song', 'transpose_change']);
    expect(server.events.last['payload'], containsPair('from', -2));
    expect(server.events.last['payload'], containsPair('to', 1));
    expect(server.events.last['payload'], containsPair('client', 'android'));
  });
}
