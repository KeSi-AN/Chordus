import 'dart:convert';
import 'dart:io';

import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// JSON produced by the real API code (see apps/mobile/test/fixtures, generated from
/// `getMobileSong` / `listMobileSongs` on the seeded public-domain songs).
Json fixture(String name) =>
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Json;

/// A stand-in for the Chordus web app's API, backed by the fixtures.
class FakeServer {
  FakeServer({this.token}) {
    songs = {
      for (final name in ['amazing_grace', 'clementine'])
        (fixture(name)['song'] as Json)['id'] as String:
            fixture(name)['song'] as Json,
    };
    library = (fixture('songs')['songs'] as List<dynamic>)
        .cast<Json>()
        .where((s) => songs.containsKey(s['id']))
        .toList();
  }

  /// When set, requests need `Authorization: Bearer <token>`.
  final String? token;
  late Map<String, Json> songs;
  late List<Json> library;
  bool offline = false;
  final requests = <http.Request>[];
  final confirms = <Json>[];
  final events = <Json>[];

  int songRequests(String id) =>
      requests.where((r) => r.url.path == '/api/mobile/songs/$id').length;

  /// Bumps a song's version, as an edit on the laptop would.
  void touch(String id) {
    final row = library.firstWhere((s) => s['id'] == id);
    final version = '${row['version']}.1';
    row['version'] = version;
    songs[id] = {...songs[id]!, 'version': version};
  }

  late final http.Client client = MockClient((request) async {
    requests.add(request);
    if (offline) throw const SocketException('Network is unreachable');
    if (token != null && request.headers['Authorization'] != 'Bearer $token') {
      return _json(401, {'error': 'This Chordus server needs an access token'});
    }
    final path = request.url.path;
    if (path == '/api/mobile/ping') {
      return _json(200, {'ok': true, 'app': 'chordus', 'api': 1});
    }
    if (path == '/api/mobile/songs') return _json(200, {'songs': library});
    if (path == '/api/events') {
      events.add(jsonDecode(request.body) as Json);
      return http.Response('', 204);
    }
    final song = RegExp(r'^/api/mobile/songs/([^/]+)$').firstMatch(path);
    if (song != null) {
      final json = songs[Uri.decodeComponent(song.group(1)!)];
      return json == null
          ? _json(404, {'error': 'Song not found'})
          : _json(200, {'song': json});
    }
    final confirm = RegExp(r'^/api/songs/([^/]+)/prefs/confirm$')
        .firstMatch(path);
    if (confirm != null && request.method == 'POST') {
      final body = jsonDecode(request.body) as Json;
      confirms.add(body);
      final id = Uri.decodeComponent(confirm.group(1)!);
      final at = DateTime.utc(2026, 11, 26).toIso8601String();
      Json field(Object? value) => {
        'value': value,
        'state': 'confirmed',
        'source': 'user',
        'confidence': 1,
        'reason': 'Confirmed 2026-11-26',
      };
      final prefs = {
        'transpose': field(body['transposeSemitones']),
        'audioPitch': field(body['audioPitchSemitones']),
        'capo': field(body['capoFret']),
        'strum': field(body['strumPatternId']),
        'pitchLinked': body['pitchLinked'],
        'confirmedAt': at,
      };
      songs[id] = {...songs[id]!, 'prefs': prefs};
      return _json(200, {'prefs': prefs});
    }
    return _json(404, {'error': 'Not found'});
  });

  static http.Response _json(int status, Object body) => http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}
