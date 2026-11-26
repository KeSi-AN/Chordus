import 'dart:convert';
import 'dart:io';

import 'package:chordus/core/storage/json_store.dart';

/// A [JsonStore] in memory, for widget tests (real file I/O doesn't run in their fake time).
class MemoryStore extends JsonStore {
  MemoryStore() : super(Directory('unused'));

  final docs = <String, String>{};

  @override
  Future<Object?> read(String name) async {
    final text = docs[name];
    return text == null ? null : jsonDecode(text);
  }

  @override
  Future<void> write(String name, Object? value) async =>
      docs[name] = jsonEncode(value);

  @override
  Future<void> delete(String name) async => docs.remove(name);
}
