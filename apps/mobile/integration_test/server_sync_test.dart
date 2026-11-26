// Runs the real app on your phone (USB debugging on) against your Chordus server:
//
//   cd apps/mobile
//   flutter test integration_test
//     --dart-define=CHORDUS_URL=http://<laptop Wi-Fi IP>:3000
//     --dart-define=CHORDUS_TOKEN=<token, if the server has one>
//
// Skipped when CHORDUS_URL isn't given. Nothing is confirmed, so the server's data is left as
// it was, apart from usage events.
import 'package:chordus/app/app.dart';
import 'package:chordus/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const serverUrl = String.fromEnvironment('CHORDUS_URL');
const token = String.fromEnvironment('CHORDUS_TOKEN');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'syncs the library from the server and transposes a song offline',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        'server.baseUrl': serverUrl,
        if (token.isNotEmpty) 'server.token': token,
      });
      await tester.pumpWidget(ChordusApp(services: await createServices()));

      // Wait for the first sync (real network and disk).
      for (var i = 0; i < 60 && find.byType(ListTile).evaluate().isEmpty; i++) {
        await tester.pump(const Duration(milliseconds: 500));
      }
      await tester.pumpAndSettle();
      expect(find.byType(ListTile), findsWidgets);
      expect(find.textContaining("Can't reach"), findsNothing);

      await tester.tap(find.byType(ListTile).first);
      await tester.pumpAndSettle(const Duration(seconds: 1));
      final keyBefore = tester.widget<Text>(find.textContaining('Key ')).data;
      await tester.tap(find.byTooltip('Transpose up'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.textContaining('Key ')).data,
        isNot(keyBefore),
      );
      expect(find.text('Edited'), findsOneWidget);
    },
    skip: serverUrl.isEmpty,
  );
}
