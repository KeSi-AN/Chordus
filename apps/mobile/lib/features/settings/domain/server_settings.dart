import 'package:equatable/equatable.dart';

/// The port `pnpm dev` serves the web app on.
const defaultServerPort = 3000;

/// How to reach the Chordus server on the laptop.
class ServerSettings extends Equatable {
  const ServerSettings({this.baseUrl, this.token});

  /// e.g. `http://192.168.1.20:3000`; null until set up.
  final String? baseUrl;

  /// CHORDUS_API_TOKEN from the server's .env, if it has one.
  final String? token;

  bool get isConfigured => baseUrl != null;

  @override
  List<Object?> get props => [baseUrl, token];
}

/// Turns what someone types ("192.168.1.20", "laptop.local:3000", "http://…/") into a base URL,
/// or null if it isn't one. Plain HTTP and port 3000 are assumed when left out.
String? normalizeBaseUrl(String input) {
  var text = input.trim();
  if (text.isEmpty) return null;
  if (!text.contains('://')) text = 'http://$text';
  final uri = Uri.tryParse(text);
  if (uri == null ||
      uri.host.isEmpty ||
      !(uri.scheme == 'http' || uri.scheme == 'https')) {
    return null;
  }
  final port = uri.hasPort
      ? uri.port
      : (uri.scheme == 'http' ? defaultServerPort : null);
  return Uri(scheme: uri.scheme, host: uri.host, port: port).toString();
}
