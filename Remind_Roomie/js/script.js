
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
        const homeTasks = document.getElementById("homeTasks");

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
            `conic-gradient(#357266 ${percentage}%, #ffffff ${percentage}%)`;


        const userName = householdData.user.name;
        const currentUser = householdData.family.find(member => member.name === userName);
        const memberForName = name => householdData.family.find(member => member.name === name);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const personalEvents = [
            ...householdData.calendar.personal.map(event => ({
                ...event,
                owner: userName
            }))
        ];

        try {
            const savedEvents = JSON.parse(localStorage.getItem("remindRoomieCalendarEvents") || "[]");
            if (!Array.isArray(savedEvents)) {
                throw new Error("Saved events have an invalid format.");
            }
            personalEvents.push(...savedEvents
                .filter(event => event.scope !== "shared")
                .map(event => ({ ...event, owner: userName })));
        } catch (error) {
            console.error("Could not load calendar events for the home page.", error);
        }

        let eventEdits = {};
        let deletedEventIds = [];
        try {
            const savedEdits = localStorage.getItem("remindRoomieCalendarEdits");
            eventEdits = savedEdits ? JSON.parse(savedEdits) : {};
            if (!eventEdits || Array.isArray(eventEdits) || typeof eventEdits !== "object") {
                throw new Error("Saved event changes have an invalid format.");
            }
        } catch (error) {
            console.error("Could not load event changes for the home page.", error);
        }
        try {
            const savedDeletedEvents = localStorage.getItem("remindRoomieDeletedEvents");
            deletedEventIds = savedDeletedEvents ? JSON.parse(savedDeletedEvents) : [];
            if (!Array.isArray(deletedEventIds)) {
                throw new Error("Deleted events have an invalid format.");
            }
        } catch (error) {
            console.error("Could not load deleted events for the home page.", error);
        }

        const eventsThisWeek = personalEvents
            .filter(event => !deletedEventIds.includes(event.id))
            .map(event => ({ ...event, ...(eventEdits[event.id] || {}) }))
            .filter(event => {
                const eventDate = new Date(`${event.date}T00:00:00`);
                return event.owner === userName && event.date &&
                    !Number.isNaN(eventDate.getTime()) &&
                    eventDate >= today && eventDate < weekEnd;
            })
            .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));

        if (eventsThisWeek.length) {
            eventsThisWeek.forEach(event => {
                const card = document.createElement("article");
                card.className = "event-card";
                const owner = memberForName(event.owner);
                card.style.backgroundColor = owner?.secondary || "#fbe0fb";
                const avatar = document.createElement("div");
                avatar.className = "event-avatar";
                avatar.style.backgroundColor = owner?.color || "#f7dafa";
                avatar.textContent = owner?.initials || userName.charAt(0).toUpperCase();
                const details = document.createElement("div");
                details.className = "event-details";
                const title = document.createElement("h4");
                title.textContent = event.title;
                const date = document.createElement("p");
                const eventDate = new Date(`${event.date}T00:00:00`);
                const dateText = eventDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric"
                });
                const timeText = event.time
                    ? new Date(`2000-01-01T${event.time}`).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit"
                    })
                    : "All day";
                date.textContent = `${dateText} · ${timeText}`;
                details.append(title, date);
                card.append(avatar, details);
                homeEvents.append(card);
            });
        } else {
            const empty = document.createElement("p");
            empty.className = "home-list-empty";
            empty.textContent = "No personal events this week.";
            homeEvents.append(empty);
        }

        const assignedToCurrentUser = task => {
            const assignedNames = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : String(task.assignedTo || "").split(",").map(name => name.trim());
            return assignedNames.includes(userName) || assignedNames.includes("Household");
        };
        let homeTaskList = [...householdData.tasks];
        let taskDecisions = {};

        try {
            const savedTasks = localStorage.getItem("remindRoomieTasks") ||
                localStorage.getItem("remindRoomieChores");
            if (savedTasks) {
                const parsedTasks = JSON.parse(savedTasks);
                if (!Array.isArray(parsedTasks) || parsedTasks.some(task => !task || typeof task.title !== "string")) {
                    throw new Error("Saved tasks have an invalid format.");
                }
                homeTaskList.push(...parsedTasks.map(task => ({
                    ...task,
                    assignedTo: task.assignedTo || householdData.family
                        .filter((member, index) => task.memberIds?.includes(member.id || `member-${index}`))
                        .map(member => member.name)
                        .join(", ") || "Household"
                })));
            }
        } catch (error) {
            console.error("Could not load tasks for the home page.", error);
        }
        try {
            const savedDecisions = localStorage.getItem("remindRoomieTaskDecisions");
            taskDecisions = savedDecisions ? JSON.parse(savedDecisions) : {};
            if (!taskDecisions || Array.isArray(taskDecisions) || typeof taskDecisions !== "object") {
                throw new Error("Saved task updates have an invalid format.");
            }
        } catch (error) {
            console.error("Could not load task updates for the home page.", error);
        }

        const myTasks = homeTaskList
            .map((task, index) => {
                const id = task.id || `sample-task-${index}`;
                return { ...task, ...taskDecisions[id], id };
            })
            .filter(task => assignedToCurrentUser(task) &&
                String(task.status || "requested").toLowerCase() !== "completed");

        const formatTaskDue = task => {
            if (task.date) {
                const dueDate = new Date(`${task.date}T00:00:00`);
                const dateText = dueDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric"
                });
                const timeText = task.time
                    ? ` · ${new Date(`2000-01-01T${task.time}`).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit"
                    })}`
                    : "";
                return `Due ${dateText}${timeText}`;
            }
            return task.dueDate
                ? `Due ${task.dueDate}${task.dueTime ? ` · ${task.dueTime}` : ""}`
                : "No due date";
        };

        if (myTasks.length) {
            myTasks.forEach(task => {
                const card = document.createElement("article");
                card.className = "event-card";
                const assignedNames = Array.isArray(task.assignedTo)
                    ? task.assignedTo
                    : String(task.assignedTo || "").split(",").map(name => name.trim());
                const assignee = assignedNames.map(memberForName).find(Boolean) || currentUser;
                card.style.backgroundColor = assignee?.secondary || "#fbe0fb";
                const avatar = document.createElement("div");
                avatar.className = "event-avatar task-home-avatar";
                avatar.style.backgroundColor = assignee?.color || "#f7dafa";
                const icon = document.createElement("i");
                icon.className = "fa-solid fa-list-check";
                icon.setAttribute("aria-hidden", "true");
                avatar.append(icon);
                const details = document.createElement("div");
                details.className = "event-details";
                const title = document.createElement("h4");
                title.textContent = task.title;
                const due = document.createElement("p");
                const status = String(task.status || "requested").toLowerCase();
                due.textContent = `${formatTaskDue(task)} · ${status.charAt(0).toUpperCase()}${status.slice(1)}`;
                details.append(title, due);
                card.append(avatar, details);
                homeTasks.append(card);
            });
        } else {
            const empty = document.createElement("p");
            empty.className = "home-list-empty";
            empty.textContent = "No tasks assigned to you.";
            homeTasks.append(empty);
        }

    }


    // --------------------------------
    // CALENDAR PAGE
    // --------------------------------

    const calendarGrid = document.getElementById("calendarGrid");

    if (calendarGrid) {

        const calendarStorageKey = "remindRoomieCalendarEvents";
        const editsStorageKey = "remindRoomieCalendarEdits";
        const deletedStorageKey = "remindRoomieDeletedEvents";
        const deleteModal = document.getElementById("deleteModal");
        const deleteModalText = document.getElementById("deleteModalText");
        const calendarView = document.getElementById("calendarView");
        const eventDetailView = document.getElementById("eventDetailView");
        const eventHero = document.getElementById("eventHero");
        const eventDetailCard = document.getElementById("eventDetailCard");
        const editEventForm = document.getElementById("editEventForm");
        const editTitle = document.getElementById("editTitle");
        const editDate = document.getElementById("editDate");
        const editTime = document.getElementById("editTime");
        const editEndTime = document.getElementById("editEndTime");
        const editLocation = document.getElementById("editLocation");
        const editDescription = document.getElementById("editDescription");
        const editMessage = document.getElementById("editMessage");
        const monthTitle = document.getElementById("monthTitle");
        const selectedDayTitle = document.getElementById("selectedDayTitle");
        const weekEvents = document.getElementById("weekEvents");
        const dayEvents = document.getElementById("dayEvents");
        const addEventButton = document.getElementById("addEventButton");
        const addEventView = document.getElementById("addEventView");
        const addEventForm = document.getElementById("addEventForm");
        const eventTitle = document.getElementById("eventTitle");
        const eventDate = document.getElementById("eventDate");
        const eventTime = document.getElementById("eventTime");
        const eventEndTime = document.getElementById("eventEndTime");
        const eventLocation = document.getElementById("eventLocation");
        const eventDescription = document.getElementById("eventDescription");
        const eventAssignees = document.getElementById("eventAssignees");
        const eventMessage = document.getElementById("eventMessage");
        const scopeTabs = document.querySelectorAll(".cal-scope-tab");
        let savedEvents = [];
        let eventEdits = {};
        let deletedEventIds = [];
        let pendingDeleteId = null;
        let openEventId = null;
        let editingEvent = false;
        let scope = "personal";

        function toISODate(date) {
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${date.getFullYear()}-${month}-${day}`;
        }

        // Today is read every time the page loads, so the ring moves to the new day
        const today = new Date();
        const todayISO = toISODate(today);
        let viewYear = today.getFullYear();
        let viewMonth = today.getMonth();
        let selectedDate = todayISO;

        function formatDay(dateISO) {
            return new Date(`${dateISO}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric"
            });
        }

        function formatTime(time) {
            if (!time) {
                return "All day";
            }
            return new Date(`2000-01-01T${time}`).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit"
            });
        }

        function formatTimeRange(event, separator = " – ") {
            if (!event.time) {
                return "All day";
            }
            if (!event.endTime) {
                return formatTime(event.time);
            }
            return `${formatTime(event.time)}${separator}${formatTime(event.endTime)}`;
        }

        function loadSavedEvents() {
            try {
                const saved = localStorage.getItem(calendarStorageKey);
                savedEvents = saved ? JSON.parse(saved) : [];
                if (!Array.isArray(savedEvents)) {
                    throw new Error("Saved events have an invalid format.");
                }
            } catch (error) {
                console.error("Could not load calendar events.", error);
                savedEvents = [];
            }
        }

        // kind: "personal" for one person's event, "family" for an event shared with everyone
        // owner: the person whose event it is
        function loadEventEdits() {
            try {
                const saved = localStorage.getItem(editsStorageKey);
                eventEdits = saved ? JSON.parse(saved) : {};
            } catch (error) {
                console.error("Could not load event changes.", error);
                eventEdits = {};
            }
        }

        function loadDeletedEvents() {
            try {
                const saved = localStorage.getItem(deletedStorageKey);
                deletedEventIds = saved ? JSON.parse(saved) : [];
                if (!Array.isArray(deletedEventIds)) {
                    throw new Error("Deleted events have an invalid format.");
                }
            } catch (error) {
                console.error("Could not load deleted events.", error);
                deletedEventIds = [];
            }
        }

        // Saved changes are applied on top of the original event; deleted events are left out
        function allEvents() {
            return baseEvents()
                .filter(event => !deletedEventIds.includes(event.id))
                .map(event => ({ ...event, ...(eventEdits[event.id] || {}) }));
        }

        function baseEvents() {
            return [
                ...householdData.calendar.personal.map(event => ({
                    ...event,
                    kind: "personal",
                    owner: householdData.user.name
                })),
                ...householdData.calendar.housemates.map(event => ({ ...event, kind: "personal" })),
                ...householdData.calendar.shared.map(event => ({
                    ...event,
                    kind: "family",
                    owner: event.addedBy
                })),
                ...savedEvents.map(event => event.scope === "shared"
                    ? { ...event, kind: "family", owner: event.addedBy }
                    : { ...event, kind: "personal", owner: householdData.user.name })
            ];
        }

        // Personal tab: your own events, plus shared events you are part of
        // (events with no attendee list are shared with the whole family).
        // Shared tab: everyone's events.
        function visibleEvents() {
            const me = householdData.user.name;
            return allEvents().filter(event => {
                if (scope === "personal") {
                    const isMine = event.kind === "personal" && event.owner === me;
                    const isIncluded = event.kind === "family" &&
                        (!event.attendees?.length || event.attendees.includes(me));
                    return isMine || isIncluded;
                }
                return true;
            });
        }

        function ownerOf(event) {
            return householdData.family.find(member => member.name === event.owner);
        }

        function ownerColor(event) {
            return ownerOf(event)?.color || "#f7dafa";
        }

        function eventsOn(dateISO) {
            return visibleEvents()
                .filter(event => event.date === dateISO)
                .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        }

        function renderMonth() {
            monthTitle.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric"
            });
            calendarGrid.replaceChildren();

            const offset = new Date(viewYear, viewMonth, 1).getDay();
            const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

            for (let i = 0; i < offset; i++) {
                calendarGrid.append(document.createElement("span"));
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const dateISO = toISODate(new Date(viewYear, viewMonth, day));
                const button = document.createElement("button");
                button.type = "button";
                button.className = "cal-day";
                button.setAttribute("aria-label", formatDay(dateISO));

                if (dateISO === todayISO) {
                    button.classList.add("is-today");
                }
                if (dateISO === selectedDate) {
                    button.classList.add("is-selected");
                }

                const number = document.createElement("span");
                number.textContent = day;
                button.append(number);

                // One dot per owner on that day, in the owner's color
                const dayColors = [...new Set(eventsOn(dateISO).map(ownerColor))].slice(0, 3);
                if (dayColors.length) {
                    const dots = document.createElement("span");
                    dots.className = "cal-dots";
                    dayColors.forEach(color => {
                        const dot = document.createElement("span");
                        dot.className = "cal-dot";
                        dot.style.backgroundColor = color;
                        dots.append(dot);
                    });
                    button.append(dots);
                }

                button.addEventListener("click", () => {
                    selectedDate = dateISO;
                    render();
                });
                calendarGrid.append(button);
            }
        }

        function renderDay() {
            selectedDayTitle.textContent = selectedDate === todayISO
                ? "Today"
                : formatDay(selectedDate);

            dayEvents.replaceChildren();
            const events = eventsOn(selectedDate);

            if (!events.length) {
                const empty = document.createElement("p");
                empty.className = "empty-chores";
                empty.textContent = scope === "shared"
                    ? "No events on this day."
                    : "No personal events on this day.";
                dayEvents.append(empty);
                return;
            }

            events.forEach(event => dayEvents.append(createEventCard(event)));
        }

        function renderWeek() {
            weekEvents.replaceChildren();

            // This week is the next 7 days after today; today's events are shown in the day list
            const weekEnd = new Date(today);
            weekEnd.setDate(today.getDate() + 7);
            const weekEndISO = toISODate(weekEnd);

            const events = visibleEvents()
                .filter(event => event.date > todayISO && event.date <= weekEndISO)
                .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));

            if (!events.length) {
                const empty = document.createElement("p");
                empty.className = "empty-chores";
                empty.textContent = "No events this week.";
                weekEvents.append(empty);
                return;
            }

            events.forEach(event => weekEvents.append(createEventCard(event)));
        }

        function createEventCard(event) {
            const card = document.createElement("article");
            const owner = ownerOf(event);
            card.className = `cal-event ${event.kind}`;
            card.style.backgroundColor = owner?.secondary || "#fbe0fb";

            const avatar = document.createElement("span");
            avatar.className = "cal-event-avatar";
            avatar.style.backgroundColor = owner?.color || "#f7dafa";
            avatar.textContent = owner?.initials || "?";

            const time = document.createElement("span");
            time.className = "cal-event-time";
            time.textContent = formatTime(event.time);

            const details = document.createElement("div");
            details.className = "cal-event-details";

            const title = document.createElement("h4");
            title.textContent = event.title;

            const meta = document.createElement("p");
            const showOwner = event.kind === "personal" && event.owner !== householdData.user.name;
            meta.textContent = [
                showOwner ? event.owner : "",
                event.location,
                event.kind === "family" ? `Added by ${event.owner}` : ""
            ].filter(Boolean).join(" · ");

            details.append(title, meta);

            if (event.description) {
                const description = document.createElement("p");
                description.className = "cal-event-description";
                description.textContent = event.description;
                details.append(description);
            }

            card.append(avatar, details, time);

            // Family-wide events, and personal events marked as shared, get the family icon
            if (event.kind === "family" || event.sharedWithFamily) {
                const familyIcon = document.createElement("i");
                familyIcon.className = "fa-solid fa-users cal-family-icon";
                familyIcon.setAttribute("aria-label", "Shared with the family");
                card.append(familyIcon);
            }

            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.addEventListener("click", () => openEvent(event.id));
            card.addEventListener("keydown", keyEvent => {
                if (keyEvent.key === "Enter") {
                    openEvent(event.id);
                }
            });

            return card;
        }

        function render() {
            renderMonth();
            renderWeek();
            renderDay();
        }

        function changeMonth(step) {
            const next = new Date(viewYear, viewMonth + step, 1);
            viewYear = next.getFullYear();
            viewMonth = next.getMonth();
            const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
            selectedDate = isCurrentMonth ? todayISO : toISODate(new Date(viewYear, viewMonth, 1));
            render();
        }

        function setScope(nextScope) {
            scope = nextScope;
            scopeTabs.forEach(tab => {
                tab.setAttribute("aria-pressed", String(tab.dataset.scope === scope));
            });
            render();
        }

        function showEventMessage(message) {
            eventMessage.textContent = message;
            eventMessage.hidden = false;
        }

        // Lists every family member as a chip, with you selected by default
        function renderEventAssignees() {
            eventAssignees.replaceChildren();
            householdData.family.forEach(member => {
                const label = document.createElement("label");
                label.className = "task-assignee-option";
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.name = "eventAssignee";
                checkbox.value = member.name;
                checkbox.checked = member.name === householdData.user.name;

                const avatar = document.createElement("span");
                avatar.className = "cal-assignee-avatar";
                if (member.photo) {
                    const image = document.createElement("img");
                    image.src = member.photo;
                    image.alt = "";
                    avatar.append(image);
                } else {
                    avatar.textContent = member.initials;
                    avatar.style.backgroundColor = member.color || "#e7d9f5";
                }

                const name = document.createElement("span");
                name.className = "cal-assignee-name";
                name.textContent = member.name;
                label.append(avatar, name, checkbox);
                eventAssignees.append(label);
            });
        }

        function closeEventForm() {
            addEventForm.reset();
            renderEventAssignees();
            eventMessage.hidden = true;
            startTimeField.refresh();
            endTimeField.refresh();
            showCalendarView();
            addEventButton.focus();
        }

        // --------------------------------
        // EVENT DETAIL
        // --------------------------------

        function showCalendarView() {
            openEventId = null;
            editingEvent = false;
            calendarView.hidden = false;
            eventDetailView.hidden = true;
            addEventView.hidden = true;
            addEventButton.hidden = false;
            render();
        }

        function openEvent(id) {
            openEventId = id;
            editingEvent = false;
            calendarView.hidden = true;
            eventDetailView.hidden = false;
            addEventButton.hidden = true;
            renderDetail();
            window.scrollTo(0, 0);
        }

        function formatShortDay(dateISO) {
            if (dateISO === todayISO) {
                return "Today";
            }
            return new Date(`${dateISO}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric"
            });
        }

        function showEditMessage(message) {
            editMessage.textContent = message;
            editMessage.hidden = false;
        }

        function renderDetail() {
            const event = allEvents().find(item => item.id === openEventId);
            if (!event) {
                showCalendarView();
                return;
            }

            const isOwner = event.owner === householdData.user.name;
            const owner = ownerOf(event);

            // Hero card, tinted with the owner's secondary color
            eventHero.style.backgroundColor = owner?.secondary || "#fbe0fb";
            eventHero.replaceChildren();

            const top = document.createElement("div");
            top.className = "cal-hero-top";

            const label = document.createElement("p");
            label.className = "cal-form-label";
            label.textContent = "Event";
            top.append(label);

            if (isOwner && !editingEvent) {
                const actions = document.createElement("div");
                actions.className = "cal-hero-actions";

                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.className = "cal-edit-button";
                editButton.setAttribute("aria-label", "Edit event");
                editButton.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
                editButton.addEventListener("click", () => {
                    editingEvent = true;
                    renderDetail();
                });

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "cal-edit-button";
                deleteButton.setAttribute("aria-label", "Delete event");
                deleteButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
                deleteButton.addEventListener("click", () => openDeleteModal(event.id));

                actions.append(editButton, deleteButton);
                top.append(actions);
            }

            const body = document.createElement("div");
            body.className = "cal-hero-body";

            const heroTitle = document.createElement("h2");
            heroTitle.className = "cal-hero-title";
            heroTitle.textContent = event.title;

            const dayBox = document.createElement("div");
            dayBox.className = "cal-hero-day";
            const dayLabel = document.createElement("span");
            dayLabel.textContent = "Day";
            const dayValue = document.createElement("strong");
            dayValue.textContent = formatShortDay(event.date);
            dayBox.append(dayLabel, dayValue);

            body.append(heroTitle, dayBox);
            eventHero.append(top, body);

            // Edit form, or the read-only details
            eventDetailCard.hidden = editingEvent;
            editEventForm.hidden = !editingEvent;

            if (editingEvent) {
                editTitle.value = event.title;
                editDate.value = event.date;
                editTime.value = event.time || "";
                editEndTime.value = event.endTime || "";
                editLocation.value = event.location || "";
                editDescription.value = event.description || "";
                editMessage.hidden = true;
                return;
            }

            const sharedWith = event.attendees?.length
                ? `Shared with ${event.attendees.join(", ")}`
                : "Shared with the family";
            let who = event.kind === "family"
                ? `${sharedWith} · added by ${event.owner}`
                : `${event.owner}'s personal event`;
            if (event.kind === "personal" && event.sharedWithFamily) {
                who += " · shared with the family";
            }

            const rows = [
                ["fa-calendar-day", "Date", formatDay(event.date)],
                ["fa-clock", "Time", formatTimeRange(event)],
                ["fa-location-dot", "Location", event.location || "No location"],
                ["fa-align-left", "Description", event.description || "No description"],
                ["fa-user", "Who", who]
            ];

            eventDetailCard.replaceChildren();
            rows.forEach(([icon, labelText, value]) => {
                const row = document.createElement("div");
                row.className = "cal-detail-row";

                const iconBox = document.createElement("span");
                iconBox.className = "cal-detail-icon";
                const iconEl = document.createElement("i");
                iconEl.className = `fa-solid ${icon}`;
                iconEl.setAttribute("aria-hidden", "true");
                iconBox.append(iconEl);

                const text = document.createElement("div");
                const labelEl = document.createElement("p");
                labelEl.className = "cal-detail-label";
                labelEl.textContent = labelText;
                const valueEl = document.createElement("p");
                valueEl.className = "cal-detail-value";
                valueEl.textContent = value;
                text.append(labelEl, valueEl);

                row.append(iconBox, text);
                eventDetailCard.append(row);
            });
        }

        function openDeleteModal(id) {
            const event = allEvents().find(item => item.id === id);
            if (!event) {
                return;
            }
            pendingDeleteId = id;
            deleteModalText.textContent = `Are you sure you want to delete "${event.title}"? This can't be undone.`;
            deleteModal.hidden = false;
            document.getElementById("cancelDelete").focus();
        }

        function closeDeleteModal() {
            pendingDeleteId = null;
            deleteModal.hidden = true;
        }

        document.getElementById("cancelDelete").addEventListener("click", closeDeleteModal);

        document.getElementById("confirmDelete").addEventListener("click", () => {
            const nextDeleted = [...deletedEventIds, pendingDeleteId];
            try {
                localStorage.setItem(deletedStorageKey, JSON.stringify(nextDeleted));
            } catch (error) {
                console.error("Could not save the deleted event.", error);
                closeDeleteModal();
                return;
            }

            deletedEventIds = nextDeleted;
            closeDeleteModal();
            showCalendarView();
        });

        deleteModal.addEventListener("click", clickEvent => {
            if (clickEvent.target === deleteModal) {
                closeDeleteModal();
            }
        });

        document.addEventListener("keydown", keyEvent => {
            if (keyEvent.key === "Escape" && !deleteModal.hidden) {
                closeDeleteModal();
            }
        });

        document.getElementById("backToCalendar").addEventListener("click", showCalendarView);
        document.getElementById("backToCalendarLink").addEventListener("click", showCalendarView);

        document.getElementById("cancelEditEvent").addEventListener("click", () => {
            editingEvent = false;
            renderDetail();
        });

        editEventForm.addEventListener("submit", event => {
            event.preventDefault();
            editMessage.hidden = true;

            const title = editTitle.value.trim();
            if (!title) {
                editTitle.focus();
                showEditMessage("Enter a title for the event.");
                return;
            }
            if (!editDate.value) {
                editDate.focus();
                showEditMessage("Choose a date for the event.");
                return;
            }
            if (!editTime.value || !editEndTime.value) {
                showEditMessage("Choose a start and end time for the event.");
                return;
            }
            if (editEndTime.value <= editTime.value) {
                editEndTime.focus();
                showEditMessage("The end time must be after the start time.");
                return;
            }

            const nextEdits = {
                ...eventEdits,
                [openEventId]: {
                    title,
                    date: editDate.value,
                    time: editTime.value,
                    endTime: editEndTime.value,
                    location: editLocation.value.trim(),
                    description: editDescription.value.trim()
                }
            };

            try {
                localStorage.setItem(editsStorageKey, JSON.stringify(nextEdits));
            } catch (error) {
                console.error("Could not save the event change.", error);
                showEditMessage("Could not save this change in your browser storage.");
                return;
            }

            eventEdits = nextEdits;
            editingEvent = false;
            renderDetail();
        });

        document.getElementById("prevMonth").addEventListener("click", () => changeMonth(-1));
        document.getElementById("nextMonth").addEventListener("click", () => changeMonth(1));

        scopeTabs.forEach(tab => {
            tab.addEventListener("click", () => setScope(tab.dataset.scope));
        });

        function openAddEvent() {
            calendarView.hidden = true;
            eventDetailView.hidden = true;
            addEventView.hidden = false;
            addEventButton.hidden = true;
            eventDate.value = selectedDate;
            window.scrollTo(0, 0);
            eventTitle.focus();
        }

        addEventButton.addEventListener("click", openAddEvent);
        document.getElementById("backFromAddEvent").addEventListener("click", closeEventForm);
        document.getElementById("cancelAddEvent").addEventListener("click", closeEventForm);

        addEventForm.addEventListener("submit", event => {
            event.preventDefault();
            eventMessage.hidden = true;

            const title = eventTitle.value.trim();
            if (!title) {
                eventTitle.focus();
                showEventMessage("Enter a title for the event.");
                return;
            }
            if (!eventDate.value) {
                eventDate.focus();
                showEventMessage("Choose a date for the event.");
                return;
            }
            if (!eventTime.value || !eventEndTime.value) {
                showEventMessage("Choose a start and end time for the event.");
                return;
            }
            if (eventEndTime.value <= eventTime.value) {
                eventEndTime.focus();
                showEventMessage("The end time must be after the start time.");
                return;
            }

            const attendees = [...eventAssignees.querySelectorAll('input[name="eventAssignee"]:checked')]
                .map(input => input.value);
            if (!attendees.length) {
                showEventMessage("Choose who this event is for.");
                return;
            }

            const newEvent = {
                id: `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                title,
                date: eventDate.value,
                time: eventTime.value,
                endTime: eventEndTime.value,
                location: eventLocation.value.trim(),
                description: eventDescription.value.trim(),
                addedBy: householdData.user.name,
                attendees,
                scope: attendees.length === 1 && attendees[0] === householdData.user.name
                    ? "personal"
                    : "shared"
            };
            const nextEvents = [...savedEvents, newEvent];

            try {
                localStorage.setItem(calendarStorageKey, JSON.stringify(nextEvents));
            } catch (error) {
                console.error("Could not save the new event.", error);
                showEventMessage("Could not save this event in your browser storage.");
                return;
            }

            // Jump to the new event so it is visible straight away
            const eventDay = new Date(`${newEvent.date}T00:00:00`);
            savedEvents = nextEvents;
            viewYear = eventDay.getFullYear();
            viewMonth = eventDay.getMonth();
            selectedDate = newEvent.date;
            closeEventForm();
            setScope(newEvent.scope);
        });

        // --------------------------------
        // TIME FIELDS (type a time, or pick one from the suggestions)
        // --------------------------------

        const timeOptionsList = document.createElement("datalist");
        timeOptionsList.id = "timeOptions";
        for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
            const option = document.createElement("option");
            const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
            const mm = String(minutes % 60).padStart(2, "0");
            option.value = formatTime(`${hh}:${mm}`);
            timeOptionsList.append(option);
        }
        document.body.append(timeOptionsList);

        // Accepts "18:30", "6:30 pm", "6pm", "6:30p"; returns "HH:MM" or "" if invalid
        function parseTimeText(text) {
            const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m?\.?)?$/i);
            if (!match) {
                return "";
            }

            let hours = Number(match[1]);
            const minutes = Number(match[2] || 0);
            const period = match[3]?.toLowerCase();

            if (minutes > 59) {
                return "";
            }
            if (period) {
                if (hours < 1 || hours > 12) {
                    return "";
                }
                hours = (hours % 12) + (period === "p" ? 12 : 0);
            } else if (hours > 23) {
                return "";
            }

            return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }

        function addOneHour(value) {
            const [hh, mm] = value.split(":").map(Number);
            return `${String((hh + 1) % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        }

        function createTimeField(input, mount, label, onChange) {
            const state = { hour: "", minute: "", period: "AM" };

            const text = document.createElement("input");
            text.type = "text";
            text.className = "cal-time-input";
            text.placeholder = "e.g. 6:30 PM";
            text.setAttribute("list", "timeOptions");
            text.setAttribute("aria-label", `${label}, type a time`);

            const controls = document.createElement("div");
            controls.className = "cal-time-controls";

            const hourSelect = document.createElement("select");
            hourSelect.className = "cal-time-select";
            hourSelect.setAttribute("aria-label", `${label} hour`);
            hourSelect.append(new Option("Hour", ""));
            for (let hour = 1; hour <= 12; hour++) {
                hourSelect.append(new Option(String(hour), String(hour)));
            }

            const minuteSelect = document.createElement("select");
            minuteSelect.className = "cal-time-select";
            minuteSelect.setAttribute("aria-label", `${label} minute`);
            minuteSelect.append(new Option("Min", ""));
            for (let minute = 0; minute < 60; minute++) {
                const mm = String(minute).padStart(2, "0");
                minuteSelect.append(new Option(mm, mm));
            }

            const periodGroup = document.createElement("div");
            periodGroup.className = "cal-period";
            periodGroup.setAttribute("role", "group");
            periodGroup.setAttribute("aria-label", `${label}, AM or PM`);
            const periodButtons = ["AM", "PM"].map(period => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "cal-period-button";
                button.textContent = period;
                button.dataset.period = period;
                button.addEventListener("click", () => {
                    state.period = period;
                    commit();
                });
                return button;
            });
            periodGroup.append(...periodButtons);

            controls.append(hourSelect, minuteSelect, periodGroup);
            mount.replaceChildren(text, controls);

            // The "HH:MM" value from the picker, or "" until an hour and minute are chosen
            function currentValue() {
                if (!state.hour || state.minute === "") {
                    return "";
                }
                const hour24 = (Number(state.hour) % 12) + (state.period === "PM" ? 12 : 0);
                return `${String(hour24).padStart(2, "0")}:${state.minute}`;
            }

            function render() {
                const value = currentValue();
                text.value = value ? formatTime(value) : "";
                text.classList.remove("is-invalid");
                hourSelect.value = state.hour;
                minuteSelect.value = state.minute;
                periodButtons.forEach(button => {
                    button.setAttribute("aria-pressed", String(button.dataset.period === state.period));
                });
            }

            function stateFrom(value) {
                if (!value) {
                    state.hour = "";
                    state.minute = "";
                    state.period = "AM";
                    return;
                }
                const [hh, mm] = value.split(":").map(Number);
                state.hour = String(hh % 12 || 12);
                state.minute = String(mm).padStart(2, "0");
                state.period = hh >= 12 ? "PM" : "AM";
            }

            // Called after the user changes something, so the value is saved and passed on
            function commit() {
                const value = currentValue();
                input.value = value;
                render();
                if (value && onChange) {
                    onChange(value);
                }
            }

            function setValue(value) {
                input.value = value;
                stateFrom(value);
                render();
            }

            hourSelect.addEventListener("change", () => {
                state.hour = hourSelect.value;
                commit();
            });

            minuteSelect.addEventListener("change", () => {
                state.minute = minuteSelect.value;
                commit();
            });

            text.addEventListener("change", () => {
                if (!text.value.trim()) {
                    setValue("");
                    return;
                }

                const parsed = parseTimeText(text.value);
                if (!parsed) {
                    input.value = "";
                    text.classList.add("is-invalid");
                    return;
                }

                stateFrom(parsed);
                commit();
            });

            setValue(input.value);

            return {
                setValue,
                refresh: () => setValue(input.value)
            };
        }

        const startTimeField = createTimeField(eventTime, document.getElementById("eventStartTimePicker"), "Start time", value => {
            // Default the end to one hour after the start if no end time is set yet
            if (!eventEndTime.value) {
                endTimeField.setValue(addOneHour(value));
            }
        });
        const endTimeField = createTimeField(eventEndTime, document.getElementById("eventEndTimePicker"), "End time");

        loadSavedEvents();
        loadEventEdits();
        loadDeletedEvents();
        renderEventAssignees();
        render();

    }


    // --------------------------------
    // TASKS PAGE
    // --------------------------------

    const taskRequests = document.getElementById("taskRequests");

    if (taskRequests) {
        const tasksStorageKey = "remindRoomieTasks";
        const decisionsStorageKey = "remindRoomieTaskDecisions";
        const familyStorageKey = "remindRoomieFamily";
        const taskListView = document.getElementById("taskListView");
        const yourTasksList = document.getElementById("yourTasks");
        const allTasksList = document.getElementById("allTasks");
        const yourTasksSection = document.getElementById("yourTasksSection");
        const feedbackView = document.getElementById("taskFeedback");
        const feedbackIcon = document.getElementById("taskFeedbackIcon");
        const feedbackTitle = document.getElementById("taskFeedbackTitle");
        const feedbackMessage = document.getElementById("taskFeedbackMessage");
        const feedbackTaskCard = document.getElementById("feedbackTaskCard");
        const addTaskButton = document.getElementById("openAddTask");
        const addTaskForm = document.getElementById("addTaskForm");
        const taskAssigneeOptions = document.getElementById("taskAssigneeOptions");
        const newTaskTitle = document.getElementById("newTaskTitle");
        const newTaskDate = document.getElementById("newTaskDate");
        const newTaskTime = document.getElementById("newTaskTime");
        const newTaskMessage = document.getElementById("newTaskMessage");
        let familyMembers = [...householdData.family];
        let assignedTasks = [];
        let decisions = {};
        let feedback = null;
        let loadError = "";

        function memberId(member, index) {
            return member.id || `member-${index}`;
        }

        function getTaskStatus(task) {
            const legacyStatus = String(task.status || "requested").toLowerCase();
            if (decisions[task.id]?.status) {
                return decisions[task.id].status;
            }
            if (legacyStatus === "completed") {
                return "completed";
            }
            return legacyStatus === "accepted" || legacyStatus === "rejected"
                ? legacyStatus
                : "requested";
        }

        function allTasks() {
            return [...householdData.tasks, ...assignedTasks].map((task, index) => {
                const id = task.id || `sample-task-${index}`;
                const normalizedTask = { ...task, id };
                const decision = decisions[id] || {};
                return {
                    ...normalizedTask,
                    ...decision,
                    id,
                    status: getTaskStatus(normalizedTask)
                };
            });
        }

        function displayDueDate(task) {
            if (task.date) {
                const date = new Date(`${task.date}T00:00:00`);
                const dateText = date.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric"
                });
                const timeText = task.time
                    ? ` at ${new Date(`2000-01-01T${task.time}`).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit"
                    })}`
                    : "";
                return `Due ${dateText}${timeText}`;
            }
            return task.dueDate
                ? `Due ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ""}`
                : "No due date";
        }

        function isAssignedToCurrentUser(task) {
            const assignedNames = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : String(task.assignedTo || "").split(",").map(name => name.trim());
            return assignedNames.includes(householdData.user.name) || assignedNames.includes("Household");
        }

        function saveDecisions(nextDecisions) {
            try {
                localStorage.setItem(decisionsStorageKey, JSON.stringify(nextDecisions));
                decisions = nextDecisions;
                return true;
            } catch (error) {
                console.error("Could not save task updates.", error);
                return false;
            }
        }

        function updateTask(task, update, showFeedback = false) {
            const nextDecisions = {
                ...decisions,
                [task.id]: {
                    ...decisions[task.id],
                    ...update
                }
            };

            if (!saveDecisions(nextDecisions)) {
                return;
            }

            if (showFeedback) {
                feedback = { task: { ...task, ...update }, status: update.status };
            }
            renderTasks();
        }

        function createTaskSummary(task, options = {}) {
            const card = document.createElement("article");
            card.className = "task-list-card";
            if (task.status === "completed") {
                card.classList.add("completed");
            }

            const avatar = document.createElement("span");
            avatar.className = "task-list-avatar";
            const assignedNames = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : String(task.assignedTo || "Household").split(",").map(name => name.trim());
            const member = familyMembers.find(person => assignedNames.includes(person.name));
            avatar.textContent = member?.initials || assignedNames[0]?.charAt(0).toUpperCase() || "?";

            const details = document.createElement("span");
            details.className = "task-list-details";
            const title = document.createElement("strong");
            title.textContent = task.title;
            const meta = document.createElement("span");
            const due = displayDueDate(task).replace(/^Due /, "");
            meta.textContent = `${task.assignedBy || "Household"} · ${due}`;
            details.append(title, meta);

            if (options.allowCompletion && ["accepted", "completed"].includes(task.status)) {
                const checkbox = document.createElement("input");
                checkbox.className = "task-completion-toggle";
                checkbox.type = "checkbox";
                checkbox.checked = task.status === "completed";
                checkbox.setAttribute("aria-label", `Mark ${task.title} as ${task.status === "completed" ? "not complete" : "complete"}`);
                checkbox.addEventListener("change", () => {
                    updateTask(task, { status: checkbox.checked ? "completed" : "accepted" });
                });
                card.append(checkbox);
            } else if (task.status === "completed") {
                const checkIcon = document.createElement("i");
                checkIcon.className = "fa-solid fa-check task-list-check";
                checkIcon.setAttribute("aria-label", "Completed");
                card.append(checkIcon);
            } else if (options.showStatus && task.status !== "completed") {
                const status = document.createElement("span");
                status.className = `status ${task.status}`;
                status.textContent = task.status.charAt(0).toUpperCase() + task.status.slice(1);
                card.append(status);
            }

            card.prepend(avatar, details);
            return card;
        }

        function renderRequest(task) {
            const card = document.createElement("article");
            card.className = "task-request-card";

            const title = document.createElement("h3");
            title.className = "task-request-title";
            title.textContent = task.title;
            const assignedBy = document.createElement("p");
            assignedBy.className = "task-assigned-by";
            assignedBy.textContent = `Assigned by ${task.assignedBy || "Household"}`;
            const due = document.createElement("p");
            due.className = "task-due";
            due.textContent = displayDueDate(task);

            const actions = document.createElement("div");
            actions.className = "task-request-actions";
            [["Accept", "accept-task", "accepted"], ["Reject", "reject-task", "rejected"]]
                .forEach(([label, className, status]) => {
                    const button = document.createElement("button");
                    button.className = `task-action-button ${className}`;
                    button.type = "button";
                    button.textContent = label;
                    button.addEventListener("click", () => updateTask(task, { status }, true));
                    actions.append(button);
                });

            const rescheduleButton = document.createElement("button");
            rescheduleButton.className = "task-action-button reschedule-task";
            rescheduleButton.type = "button";
            rescheduleButton.textContent = "Reschedule";
            rescheduleButton.addEventListener("click", () => {
                if (card.querySelector(".reschedule-form")) {
                    return;
                }

                const form = document.createElement("form");
                form.className = "reschedule-form";
                const dateInput = document.createElement("input");
                dateInput.type = "date";
                dateInput.setAttribute("aria-label", "New due date");
                dateInput.required = true;
                dateInput.value = task.date || "";
                const timeInput = document.createElement("input");
                timeInput.type = "time";
                timeInput.setAttribute("aria-label", "New due time");
                timeInput.value = task.time || "";
                const saveButton = document.createElement("button");
                saveButton.className = "task-action-button accept-task";
                saveButton.type = "submit";
                saveButton.textContent = "Save new time";
                const cancelButton = document.createElement("button");
                cancelButton.className = "task-action-button reject-task";
                cancelButton.type = "button";
                cancelButton.textContent = "Cancel";
                cancelButton.addEventListener("click", () => form.remove());
                form.append(dateInput, timeInput, saveButton, cancelButton);
                form.addEventListener("submit", event => {
                    event.preventDefault();
                    updateTask(task, { date: dateInput.value, time: timeInput.value });
                });
                card.append(form);
                dateInput.focus();
            });

            card.append(title, assignedBy, due, actions, rescheduleButton);
            return card;
        }

        function renderFeedback() {
            const accepted = feedback.status === "accepted";
            feedbackView.hidden = false;
            taskListView.hidden = true;
            document.body.classList.add("show-task-feedback");
            feedbackIcon.innerHTML = accepted
                ? '<i class="fa-solid fa-check" aria-hidden="true"></i>'
                : '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
            feedbackTitle.textContent = accepted ? "Task accepted!" : "Task declined";
            feedbackMessage.textContent = accepted
                ? `${feedback.task.title} is now in Your Tasks.`
                : `${feedback.task.title} was declined.`;
            feedbackTaskCard.replaceChildren(createTaskSummary({
                ...feedback.task,
                status: accepted ? "accepted" : "rejected"
            }, { showStatus: true }));
        }

        function renderTasks() {
            taskRequests.replaceChildren();
            yourTasksList.replaceChildren();
            allTasksList.replaceChildren();
            const tasks = allTasks();
            const requests = tasks.filter(task =>
                task.status === "requested" && isAssignedToCurrentUser(task)
            );
            const mine = tasks.filter(task =>
                isAssignedToCurrentUser(task) && ["accepted", "completed"].includes(task.status)
            );

            if (requests.length) {
                requests.forEach(task => taskRequests.append(renderRequest(task)));
            } else {
                const empty = document.createElement("p");
                empty.className = "empty-chores";
                empty.textContent = "You're all caught up. No new task requests.";
                taskRequests.append(empty);
            }

            mine.forEach(task => yourTasksList.append(createTaskSummary(task, { allowCompletion: true })));
            yourTasksSection.hidden = mine.length === 0;
            tasks.forEach(task => allTasksList.append(createTaskSummary(task, {
                allowCompletion: true,
                showStatus: true
            })));

            if (loadError) {
                const errorNotice = document.createElement("p");
                errorNotice.className = "family-message";
                errorNotice.textContent = loadError;
                taskRequests.append(errorNotice);
            }

            if (feedback) {
                renderFeedback();
            } else {
                feedbackView.hidden = true;
                taskListView.hidden = false;
            }
        }

        function renderAssigneeOptions(selectedIds = []) {
            taskAssigneeOptions.replaceChildren();
            familyMembers.forEach((member, index) => {
                const label = document.createElement("label");
                label.className = "task-assignee-option";
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.name = "assignees";
                checkbox.value = memberId(member, index);
                checkbox.checked = selectedIds.includes(checkbox.value);
                const name = document.createElement("span");
                name.textContent = member.name;
                label.append(checkbox, name);
                taskAssigneeOptions.append(label);
            });
        }

        function loadTasks() {
            loadError = "";
            try {
                const savedFamily = localStorage.getItem(familyStorageKey);
                familyMembers = [...householdData.family];
                if (savedFamily) {
                    const parsedFamily = JSON.parse(savedFamily);
                    if (!Array.isArray(parsedFamily) || parsedFamily.some(member =>
                        !member || typeof member.name !== "string"
                    )) {
                        throw new Error("Saved family members have an invalid format.");
                    }
                    familyMembers.push(...parsedFamily);
                }
            } catch (error) {
                console.error("Could not load family members for tasks.", error);
                loadError = "Family members could not be loaded.";
            }

            try {
                const savedTasks = localStorage.getItem(tasksStorageKey) ||
                    localStorage.getItem("remindRoomieChores");
                if (savedTasks) {
                    const parsedTasks = JSON.parse(savedTasks);
                    if (!Array.isArray(parsedTasks) || parsedTasks.some(task =>
                        !task || typeof task.id !== "string" ||
                        typeof task.title !== "string" ||
                        typeof task.date !== "string" ||
                        typeof task.time !== "string"
                    )) {
                        throw new Error("Saved tasks have an invalid format.");
                    }
                    assignedTasks = parsedTasks.map(task => ({
                        ...task,
                        assignedBy: task.assignedBy || householdData.user.name,
                        assignedTo: task.assignedTo || familyMembers
                            .filter((member, index) => task.memberIds?.includes(member.id || `member-${index}`))
                            .map(member => member.name)
                            .join(", ") || "Household"
                    }));
                }
            } catch (error) {
                console.error("Could not load assigned tasks.", error);
                loadError = "Assigned tasks could not be loaded.";
            }

            try {
                const savedDecisions = localStorage.getItem(decisionsStorageKey);
                decisions = savedDecisions ? JSON.parse(savedDecisions) : {};
                if (!decisions || Array.isArray(decisions) || typeof decisions !== "object") {
                    throw new Error("Saved task updates have an invalid format.");
                }
            } catch (error) {
                console.error("Could not load task updates.", error);
                decisions = {};
                loadError = "Task responses could not be loaded.";
            }

            renderAssigneeOptions([memberId(familyMembers[0], 0)]);
            renderTasks();
        }

        document.getElementById("backToTasks").addEventListener("click", () => {
            feedback = null;
            document.body.classList.remove("show-task-feedback");
            renderTasks();
        });

        addTaskButton.addEventListener("click", () => {
            addTaskForm.hidden = false;
            addTaskButton.setAttribute("aria-expanded", "true");
            newTaskTitle.focus();
        });

        document.getElementById("cancelAddTask").addEventListener("click", () => {
            addTaskForm.reset();
            renderAssigneeOptions([memberId(familyMembers[0], 0)]);
            newTaskMessage.hidden = true;
            addTaskForm.hidden = true;
            addTaskButton.setAttribute("aria-expanded", "false");
            addTaskButton.focus();
        });

        addTaskForm.addEventListener("submit", event => {
            event.preventDefault();
            newTaskMessage.hidden = true;
            const title = newTaskTitle.value.trim();
            const memberIds = [...taskAssigneeOptions.querySelectorAll('input[name="assignees"]:checked')]
                .map(input => input.value);
            if (!title) {
                newTaskMessage.textContent = "Enter a task name.";
                newTaskMessage.hidden = false;
                newTaskTitle.focus();
                return;
            }
            if (!memberIds.length) {
                newTaskMessage.textContent = "Select at least one family member.";
                newTaskMessage.hidden = false;
                return;
            }

            const newTask = {
                id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                title,
                memberIds,
                assignedTo: familyMembers
                    .filter((member, index) => memberIds.includes(memberId(member, index)))
                    .map(member => member.name)
                    .join(", "),
                assignedBy: householdData.user.name,
                date: newTaskDate.value,
                time: newTaskTime.value,
                status: "requested",
                completed: false
            };
            const nextTasks = [...assignedTasks, newTask];
            try {
                localStorage.setItem(tasksStorageKey, JSON.stringify(nextTasks));
                assignedTasks = nextTasks;
                addTaskForm.reset();
                renderAssigneeOptions([memberId(familyMembers[0], 0)]);
                addTaskForm.hidden = true;
                addTaskButton.setAttribute("aria-expanded", "false");
                renderTasks();
            } catch (error) {
                console.error("Could not save the new task.", error);
                newTaskMessage.textContent = "Could not save this task in your browser storage.";
                newTaskMessage.hidden = false;
            }
        });

        window.addEventListener("storage", event => {
            if ([tasksStorageKey, decisionsStorageKey, familyStorageKey, "remindRoomieChores"].includes(event.key)) {
                loadTasks();
            }
        });

        loadTasks();
    }


    // --------------------------------
    // FAMILY PAGE
    // --------------------------------

    const familyList = document.getElementById("familyList");

    if (familyList) {

        const memberForm = document.getElementById("memberForm");
        const addMemberButton = document.getElementById("addMemberButton");
        const cancelAddMember = document.getElementById("cancelAddMember");
        const memberName = document.getElementById("memberName");
        const memberRole = document.getElementById("memberRole");
        const memberPhoto = document.getElementById("memberPhoto");
        const familyMessage = document.getElementById("familyMessage");
        const storageKey = "remindRoomieFamily";
        let familyMembers = [...householdData.family];

        function showFamilyMessage(message) {
            familyMessage.textContent = message;
            familyMessage.hidden = false;
        }

        function renderFamilyMembers() {
            familyList.replaceChildren();

            familyMembers.forEach(member => {
                const card = document.createElement("div");
                card.className = "task-card";

                const avatar = document.createElement("div");
                avatar.className = "task-avatar";
                if (member.color) {
                    avatar.style.backgroundColor = member.color;
                }

                if (member.photo) {
                    const image = document.createElement("img");
                    image.src = member.photo;
                    image.alt = "";
                    avatar.append(image);
                } else {
                    avatar.textContent = member.initials || member.name.charAt(0).toUpperCase();
                }

                const info = document.createElement("div");
                info.className = "task-info";

                const name = document.createElement("h4");
                name.textContent = member.name;
                info.append(name);

                if (member.role) {
                    const role = document.createElement("p");
                    role.textContent = member.role;
                    info.append(role);
                }

                card.append(avatar, info);
                familyList.append(card);
            });
        }

        try {
            const savedMembers = localStorage.getItem(storageKey);

            if (savedMembers) {
                const parsedMembers = JSON.parse(savedMembers);

                if (!Array.isArray(parsedMembers) || parsedMembers.some(member =>
                    !member || typeof member.name !== "string" ||
                    typeof member.role !== "string" ||
                    typeof member.initials !== "string" ||
                    (member.photo !== undefined && typeof member.photo !== "string")
                )) {
                    throw new Error("Saved family members have an invalid format.");
                }

                familyMembers = [...familyMembers, ...parsedMembers];
            }
        } catch (error) {
            console.error("Could not load saved family members.", error);
            showFamilyMessage("Saved members could not be loaded. You can still add a new member.");
        }

        renderFamilyMembers();

        addMemberButton.addEventListener("click", () => {
            memberForm.hidden = false;
            addMemberButton.setAttribute("aria-expanded", "true");
            memberName.focus();
        });

        cancelAddMember.addEventListener("click", () => {
            memberForm.reset();
            familyMessage.hidden = true;
            memberForm.hidden = true;
            addMemberButton.setAttribute("aria-expanded", "false");
            addMemberButton.focus();
        });

        memberForm.addEventListener("submit", event => {
            event.preventDefault();
            familyMessage.hidden = true;

            const name = memberName.value.trim();
            const role = memberRole.value.trim();
            const photoFile = memberPhoto.files[0];

            if (!name) {
                memberName.focus();
                showFamilyMessage("Enter a name for the new member.");
                return;
            }

            if (photoFile && !photoFile.type.startsWith("image/")) {
                showFamilyMessage("Choose an image file for the profile picture.");
                return;
            }

            if (photoFile && photoFile.size > 2 * 1024 * 1024) {
                showFamilyMessage("The profile picture must be 2 MB or smaller.");
                return;
            }

            function saveMember(photo = "") {
                const newMember = {
                    id: `member-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    name,
                    role,
                    initials: name.charAt(0).toUpperCase(),
                    ...(photo ? { photo } : {})
                };
                const updatedMembers = [...familyMembers, newMember];

                try {
                    localStorage.setItem(
                        storageKey,
                        JSON.stringify(updatedMembers.slice(householdData.family.length))
                    );
                } catch (error) {
                    console.error("Could not save the new family member.", error);
                    showFamilyMessage("Could not save this member in your browser. Try a smaller picture or another browser.");
                    return;
                }

                familyMembers = updatedMembers;
                renderFamilyMembers();
                memberForm.reset();
                familyFormClose();
            }

            function familyFormClose() {
                memberForm.hidden = true;
                addMemberButton.setAttribute("aria-expanded", "false");
                addMemberButton.focus();
            }

            if (!photoFile) {
                saveMember();
                return;
            }

            const reader = new FileReader();
            reader.addEventListener("load", () => {
                if (typeof reader.result !== "string") {
                    showFamilyMessage("Could not read the selected picture. Please try another image.");
                    return;
                }

                saveMember(reader.result);
            });
            reader.addEventListener("error", () => {
                showFamilyMessage("Could not read the selected picture. Please try another image.");
            });
            reader.readAsDataURL(photoFile);
        });

    }


});
