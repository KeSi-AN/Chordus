import 'dart:async';

import 'package:chordus/app/router.dart';
import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/core/events/event_log.dart';
import 'package:chordus/core/theme/app_theme.dart';
import 'package:chordus/features/library/data/library_repository.dart';
import 'package:chordus/features/library/presentation/library_cubit.dart';
import 'package:chordus/features/settings/data/settings_repository.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Everything the screens need from outside. `main.dart` passes the real implementations;
/// tests pass fakes (an http MockClient, a temporary folder).
class AppServices {
  const AppServices({
    required this.settings,
    required this.api,
    required this.library,
    required this.events,
    this.keepAwake = true,
  });

  final SettingsRepository settings;
  final ChordusApi api;
  final LibraryRepository library;
  final EventLog events;

  /// Keep the screen on while a song is open.
  final bool keepAwake;
}

class ChordusApp extends StatefulWidget {
  const ChordusApp({required this.services, super.key});

  final AppServices services;

  @override
  State<ChordusApp> createState() => _ChordusAppState();
}

class _ChordusAppState extends State<ChordusApp> {
  late final GoRouter _router = buildRouter(widget.services);

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.services;
    return BlocProvider(
      create: (_) {
        final cubit = LibraryCubit(
          library: s.library,
          settings: s.settings,
          events: s.events,
        );
        unawaited(cubit.start());
        return cubit;
      },
      child: MaterialApp.router(
        title: 'Chordus',
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        routerConfig: _router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}
