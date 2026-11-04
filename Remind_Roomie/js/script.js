
document.addEventListener("DOMContentLoaded", function () {

    // Make sure the shared data file is loaded
    if (typeof householdData === "undefined") {
        console.error("householdData was not found. Check that data.js is loaded.");
        return;
    }


    // --------------------------------
    // HOME PAGE
    // --------------------------------

    const homeEvents = document.getElementById("homeEvents");

    if (homeEvents) {

        // Display user information
        document.getElementById("profileAvatar").textContent =
            householdData.user.initials;

        document.getElementById("greeting").textContent =
            householdData.user.greeting;

        document.getElementById("userName").textContent =
            householdData.user.name;


        // Display current date
        const currentDate = new Date();

        document.getElementById("currentDate").textContent =
            currentDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric"
            });


        // Display task progress
        const completed = householdData.progress.completed;
        const total = householdData.progress.total;

        const percentage = total > 0
            ? Math.round((completed / total) * 100)
            : 0;

        document.getElementById("taskProgress").textContent =
            `${completed} of ${total} tasks completed`;

        document.getElementById("progressPercentage").textContent =
            `${percentage}%`;

        // Update progress ring
        document.getElementById("progressRing").style.background =
            `conic-gradient(#337c6e ${percentage}%, #ffffff ${percentage}%)`;


        // Display upcoming events
        homeEvents.innerHTML = householdData.events.map(event => `
            <div class="event-card">

                <div class="event-avatar">
                    ${event.initials}
                </div>

                <div class="event-details">
                    <h4>${event.title}</h4>
                    <p>${event.date} · ${event.time}</p>
                </div>

                <div class="event-indicator"></div>

            </div>
        `).join("");

    }


    // --------------------------------
    // CALENDAR PAGE
    // --------------------------------

    const calendarEvents = document.getElementById("calendarEvents");

    if (calendarEvents) {

        calendarEvents.innerHTML = householdData.events.map(event => `
            <div class="event-card">

                <div class="event-avatar">
                    ${event.initials}
                </div>

                <div class="event-details">
                    <h4>${event.title}</h4>
                    <p>${event.date} · ${event.time}</p>
                </div>

            </div>
        `).join("");

    }


    // --------------------------------
    // TASKS PAGE
    // --------------------------------

    const tasksList = document.getElementById("tasksList");

    if (tasksList) {

        tasksList.innerHTML = householdData.tasks.map(task => `
            <div class="task-card">

                <div class="task-info">
                    <h4>${task.title}</h4>
                    <p>Assigned to: ${task.assignedTo}</p>
                    <p>Due: ${task.dueDate}</p>
                </div>

                <span class="status ${task.status.toLowerCase()}">
                    ${task.status}
                </span>

            </div>
        `).join("");

    }


    // --------------------------------
    // FAMILY PAGE
    // --------------------------------

    const familyList = document.getElementById("familyList");

    if (familyList) {

        familyList.innerHTML = householdData.family.map(member => `
            <div class="task-card">

                <div class="task-avatar">
                    ${member.initials}
                </div>

                <div class="task-info">
                    <h4>${member.name}</h4>
                    <p>${member.role}</p>
                </div>

            </div>
        `).join("");

    }

});
