
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../data/sample_data.dart';

class HtmlPage extends StatefulWidget {
  final String assetPath;

  const HtmlPage({
    super.key,
    required this.assetPath,
  });

  @override
  State<HtmlPage> createState() => _HtmlPageState();
}

class _HtmlPageState extends State<HtmlPage> {
  late final WebViewController controller;

  @override
  void initState() {
    super.initState();

    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'FlutterData',
        onMessageReceived: (message) {
          debugPrint('Message from HTML: ${message.message}');
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (url) async {
            await controller.runJavaScript(
              'window.loadHouseholdData(${jsonEncode({
                'householdName': SampleData.householdName,
                'members': SampleData.members.map((member) => {
                  'id': member.id,
                  'name': member.name,
                  'role': member.role,
                }).toList(),
                'tasks': SampleData.tasks.map((task) => {
                  'id': task.id,
                  'title': task.title,
                  'assignedTo': task.assignedTo,
                  'due': task.due,
                  'completed': task.completed,
                  'visibility': task.visibility,
                }).toList(),
              })});',
            );
          },
        ),
      )
      ..loadFlutterAsset(widget.assetPath);
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: controller);
  }
}
