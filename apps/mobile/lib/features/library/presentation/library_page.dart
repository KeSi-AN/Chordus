import 'dart:async';

import 'package:chordus/app/router.dart';
import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/features/library/domain/song_summary.dart';
import 'package:chordus/features/library/presentation/library_cubit.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

class LibraryPage extends StatelessWidget {
  const LibraryPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<LibraryCubit, LibraryState>(
      builder: (context, state) {
        final cubit = context.read<LibraryCubit>();
        return Scaffold(
          appBar: AppBar(
            title: const Text('Chordus'),
            actions: [
              IconButton(
                tooltip: 'Sync',
                onPressed: state.syncing ? null : () => unawaited(cubit.sync()),
                icon: const Icon(Icons.sync),
              ),
              IconButton(
                tooltip: 'Settings',
                onPressed: () => unawaited(context.push(AppRoutes.settings)),
                icon: const Icon(Icons.settings),
              ),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(64),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: TextField(
                  key: const Key('search'),
                  onChanged: cubit.search,
                  decoration: const InputDecoration(
                    hintText: 'Search title or artist',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                  ),
                ),
              ),
            ),
          ),
          body: Column(
            children: [
              if (state.syncing)
                LinearProgressIndicator(
                  minHeight: 2,
                  value: switch (state.progress) {
                    (final done, final total) when total > 0 => done / total,
                    _ => null,
                  },
                ),
              _StatusBanner(state: state),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: cubit.sync,
                  child: _SongList(state: state),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.state});

  final LibraryState state;

  @override
  Widget build(BuildContext context) {
    final error = state.error;
    if (error == null) return const SizedBox.shrink();
    final text = switch (error.failure) {
      ApiFailure.unreachable =>
        state.songs.isEmpty
            ? "Can't reach the Chordus server. Is `pnpm dev` running on the laptop?"
            : 'Offline: showing the songs saved on this phone.${_since(state.lastSync)}',
      ApiFailure.unauthorized =>
        'The server needs the access token. Check Settings.',
      _ => error.message,
    };
    return MaterialBanner(
      content: Text(text),
      leading: Icon(error.isOffline ? Icons.cloud_off : Icons.error_outline),
      actions: [
        TextButton(
          onPressed: () => unawaited(context.read<LibraryCubit>().sync()),
          child: const Text('Retry'),
        ),
      ],
    );
  }

  static String _since(DateTime? time) {
    if (time == null) return '';
    final ago = DateTime.now().difference(time);
    final text = ago.inMinutes < 1
        ? 'just now'
        : ago.inHours < 1
        ? '${ago.inMinutes} min ago'
        : ago.inDays < 1
        ? '${ago.inHours} h ago'
        : '${ago.inDays} d ago';
    return ' Last synced $text.';
  }
}

class _SongList extends StatelessWidget {
  const _SongList({required this.state});

  final LibraryState state;

  @override
  Widget build(BuildContext context) {
    if (!state.loaded) return const Center(child: CircularProgressIndicator());
    final songs = state.visible;
    if (songs.isEmpty) {
      // A ListView, so pull-to-refresh still works on an empty screen.
      return ListView(
        children: [
          const SizedBox(height: 80),
          Icon(
            Icons.library_music_outlined,
            size: 48,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 12),
          if (state.query.isNotEmpty)
            const Text('No songs match.', textAlign: TextAlign.center)
          else ...[
            const Text(
              'No songs on this phone yet.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Center(
              child: FilledButton.tonal(
                onPressed: () => unawaited(context.push(AppRoutes.settings)),
                child: const Text('Connect to your Chordus server'),
              ),
            ),
          ],
        ],
      );
    }
    return ListView.separated(
      itemCount: songs.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, i) => _SongTile(song: songs[i]),
    );
  }
}

class _SongTile extends StatelessWidget {
  const _SongTile({required this.song});

  final SongSummary song;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final key = song.originalKey;
    return ListTile(
      title: Text(song.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        song.artist.isEmpty ? 'Unknown artist' : song.artist,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (song.hasAudio)
            Icon(
              Icons.music_note,
              size: 18,
              color: scheme.onSurfaceVariant,
              semanticLabel: 'Has audio',
            ),
          if (key != null)
            Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                border: Border.all(color: scheme.outlineVariant),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(key, style: const TextStyle(fontFamily: 'monospace')),
            ),
          if (song.confirmed)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Icon(
                Icons.check_circle,
                size: 18,
                color: scheme.primary,
                semanticLabel: 'Confirmed',
              ),
            ),
        ],
      ),
      onTap: () => unawaited(context.push(AppRoutes.song(song.id))),
    );
  }
}
