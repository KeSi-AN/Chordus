import 'package:chordus/app/app.dart';
import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/events/event_log.dart';
import 'package:chordus/features/library/data/library_repository.dart';
import 'package:chordus/features/settings/data/settings_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_server.dart';
import 'helpers/memory_store.dart';

Future<(FakeServer, MemoryStore)> pumpApp(
  WidgetTester tester, {
  Map<String, Object> prefs = const {
    'server.baseUrl': 'http://192.168.1.20:3000',
  },
}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final settings = await SettingsRepository.load();
  final server = FakeServer();
  final api = ChordusApi(
    settings: () => settings.server,
    client: server.client,
  );
  final store = MemoryStore();
  await tester.pumpWidget(
    ChordusApp(
      services: AppServices(
        settings: settings,
        api: api,
        library: LibraryRepository(api, store),
        events: EventLog(api, store),
        keepAwake: false,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (server, store);
}

/// Chord cells on screen, in order.
List<String> chordsShown(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .where((t) => t.semanticsLabel?.startsWith('chord ') ?? false)
    .map((t) => t.data!.trim())
    .toList();

void main() {
  testWidgets('syncs the library, opens a song, transposes and confirms', (
    tester,
  ) async {
    final (server, store) = await pumpApp(tester);
    expect(find.text('Amazing Grace'), findsOneWidget);
    expect(find.text('Oh My Darling, Clementine'), findsOneWidget);
    expect(store.docs.keys, contains('songs/seed-amazing-grace'));

    await tester.enterText(find.byKey(const Key('search')), 'clem');
    await tester.pump();
    expect(find.text('Amazing Grace'), findsNothing);
    await tester.enterText(find.byKey(const Key('search')), '');
    await tester.pump(const Duration(seconds: 1));

    await tester.tap(find.text('Amazing Grace'));
    await tester.pumpAndSettle();
    // Suggested: down 2 (sounds in F) with capo 3, so the sheet shows D shapes.
    expect(find.text('Key F'), findsOneWidget);
    expect(find.textContaining('chords below are D shapes'), findsOneWidget);
    expect(chordsShown(tester).take(3), ['D', 'D7', 'G']);
    expect(find.text('Suggested'), findsNWidgets(2));

    await tester.tap(find.byTooltip('Transpose up'));
    await tester.tap(find.byTooltip('Transpose up'));
    await tester.pump();
    expect(find.text('Key G'), findsOneWidget);
    expect(find.text('Edited'), findsOneWidget);
    expect(chordsShown(tester).first, 'E'); // G shapes moved down by capo 3

    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(server.confirms.single['transposeSemitones'], 0);
    expect(server.confirms.single['capoFret'], 3);
    expect(
      find.text('Confirmed. These settings load next time.'),
      findsOneWidget,
    );
    expect(find.text('Confirmed'), findsWidgets);

    await tester.pump(
      const Duration(seconds: 2),
    ); // let the change-event timer run
  });

  testWidgets('shows the saved songs when the laptop is unreachable', (
    tester,
  ) async {
    final (server, _) = await pumpApp(tester);
    server.offline = true;
    await tester.tap(find.byTooltip('Sync'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Offline: showing the songs saved on this phone'),
      findsOneWidget,
    );
    expect(find.text('Amazing Grace'), findsOneWidget);

    await tester.tap(find.text('Oh My Darling, Clementine'));
    await tester.pumpAndSettle();
    expect(
      find.text('Offline: showing the copy saved on this phone.'),
      findsOneWidget,
    );
    expect(
      find.text('Confirmed'),
      findsWidgets,
    ); // its confirmed transpose and capo
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('asks to connect when no server is set up', (tester) async {
    final (server, _) = await pumpApp(tester, prefs: const {});
    expect(find.text('Connect to your Chordus server'), findsOneWidget);
    expect(server.requests, isEmpty);

    await tester.tap(find.text('Connect to your Chordus server'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('server-url')),
      'not a url ://',
    );
    await tester.tap(find.text('Save and connect'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter the address'), findsOneWidget);
  });
}
