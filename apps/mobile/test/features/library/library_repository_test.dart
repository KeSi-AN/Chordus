import 'dart:io';

import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/storage/json_store.dart';
import 'package:chordus/features/library/data/library_repository.dart';
import 'package:chordus/features/settings/domain/server_settings.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_server.dart';

void main() {
  late Directory dir;
  late FakeServer server;
  late LibraryRepository library;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('chordus-test-');
    server = FakeServer();
    final api = ChordusApi(
      settings: () => const ServerSettings(baseUrl: 'http://192.168.1.20:3000'),
      client: server.client,
    );
    library = LibraryRepository(api, JsonStore(dir));
  });

  tearDown(() => dir.deleteSync(recursive: true));

  test('downloads everything once, then only what changed', () async {
    final first = await library.sync();
    expect(first.downloaded, 2);
    expect((await library.cachedLibrary()).length, 2);
    expect(server.songRequests('seed-amazing-grace'), 1);

    final idle = await library.sync();
    expect(idle.downloaded, 0);

    server.touch('seed-amazing-grace');
    final second = await library.sync();
    expect(second.downloaded, 1);
    expect(server.songRequests('seed-amazing-grace'), 2);
    expect(server.songRequests('seed-clementine'), 1);
  });

  test('keeps working offline from the saved copy', () async {
    await library.sync();
    server.offline = true;
    await expectLater(library.sync(), throwsA(isA<ApiException>()));
    final song = await library.cachedSong('seed-clementine');
    expect(song?.title, 'Oh My Darling, Clementine');
    expect((await library.cachedLibrary()).length, 2);
  });

  test('forgets songs deleted on the server', () async {
    await library.sync();
    server.library.removeWhere((s) => s['id'] == 'seed-amazing-grace');
    final result = await library.sync();
    expect(result.removed, 1);
    expect(await library.cachedSong('seed-amazing-grace'), isNull);
  });

  test('skips a song deleted between the list and its download', () async {
    server.library.add({...server.library.first, 'id': 'gone', 'version': '1'});
    final result = await library.sync();
    expect(result.downloaded, 2);
    expect(
      (await library.cachedLibrary()).map((s) => s.id),
      isNot(contains('gone')),
    );
  });

  test('a confirm is saved on the phone too', () async {
    await library.sync();
    final song = (await library.cachedSong('seed-amazing-grace'))!;
    await library.confirm(song, {
      'transposeSemitones': 2,
      'audioPitchSemitones': 2,
      'pitchLinked': true,
      'capoFret': 0,
      'strumPatternId': null,
    });
    final saved = (await library.cachedSong('seed-amazing-grace'))!;
    expect(saved.prefs.transpose.value, 2);
    expect(
      (await library.cachedLibrary())
          .firstWhere((s) => s.id == song.id)
          .confirmed,
      isTrue,
    );
  });
}
