const householdData = {
    user: {
        name: "Dan",
        greeting: "Morning!",
        initials: "D"
    },

    progress: {
        completed: 5,
        total: 7
    },

    events: [
        {
            title: "Jane's Wedding",
            date: "Today",
            time: "6:00 PM",
            initials: "J",
            type: "event"
        },
        {
            title: "Household Meeting",
            date: "Tomorrow",
            time: "5:00 PM",
            initials: "H",
            type: "event"
        }
    ],

    tasks: [
        {
            id: "sample-task-clean-kitchen",
            title: "Clean Kitchen",
            assignedTo: "Dan",
            assignedBy: "Rubina",
            dueDate: "November 6",
            dueTime: "5:00 PM",
            status: "Requested"
        },
        {
            id: "sample-task-take-meat-out",
            title: "Take meat out",
            assignedTo: "Dan",
            dueDate: "Today",
            assignedBy: "Dan",
            status: "Completed"
        },
        {
            id: "sample-task-take-out-trash",
            title: "Take out the trash",
            assignedTo: "Dan",
            assignedBy: "Rubina",
            dueDate: "Tomorrow",
            status: "Requested"
        },
        {
            id: "sample-task-wash-dishes",
            title: "Wash the dishes",
            assignedTo: "Dan",
            assignedBy: "Rubina",
            dueDate: "Tomorrow",
            status: "Requested"
        }
    ],

    family: [
        {
            name: "Dan",
            role: "You",
            initials: "D"
        },
        {
            name: "George",
            role: "Father",
            initials: "G"
        },
        {
            name: "Nadia",
            role: "Sister",
            initials: "N"
        },
        {
            name: "Rubina",
            role: "Mother",
            initials: "R"
        }
    ]
};