import 'dart:io';

import 'package:chordus/app/app.dart';
import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/events/event_log.dart';
import 'package:chordus/core/storage/json_store.dart';
import 'package:chordus/features/library/data/library_repository.dart';
import 'package:chordus/features/settings/data/settings_repository.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(ChordusApp(services: await createServices()));
}

Future<AppServices> createServices() async {
  final settings = await SettingsRepository.load();
  final api = ChordusApi(settings: () => settings.server);
  final support = await getApplicationSupportDirectory();
  final store = JsonStore(Directory('${support.path}/library'));
  return AppServices(
    settings: settings,
    api: api,
    library: LibraryRepository(api, store),
    events: EventLog(api, store),
  );
}
