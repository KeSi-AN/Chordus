import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:chordus/features/settings/domain/server_settings.dart';
import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:http/http.dart' as http;

enum ApiFailure {
  /// No server address saved yet.
  notConfigured,

  /// The laptop can't be reached (offline, other network, server not running, firewall).
  unreachable,

  /// The server wants an access token, or a different one.
  unauthorized,
  notFound,

  /// The server answered with an error, or with something that isn't Chordus.
  server,
}

class ApiException implements Exception {
  const ApiException(this.failure, this.message);

  final ApiFailure failure;
  final String message;

  /// Worth falling back to what is saved on the phone.
  bool get isOffline =>
      failure == ApiFailure.unreachable || failure == ApiFailure.notConfigured;

  @override
  String toString() => message;
}

/// Talks to the Chordus web app's API on the laptop.
class ChordusApi {
  ChordusApi({
    required this._settings,
    http.Client? client,
    this.timeout = const Duration(seconds: 10),
  }) : _client = client ?? http.Client();

  final ServerSettings Function() _settings;
  final http.Client _client;
  final Duration timeout;

  /// Checks the server is there and accepts the token.
  Future<void> ping() async {
    final body = await _send('GET', '/api/mobile/ping');
    if (body is! Map || body['app'] != 'chordus') {
      throw const ApiException(
        ApiFailure.server,
        "That address answered, but it isn't Chordus",
      );
    }
  }

  /// Every song in the library, with a version for syncing.
  Future<List<Json>> songs() async {
    final body = (await _send('GET', '/api/mobile/songs'))! as Json;
    return (body['songs'] as List<dynamic>).cast<Json>();
  }

  Future<Json> song(String id) async {
    final body =
        (await _send('GET', '/api/mobile/songs/${Uri.encodeComponent(id)}'))!
            as Json;
    return body['song'] as Json;
  }

  /// Saves the values as confirmed; returns the prefs as the server now has them.
  Future<Json> confirm(String songId, Json values) async {
    final body =
        (await _send(
              'POST',
              '/api/songs/${Uri.encodeComponent(songId)}/prefs/confirm',
              body: values,
            ))!
            as Json;
    return body['prefs'] as Json;
  }

  Future<void> logEvent(Json event) =>
      _send('POST', '/api/events', body: event);

  Future<Object?> _send(String method, String path, {Json? body}) async {
    final settings = _settings();
    final base = settings.baseUrl;
    if (base == null) {
      throw const ApiException(
        ApiFailure.notConfigured,
        'Set the server address in Settings',
      );
    }
    final request = http.Request(method, Uri.parse('$base$path'))
      ..headers['Accept'] = 'application/json';
    final token = settings.token;
    if (token != null && token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(
        await _client.send(request).timeout(timeout),
      ).timeout(timeout);
    } on TimeoutException {
      throw ApiException(
        ApiFailure.unreachable,
        "Can't reach $base (timed out)",
      );
    } on SocketException {
      throw ApiException(ApiFailure.unreachable, "Can't reach $base");
    } on http.ClientException {
      throw ApiException(ApiFailure.unreachable, "Can't reach $base");
    }

    final status = response.statusCode;
    if (status == 204) return null;
    Object? decoded;
    try {
      decoded = response.body.isEmpty
          ? null
          : jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      throw ApiException(
        ApiFailure.server,
        "$base answered, but it isn't Chordus",
      );
    }
    if (status >= 200 && status < 300) return decoded;
    final message = decoded is Map && decoded['error'] is String
        ? decoded['error'] as String
        : 'Request failed ($status)';
    throw ApiException(switch (status) {
      401 => ApiFailure.unauthorized,
      404 => ApiFailure.notFound,
      _ => ApiFailure.server,
    }, status == 401 ? 'Wrong or missing access token' : message);
  }

  void close() => _client.close();
}
