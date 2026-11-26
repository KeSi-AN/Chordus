import 'dart:convert';
import 'dart:io';

/// JSON documents in a folder on the phone: the offline copy of the library.
class JsonStore {
  JsonStore(this.root);

  final Directory root;

  File _file(String name) {
    if (!RegExp(r'^[\w./-]+$').hasMatch(name) ||
        name.split('/').contains('..')) {
      throw ArgumentError.value(name, 'name', 'not a safe document name');
    }
    return File('${root.path}/$name.json');
  }

  Future<Object?> read(String name) async {
    final file = _file(name);
    if (!file.existsSync()) return null;
    try {
      return jsonDecode(await file.readAsString());
    } on FormatException {
      return null; // A damaged copy is as good as none: the next sync replaces it.
    }
  }

  /// Writes through a temporary file, so a crash mid-write never leaves half a document.
  Future<void> write(String name, Object? value) async {
    final file = _file(name);
    await file.parent.create(recursive: true);
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsString(jsonEncode(value), flush: true);
    await tmp.rename(file.path);
  }

  Future<void> delete(String name) async {
    final file = _file(name);
    if (file.existsSync()) await file.delete();
  }
}
