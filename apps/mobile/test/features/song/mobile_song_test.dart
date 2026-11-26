import 'package:chordus/features/song/domain/mobile_song.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_server.dart';

void main() {
  final grace = MobileSong.fromJson(fixture('amazing_grace')['song'] as Json);
  final clementine = MobileSong.fromJson(fixture('clementine')['song'] as Json);

  test('parses the sheet, prefs and lookup tables', () {
    expect(grace.title, 'Amazing Grace');
    expect(grace.sheet!.chords, ['G', 'G7', 'C', 'D', 'Em']);
    expect(grace.sheet!.sections.first.label, 'Verse 1');
    expect(grace.prefs.transpose.state, PrefState.suggested);
    expect(clementine.prefs.capo, isA<PrefField<int>>());
    expect(clementine.prefs.capo.state, PrefState.confirmed);
    expect(clementine.sheet!.sections[1].kind, 'chorus');
  });

  test(
    'looks chords up for any transpose and capo, negative ones included',
    () {
      // Down 2 with no capo: G -> F.
      expect(grace.chordTable(-2, 0), {
        'G': 'F',
        'G7': 'F7',
        'C': 'Bb',
        'D': 'C',
        'Em': 'Dm',
      });
      expect(grace.chordTable(10, 0), grace.chordTable(-2, 0));
      // Up 3 with capo 3: the shapes are the original ones.
      expect(grace.chordTable(3, 3)['G'], 'G');
      expect(grace.soundingAt(-2).key, 'F');
      expect(grace.soundingAt(0).capoOptions.first.capo, 0);
      expect(grace.soundingAt(-2).audioShift, -2);
      expect(grace.soundingAt(7).audioShift, -5);
      expect(grace.shapesAt(-2, 3).key, 'D');
    },
  );

  test('takes new prefs after a confirm without losing the rest', () {
    final updated = grace.withPrefs(clementine.raw['prefs'] as Json);
    expect(updated.prefs.capo.state, PrefState.confirmed);
    expect(updated.sheet!.chords, grace.sheet!.chords);
    expect(updated.raw['prefs'], clementine.raw['prefs']);
  });

  test('PrefField.edited marks a value as changed here', () {
    final edited = grace.prefs.transpose.edited(1);
    expect(edited.value, 1);
    expect(edited.state, PrefState.edited);
    expect(edited.reason, contains('not saved'));
  });
}
