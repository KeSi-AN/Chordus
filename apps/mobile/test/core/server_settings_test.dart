import 'package:chordus/features/settings/domain/server_settings.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('normalizeBaseUrl', () {
    test('accepts what people type, assuming http and port 3000', () {
      expect(normalizeBaseUrl('192.168.1.20'), 'http://192.168.1.20:3000');
      expect(
        normalizeBaseUrl(' 192.168.1.20:3111 '),
        'http://192.168.1.20:3111',
      );
      expect(
        normalizeBaseUrl('http://laptop.local:3000/'),
        'http://laptop.local:3000',
      );
      expect(
        normalizeBaseUrl('http://10.0.2.2:3000/some/path'),
        'http://10.0.2.2:3000',
      );
      expect(
        normalizeBaseUrl('https://chordus.example.com'),
        'https://chordus.example.com',
      );
    });

    test('refuses what is not an address', () {
      expect(normalizeBaseUrl(''), isNull);
      expect(normalizeBaseUrl('   '), isNull);
      expect(normalizeBaseUrl('ftp://192.168.1.20'), isNull);
      expect(normalizeBaseUrl('http://'), isNull);
    });
  });
}
