import 'dart:async';

import 'package:chordus/core/api/chordus_api.dart';
import 'package:chordus/features/settings/data/settings_repository.dart';
import 'package:chordus/features/settings/domain/server_settings.dart';
import 'package:material_ui/material_ui.dart';

/// Where the Chordus server is, and its access token. Saving checks the connection first.
class SettingsPage extends StatefulWidget {
  const SettingsPage({
    required this.settings,
    required this.api,
    required this.onSaved,
    super.key,
  });

  final SettingsRepository settings;
  final ChordusApi api;

  /// Called after a working address was saved (the library syncs).
  final VoidCallback onSaved;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final _url = TextEditingController(
    text: widget.settings.server.baseUrl ?? '',
  );
  late final _token = TextEditingController(
    text: widget.settings.server.token ?? '',
  );
  bool _checking = false;
  bool _showToken = false;
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    _token.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final url = normalizeBaseUrl(_url.text);
    if (url == null) {
      setState(
        () => _error =
            'Enter the address shown by the web app, e.g. 192.168.1.20:3000',
      );
      return;
    }
    final previous = widget.settings.server;
    final next = ServerSettings(baseUrl: url, token: _token.text.trim());
    setState(() {
      _checking = true;
      _error = null;
    });
    await widget.settings.saveServer(next);
    try {
      await widget.api.ping();
    } on ApiException catch (e) {
      // Keep the old settings: a typo shouldn't disconnect a working setup.
      await widget.settings.saveServer(previous);
      if (!mounted) return;
      setState(() {
        _checking = false;
        _error = switch (e.failure) {
          ApiFailure.unreachable =>
            "Can't reach $url. Is `pnpm dev` running on the laptop, on the same Wi-Fi? "
                'Windows Firewall may also need to allow Node.js on private networks.',
          ApiFailure.unauthorized => 'The server wants an access token: CHORDUS_API_TOKEN in its .env file.',
          _ => e.message,
        };
      });
      return;
    }
    if (!mounted) return;
    setState(() => _checking = false);
    _url.text = url;
    widget.onSaved();
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Connected')));
  }

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Chordus server',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'Run `pnpm dev` on your laptop and use its Wi-Fi address (on Windows: `ipconfig`, '
            '"IPv4 Address"). Songs are saved on the phone, so they also work away from the laptop.',
            style: muted,
          ),
          const SizedBox(height: 16),
          TextField(
            key: const Key('server-url'),
            controller: _url,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Server address',
              hintText: '192.168.1.20:3000',
            ),
            onSubmitted: (_) => unawaited(_save()),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('server-token'),
            controller: _token,
            obscureText: !_showToken,
            autocorrect: false,
            enableSuggestions: false,
            decoration: InputDecoration(
              labelText: 'Access token (if the server has one)',
              suffixIcon: IconButton(
                tooltip: _showToken ? 'Hide' : 'Show',
                onPressed: () => setState(() => _showToken = !_showToken),
                icon: Icon(
                  _showToken ? Icons.visibility_off : Icons.visibility,
                ),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _checking ? null : () => unawaited(_save()),
            child: _checking
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Save and connect'),
          ),
        ],
      ),
    );
  }
}
