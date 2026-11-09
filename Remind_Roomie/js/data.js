const householdData = {
    // Each person gets one color from this list when they join. The profile color is
    // the bright shade; the secondary is the lighter card shade.
    colorPalette: [
        { color: "#C0E4A4", secondary: "#dff5d0" },
        { color: "#B9C8FC", secondary: "#D9E2FF" },
        { color: "#90cdd8", secondary: "#CDE7EC" },
        { color: "#E8C2E8", secondary: "#FBE0FB" },
        { color: "#E8A6A7", secondary: "#f5cccc" },
        { color: "#EDED97", secondary: "#FBFFD0" },
        { color: "#FAD5B0", secondary: "#faebd9" },
        { color: "#8da9aecb", secondary: "#d3dbde" }
    ],

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

    calendar: {
        personal: [
            {
                id: "personal-dentist",
                endTime: "11:00",
                title: "Dentist appointment",
                date: "2026-11-09",
                time: "10:30",
                location: "Smile Dental, Oak St",
                description: "Ask about the cleaning appointment."
            },
            {
                id: "personal-gym",
                endTime: "08:00",
                title: "Gym session",
                date: "2026-11-14",
                time: "07:00",
                location: "City Gym",
                description: ""
            },
            {
                id: "personal-dinner",
                endTime: "21:00",
                title: "Dinner with Nadia",
                date: "2026-11-20",
                time: "19:00",
                location: "Mario's Kitchen",
                description: "Book a table for two."
            },
            {
                id: "personal-football",
                endTime: "20:00",
                title: "Five-a-side football",
                date: "2026-11-08",
                time: "18:30",
                location: "Hackney Pitch",
                description: "Bring water."
            },
            {
                id: "personal-coffee",
                endTime: "11:00",
                title: "Coffee with Tom",
                date: "2026-11-11",
                time: "10:00",
                location: "Blue Bottle",
                description: ""
            },
            {
                id: "personal-birthday",
                endTime: "14:00",
                title: "Mum's birthday",
                date: "2026-11-27",
                time: "12:00",
                location: "Home",
                description: "Pick up the cake on the way."
            }
        ],

        // Personal events of the other housemates, visible on the shared calendar
        housemates: [
            {
                id: "nadia-yoga",
                endTime: "10:00",
                title: "Yoga class",
                date: "2026-11-06",
                time: "09:00",
                location: "Riverside Studio",
                description: "Bring a mat.",
                owner: "Nadia"
            },
            {
                id: "george-golf",
                endTime: "12:00",
                title: "Golf with Mark",
                date: "2026-11-08",
                time: "08:30",
                location: "Greenfield Club",
                description: "Tee time booked.",
                owner: "George"
            },
            {
                id: "rubina-hair",
                endTime: "15:00",
                title: "Hair appointment",
                date: "2026-11-10",
                time: "14:00",
                location: "Studio 9",
                description: "",
                owner: "Rubina"
            },
            {
                id: "nadia-shift",
                endTime: "17:00",
                title: "Work shift",
                date: "2026-11-11",
                time: "13:00",
                location: "Cafe Lune",
                description: "",
                owner: "Nadia"
            },
            {
                id: "george-gym",
                endTime: "19:00",
                title: "Gym",
                date: "2026-11-13",
                time: "18:00",
                location: "City Gym",
                description: "",
                owner: "George"
            }
        ],

        shared: [
            {
                id: "shared-wedding",
                endTime: "21:00",
                title: "Jane's Wedding",
                date: "2026-11-06",
                time: "18:00",
                location: "Event Hall",
                description: "Bring a gift and be ready for dancing.",
                addedBy: "Rubina"
            },
            {
                id: "shared-meeting",
                endTime: "18:00",
                title: "Household Meeting",
                date: "2026-11-07",
                time: "17:00",
                location: "Living room",
                description: "Chores and bills for December.",
                addedBy: "Rubina"
            },
            {
                id: "shared-groceries",
                endTime: "12:00",
                title: "Grocery run",
                date: "2026-11-12",
                time: "11:00",
                location: "Supermarket",
                description: "Milk, eggs, bread, and cleaning supplies.",
                addedBy: "George"
            },
            {
                id: "shared-bins",
                endTime: "08:30",
                title: "Bin day",
                date: "2026-11-22",
                time: "08:00",
                location: "",
                description: "Take the recycling out tonight.",
                addedBy: "Nadia"
            },
            {
                id: "shared-movie",
                endTime: "22:30",
                title: "Family movie night",
                date: "2026-11-28",
                time: "20:00",
                location: "Home",
                description: "Vote on the film.",
                addedBy: "George"
            }
        ]
    },

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
            initials: "D",
            color: "#C0E4A4",
            secondary: "#D1F4B9"
        },
        {
            name: "George",
            role: "Father",
            initials: "G",
            color: "#B9C8FC",
            secondary: "#D9E2FF"
        },
        {
            name: "Nadia",
            role: "Sister",
            initials: "N",
            color: "#B2E6EF",
            secondary: "#CDE7EC"
        },
        {
            name: "Rubina",
            role: "Mother",
            initials: "R",
            color: "#E8C2E8",
            secondary: "#FBE0FB"
        }
    ]
};

// Expose the existing demo data object so authenticated modules can scope it to a household.
window.householdData = householdData;