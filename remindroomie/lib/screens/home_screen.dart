import 'package:flutter/material.dart';
import '../widgets/html_page.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const HtmlPage(
      assetPath: 'assets/web/home.html',
    );
  }
}
