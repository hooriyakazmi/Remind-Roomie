
class HouseholdMember {
  final int id;
  final String name;
  final String role;

  const HouseholdMember({
    required this.id,
    required this.name,
    required this.role,
  });
}

class HouseholdTask {
  final int id;
  final String title;
  final String assignedTo;
  final String due;
  final bool completed;
  final String visibility;

  const HouseholdTask({
    required this.id,
    required this.title,
    required this.assignedTo,
    required this.due,
    required this.completed,
    required this.visibility,
  });
}

class SampleData {
  static const String householdName = 'The Johnsons';

  static const List<HouseholdMember> members = [
    HouseholdMember(id: 1, name: 'Rubina', role: 'Parent'),
    HouseholdMember(id: 2, name: 'Dan', role: 'Household Member'),
    HouseholdMember(id: 3, name: 'Emma', role: 'Household Member'),
    HouseholdMember(id: 4, name: 'Jake', role: 'Household Member'),
  ];

  static const List<HouseholdTask> tasks = [
    HouseholdTask(
      id: 1,
      title: 'Take out the trash',
      assignedTo: 'Dan',
      due: 'Today, 5:00 PM',
      completed: false,
      visibility: 'Household',
    ),
    HouseholdTask(
      id: 2,
      title: 'Load dishwasher',
      assignedTo: 'Emma',
      due: 'Today, 8:00 PM',
      completed: false,
      visibility: 'Household',
    ),
    HouseholdTask(
      id: 3,
      title: 'Get a Gift',
      assignedTo: 'Rubina',
      due: 'Tomorrow',
      completed: true,
      visibility: 'Household',
    ),
    HouseholdTask(
      id: 4,
      title: 'Clean Bathroom',
      assignedTo: 'Jake',
      due: 'Tomorrow',
      completed: true,
      visibility: 'Household',
    ),
    HouseholdTask(
      id: 5,
      title: 'Water the Plants',
      assignedTo: 'Rubina',
      due: 'Completed',
      completed: true,
      visibility: 'Household',
    ),
  ];

  static int get completedTasks =>
      tasks.where((task) => task.completed).length;

  static int get totalTasks => tasks.length;
}
