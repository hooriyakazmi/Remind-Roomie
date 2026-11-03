
import 'package:flutter/material.dart';
import 'widgets/html_page.dart';

void main() {
  runApp(const RemindRoomieApp());
}

class RemindRoomieApp extends StatelessWidget {
  const RemindRoomieApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Remind Roomie',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF397C68),
        ),
        scaffoldBackgroundColor: const Color(0xFFF7F8F6),
        useMaterial3: true,
      ),
      home: const MainNavigation(),
    );
  }
}

class MainNavigation extends StatefulWidget {
  const MainNavigation({super.key});

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> {
  int selectedIndex = 0;

  final List<Widget> pages = const [
    HtmlPage(assetPath: 'assets/web/home.html'),
    HtmlPage(assetPath: 'assets/web/calendar.html'),
    HtmlPage(assetPath: 'assets/web/chores.html'),
    HtmlPage(assetPath: 'assets/web/family.html'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: selectedIndex,
          children: pages,
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: selectedIndex,
        onTap: (index) {
          setState(() {
            selectedIndex = index;
          });
        },
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFF265A51),
        unselectedItemColor: Colors.white,
        backgroundColor: Color(0xFF357266),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.calendar_month_outlined),
            label: 'Calendar',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.check_circle_outline),
            label: 'Chores',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.people_outline),
            label: 'Family',
          ),
        ],
      ),
    );
  }
}
