import 'dart:async';

import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/features/settings/data/settings_repository.dart';
import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:chordus/features/song/presentation/sheet_view.dart';
import 'package:chordus/features/song/presentation/song_cubit.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:material_ui/material_ui.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// "+2", "−3" (unicode minus), "0", like the web app.
String formatSemitones(int n) => n == 0 ? '0' : (n > 0 ? '+$n' : '−${-n}');

class SongPage extends StatefulWidget {
  const SongPage({required this.settings, this.keepAwake = true, super.key});

  final SettingsRepository settings;

  /// Keep the screen on while a sheet is open (off in widget tests: no platform channel).
  final bool keepAwake;

  @override
  State<SongPage> createState() => _SongPageState();
}

class _SongPageState extends State<SongPage>
    with SingleTickerProviderStateMixin {
  final _scroll = ScrollController();
  late double _fontSize = widget.settings.fontSize;
  late final Ticker _ticker = createTicker(_onTick);
  Duration _lastTick = Duration.zero;
  double _carry = 0;
  double _scrollSpeed = 1;

  @override
  void initState() {
    super.initState();
    if (widget.keepAwake) {
      unawaited(WakelockPlus.enable().catchError((Object _) {}));
    }
  }

  @override
  void dispose() {
    if (widget.keepAwake) {
      unawaited(WakelockPlus.disable().catchError((Object _) {}));
    }
    _ticker.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _setFont(double size) {
    final next = size.clamp(
      SettingsRepository.minFontSize,
      SettingsRepository.maxFontSize,
    );
    setState(() => _fontSize = next);
    unawaited(widget.settings.saveFontSize(next));
  }

  // Auto-scroll: speed follows the BPM and the text size, like the web app.
  void _toggleScroll() {
    setState(() {
      if (_ticker.isActive) {
        _ticker.stop();
      } else {
        _lastTick = Duration.zero;
        _ticker.start();
      }
    });
  }

  void _onTick(Duration elapsed) {
    final bpm = context.read<SongCubit>().state.song?.bpm ?? 90;
    final dt = (elapsed - _lastTick).inMicroseconds / 1e6;
    _lastTick = elapsed;
    if (!_scroll.hasClients) return;
    _carry += 14 * (bpm / 100) * (_fontSize / 16) * _scrollSpeed * dt;
    if (_carry < 1) return;
    final whole = _carry.floorToDouble();
    _carry -= whole;
    final position = _scroll.position;
    if (position.pixels >= position.maxScrollExtent) {
      setState(_ticker.stop);
      return;
    }
    _scroll.jumpTo(
      (position.pixels + whole).clamp(0, position.maxScrollExtent),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<SongCubit, SongState>(
      listenWhen: (a, b) =>
          (b.saveError != null && a.saveError != b.saveError) ||
          (b.justConfirmed && !a.justConfirmed),
      listener: (context, state) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(
              content: Text(
                state.saveError ?? 'Confirmed. These settings load next time.',
              ),
            ),
          );
      },
      builder: (context, state) {
        final song = state.song;
        return Scaffold(
          appBar: AppBar(
            title: song == null
                ? const Text('Song')
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(song.title, overflow: TextOverflow.ellipsis),
                      Text(
                        song.artist.isEmpty ? 'Unknown artist' : song.artist,
                        style: Theme.of(context).textTheme.bodySmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
            actions: [
              IconButton(
                tooltip: 'Smaller text',
                onPressed: () => _setFont(_fontSize - 1),
                icon: const Icon(Icons.text_decrease),
              ),
              IconButton(
                tooltip: 'Larger text',
                onPressed: () => _setFont(_fontSize + 1),
                icon: const Icon(Icons.text_increase),
              ),
              IconButton(
                tooltip: _ticker.isActive ? 'Stop scrolling' : 'Auto-scroll',
                isSelected: _ticker.isActive,
                onPressed: song?.sheet == null ? null : _toggleScroll,
                icon: const Icon(Icons.keyboard_double_arrow_down),
                selectedIcon: const Icon(Icons.pause),
              ),
            ],
          ),
          body: _body(context, state),
          bottomNavigationBar: song == null ? null : _Controls(state: state),
        );
      },
    );
  }

  Widget _body(BuildContext context, SongState state) {
    final song = state.song;
    if (song == null) {
      if (state.loading) {
        return const Center(child: CircularProgressIndicator());
      }
      return _Message(
        icon: Icons.cloud_off,
        text: state.error?.failure == ApiFailure.notFound
            ? 'This song was deleted on the server.'
            : "This song isn't saved on the phone yet, and the server can't be reached. "
                  '${state.error?.message ?? ''}',
      );
    }
    final sheet = song.sheet;
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        if (state.refreshing) const LinearProgressIndicator(minHeight: 2),
        if (state.fromCache && !state.refreshing)
          MaterialBanner(
            content: const Text(
              'Offline: showing the copy saved on this phone.',
            ),
            leading: const Icon(Icons.cloud_off),
            actions: [
              TextButton(
                onPressed: () => unawaited(context.read<SongCubit>().load()),
                child: const Text('Retry'),
              ),
            ],
          ),
        Expanded(
          child: NotificationListener<UserScrollNotification>(
            // Touching the sheet stops auto-scroll, so you can look back at a verse.
            onNotification: (_) {
              if (_ticker.isActive) setState(_ticker.stop);
              return false;
            },
            child: SingleChildScrollView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (state.capo != null &&
                      state.capo!.value > 0 &&
                      state.shapeKey != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        'Capo ${state.capo!.value}: chords below are ${state.shapeKey} shapes; '
                        'the song sounds in ${state.soundingKey}.',
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                    ),
                  if (sheet != null && sheet.isDetectedDraft)
                    Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      color: scheme.tertiaryContainer,
                      child: const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text(
                          'Draft detected from audio. Underlined chords are low-confidence; '
                          'check them by ear and fix them in the web app.',
                        ),
                      ),
                    ),
                  if (sheet == null)
                    const _Message(
                      icon: Icons.queue_music,
                      text:
                          'No chord sheet yet. Add one in the web app, or let the analyzer '
                          'detect the chords.',
                    )
                  else
                    SheetView(
                      sheet: sheet,
                      chordTable: state.chordTable,
                      fontSize: _fontSize,
                    ),
                ],
              ),
            ),
          ),
        ),
        if (_ticker.isActive)
          _ScrollSpeed(
            speed: _scrollSpeed,
            onChanged: (v) => setState(() => _scrollSpeed = v),
          ),
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 40,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
        const SizedBox(height: 12),
        Text(text, textAlign: TextAlign.center),
      ],
    ),
  );
}

class _ScrollSpeed extends StatelessWidget {
  const _ScrollSpeed({required this.speed, required this.onChanged});

  final double speed;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: Row(
      children: [
        const Text('Speed'),
        Expanded(
          child: Slider(
            value: speed,
            min: 0.2,
            max: 4,
            divisions: 38,
            label: '${speed.toStringAsFixed(1)}×',
            onChanged: onChanged,
          ),
        ),
        Text('${speed.toStringAsFixed(1)}×'),
      ],
    ),
  );
}

/// Transpose, key, capo and Confirm, in reach of a thumb.
class _Controls extends StatelessWidget {
  const _Controls({required this.state});

  final SongState state;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<SongCubit>();
    final transpose = state.transpose!;
    final capo = state.capo!;
    final song = state.song!;
    final scheme = Theme.of(context).colorScheme;
    final ranked = state.capoOptions.take(4).map((o) => o.capo).toList();
    final original = song.originalKey;

    return SafeArea(
      child: Material(
        elevation: 3,
        color: scheme.surfaceContainer,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  IconButton.outlined(
                    tooltip: 'Transpose down',
                    onPressed: () => cubit.transposeBy(-1),
                    icon: const Icon(Icons.remove),
                  ),
                  SizedBox(
                    width: 44,
                    child: Text(
                      formatSemitones(transpose.value),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton.outlined(
                    tooltip: 'Transpose up',
                    onPressed: () => cubit.transposeBy(1),
                    icon: const Icon(Icons.add),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Key ${state.soundingKey ?? '?'}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        if (original != null && original != state.soundingKey)
                          Text(
                            'orig. $original',
                            style: TextStyle(
                              fontSize: 12,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                      ],
                    ),
                  ),
                  PrefChip(field: transpose),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Text('Capo'),
                  const SizedBox(width: 8),
                  Expanded(
                    child: DropdownButton<int>(
                      key: const Key('capo'),
                      isExpanded: true,
                      value: capo.value,
                      onChanged: (v) => v == null ? null : cubit.setCapo(v),
                      items: [
                        for (var fret = 0; fret <= maxCapo; fret++)
                          DropdownMenuItem(
                            value: fret,
                            child: Text(_capoLabel(fret, ranked)),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  PrefChip(field: capo),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: state.saving
                        ? null
                        : () => unawaited(cubit.confirm()),
                    icon: state.saving
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check),
                    label: Text(
                      state.allConfirmed && !state.dirty
                          ? 'Confirmed'
                          : 'Confirm',
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _capoLabel(int fret, List<int> ranked) {
    final option = state.capoOptions.where((o) => o.capo == fret).firstOrNull;
    final rank = ranked.indexOf(fret);
    final star = rank == 0 ? ' ★' : (rank > 0 ? ' ☆' : '');
    final name = fret == 0 ? 'None' : '$fret';
    return option == null
        ? '$name$star'
        : '$name · ${option.shapeKey} shapes$star';
  }
}

/// "Suggested" / "Edited" / "Confirmed", with the reason one tap away (plan section 7).
class PrefChip extends StatelessWidget {
  const PrefChip({required this.field, super.key});

  final PrefField<Object?> field;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = switch (field.state) {
      PrefState.suggested => ('Suggested', scheme.onSurfaceVariant),
      PrefState.edited => ('Edited', scheme.tertiary),
      PrefState.confirmed => ('Confirmed', scheme.primary),
    };
    return Tooltip(
      message: field.reason,
      triggerMode: TooltipTriggerMode.tap,
      showDuration: const Duration(seconds: 4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          border: Border.all(color: color.withValues(alpha: 0.5)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, color: color)),
      ),
    );
  }
}
