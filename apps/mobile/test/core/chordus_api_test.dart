import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/features/settings/domain/server_settings.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../helpers/fake_server.dart';

void main() {
  const base = 'http://192.168.1.20:3000';

  test('sends the access token and reads songs', () async {
    final server = FakeServer(token: 'secret');
    final api = ChordusApi(
      settings: () => const ServerSettings(baseUrl: base, token: 'secret'),
      client: server.client,
    );
    await api.ping();
    expect(
      (await api.songs()).map((s) => s['id']),
      contains('seed-amazing-grace'),
    );
    expect(server.requests.first.url.toString(), '$base/api/mobile/ping');
    expect(server.requests.first.headers['Authorization'], 'Bearer secret');
  });

  test('maps failures to what the user can do about them', () async {
    final server = FakeServer(token: 'secret');
    final wrongToken = ChordusApi(
      settings: () => const ServerSettings(baseUrl: base, token: 'nope'),
      client: server.client,
    );
    await expectLater(
      wrongToken.ping(),
      throwsA(
        isA<ApiException>().having(
          (e) => e.failure,
          'failure',
          ApiFailure.unauthorized,
        ),
      ),
    );

    server.offline = true;
    await expectLater(
      wrongToken.songs(),
      throwsA(
        isA<ApiException>().having((e) => e.isOffline, 'isOffline', true),
      ),
    );

    final unset = ChordusApi(
      settings: () => const ServerSettings(),
      client: server.client,
    );
    await expectLater(
      unset.songs(),
      throwsA(
        isA<ApiException>().having(
          (e) => e.failure,
          'failure',
          ApiFailure.notConfigured,
        ),
      ),
    );
  });

  test('notices when the address is some other web server', () async {
    final api = ChordusApi(
      settings: () => const ServerSettings(baseUrl: base),
      client: MockClient(
        (_) async => http.Response('<html>router login</html>', 200),
      ),
    );
    await expectLater(
      api.ping(),
      throwsA(
        isA<ApiException>().having(
          (e) => e.failure,
          'failure',
          ApiFailure.server,
        ),
      ),
    );
  });
}
