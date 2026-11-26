import 'dart:async';

import 'package:chordus/app/app.dart';
import 'package:chordus/features/library/presentation/library_cubit.dart';
import 'package:chordus/features/library/presentation/library_page.dart';
import 'package:chordus/features/settings/presentation/settings_page.dart';
import 'package:chordus/features/song/presentation/song_cubit.dart';
import 'package:chordus/features/song/presentation/song_page.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

abstract final class AppRoutes {
  static const library = '/';
  static const settings = '/settings';
  static String song(String id) => '/songs/${Uri.encodeComponent(id)}';
}

GoRouter buildRouter(AppServices services) => GoRouter(
  routes: [
    GoRoute(
      path: AppRoutes.library,
      builder: (context, state) => const LibraryPage(),
    ),
    GoRoute(
      path: '/songs/:id',
      builder: (context, state) => BlocProvider(
        create: (_) {
          final cubit = SongCubit(
            songId: state.pathParameters['id']!,
            library: services.library,
            events: services.events,
          );
          unawaited(cubit.load());
          return cubit;
        },
        child: SongPage(
          settings: services.settings,
          keepAwake: services.keepAwake,
        ),
      ),
    ),
    GoRoute(
      path: AppRoutes.settings,
      builder: (context, state) => SettingsPage(
        settings: services.settings,
        api: services.api,
        onSaved: () => unawaited(context.read<LibraryCubit>().sync()),
      ),
    ),
  ],
);
