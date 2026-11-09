
document.addEventListener("DOMContentLoaded", async function () {
    window.roomieAppState = "loading";

    // Start cloud loading after the local controls are ready. Dynamic import also
    // lets us report SDK-loading failures instead of leaving the page inactive.
    try {
        if (window.roomieHouseholdReady) {
            await window.roomieHouseholdReady;
        } else {
            await import("./firebase-app.js");
            await window.roomieHouseholdReady;
        }
    } catch (error) {
        console.error("Could not initialize Firebase.", error);
        let status = document.getElementById("appStatus");
        if (!status) {
            status = document.createElement("p");
            status.id = "appStatus";
            status.className = "app-status";
            status.setAttribute("role", "alert");
            document.body.prepend(status);
        }
        status.textContent = "Could not load Firebase. Serve this app over HTTP, check your connection, and reload to retry.";
    }
    // Wait for the member list so colors are drawn once, with the right values
    if (window.roomieCloud) {
        await window.roomieCloud.membersReady;
    }
    window.roomieAppState = window.roomieCloud ? "ready" : "unavailable";
    if (!window.roomieCloud) return;

    const storageKey = key => `${key}:${window.roomieCloud.user.uid}`;

    // Identify people by account ID, so a rename doesn't detach their events or color.
    // Older events were saved with names, so names still count as a match.
    const meId = window.roomieCloud.user.uid;
    const isMe = value => value === meId || value === householdData.user.name;
    const memberFor = value => householdData.family.find(member => member.id === value || member.name === value);
    const nameOf = value => memberFor(value)?.name || value;
    const myColor = () => memberFor(meId)?.color || "";
    const eventAddedBy = event => nameOf(event.createdBy || event.addedBy || event.owner || meId) || "Household";
    const setMemberCardColor = (element, member, fallback = "#fbe0fb") => {
        element.style.setProperty("--member-card-color", member?.secondary || fallback);
    };
    const setMemberAvatarColor = (element, member, fallback = "#f7dafa") => {
        element.style.setProperty("--member-profile-color", member?.color || fallback);
    };

    function createMemberAvatar(member, className, fallback = "?", tagName = "span", colorFallback = "#f7dafa") {
        const avatar = document.createElement(tagName);
        avatar.className = `${className} roomie-person-avatar`;
        setMemberAvatarColor(avatar, member, colorFallback);
        avatar.textContent = member?.initials || fallback;
        return avatar;
    }

    function createAttribution(name, tagName = "p") {
        const attribution = document.createElement(tagName);
        attribution.className = "item-attribution";
        attribution.textContent = `Added by ${name}`;
        return attribution;
    }

    function renderDetailRows(container, rows) {
        container.replaceChildren();
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
            container.append(row);
        });
    }

    function createDetailHeroDate(labelText, valueText) {
        const dateBox = document.createElement("div");
        dateBox.className = "cal-hero-day";

        const label = document.createElement("span");
        label.textContent = labelText;
        const value = document.createElement("strong");
        value.textContent = valueText;
        dateBox.append(label, value);
        return dateBox;
    }

    // Tasks store their creator's account ID, so the name shown follows renames
    const assignedByName = task => (task.assignedById ? nameOf(task.assignedById) : task.assignedBy) || "Household";

    function taskDueDateTime(task) {
        const dueDate = task.date || task.dueDate;
        if (!dueDate) {
            return Number.POSITIVE_INFINITY;
        }

        const normalizedDate = String(dueDate).trim();
        const relativeDate = normalizedDate.toLowerCase();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
            ? new Date(`${normalizedDate}T00:00:00`)
            : relativeDate === "today"
                ? new Date(new Date().setHours(0, 0, 0, 0))
                : relativeDate === "tomorrow"
                    ? new Date(new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000)
                    : new Date(normalizedDate);
        if (Number.isNaN(date.getTime())) {
            return Number.POSITIVE_INFINITY;
        }

        const time = task.time || task.dueTime || "";
        const match = String(time).match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
            date.setHours(Number(match[1]), Number(match[2]), 0, 0);
        }
        return date.getTime();
    }

    const sortTasksByDueDate = tasks => tasks.sort((a, b) => taskDueDateTime(a) - taskDueDateTime(b));

    function isTaskPastDue(task, today = new Date()) {
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        return taskDueDateTime(task) < todayStart.getTime();
    }

    function formatTaskDue(task) {
        const dueDate = task.date || task.dueDate;
        if (!dueDate) {
            return "No due date";
        }

        const timeText = formatTaskDueTime(task);

        if (!task.date) {
            const dueTime = timeText ? ` · ${timeText}` : "";
            return `Due ${dueDate}${dueTime}`;
        }

        const date = new Date(`${task.date}T00:00:00`);
        const dateText = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `Due ${dateText}${timeText ? ` · ${timeText}` : ""}`;
    }

    function formatTaskDueDate(task) {
        return formatTaskDue(task).replace(/^Due /, "").split(" · ")[0];
    }

    function formatTaskDueTime(task) {
        const time = task.time || task.dueTime || "";
        const match = String(time).match(/^(\d{1,2}):(\d{2})$/);
        return match
            ? new Date(`2000-01-01T${time}`).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit"
            })
            : String(time);
    }

    function formatEventDate(dateISO) {
        return new Date(`${dateISO}T00:00:00`).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric"
        });
    }

    function isTaskDueToday(task, today = new Date()) {
        const dueDate = task.date || task.dueDate;
        if (!dueDate) {
            return false;
        }

        const normalizedDate = String(dueDate).trim();
        const relativeDate = normalizedDate.toLowerCase();
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        let date;
        if (relativeDate === "today") {
            return true;
        } else if (relativeDate === "tomorrow") {
            return false;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
            date = new Date(`${normalizedDate}T00:00:00`);
        } else {
            const dateWithYear = /\b\d{4}\b/.test(normalizedDate)
                ? normalizedDate
                : `${normalizedDate} ${todayStart.getFullYear()}`;
            date = new Date(dateWithYear);
        }

        return !Number.isNaN(date.getTime()) &&
            date.getFullYear() === todayStart.getFullYear() &&
            date.getMonth() === todayStart.getMonth() &&
            date.getDate() === todayStart.getDate();
    }

    // Keep your name current everywhere it's shown, including after a change in Settings
    function refreshMyName() {
        const me = memberFor(meId);
        if (!me) return;
        householdData.user.name = me.name;
        householdData.user.initials = me.initials;
        document.getElementById("accountName") && (document.getElementById("accountName").textContent = me.name);
        document.getElementById("userName") && (document.getElementById("userName").textContent = me.name);
        document.getElementById("profileAvatar") && (document.getElementById("profileAvatar").textContent = me.initials);
    }
    window.addEventListener("roomie:members-updated", refreshMyName);
    refreshMyName();

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
        const profileAvatar = document.getElementById("profileAvatar");
        profileAvatar.textContent = householdData.user.initials;
        profileAvatar.style.backgroundColor = myColor() || "";

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


        const userName = householdData.user.name;
        const memberForName = memberFor;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        function renderHomeEvents() {
            homeEvents.replaceChildren();
            // Your personal events, plus shared events you're part of or that the whole family shares
            const personalEvents = [
                ...householdData.calendar.personal.map(event => ({
                    ...event,
                    owner: meId
                })),
                ...householdData.calendar.shared
                    .filter(event => !event.attendees?.length || event.attendees.some(isMe))
                    .map(event => ({ ...event, kind: "family" }))
            ];

            try {
                const savedEvents = JSON.parse(localStorage.getItem(storageKey("remindRoomieCalendarEvents")) || "[]");
                if (!Array.isArray(savedEvents)) {
                    throw new Error("Saved events have an invalid format.");
                }
                personalEvents.push(...savedEvents
                    .filter(event => event.scope !== "shared")
                    .map(event => ({ ...event, owner: meId })));
            } catch (error) {
                console.error("Could not load calendar events for the home page.", error);
            }

            let eventEdits = {};
            let deletedEventIds = [];
            try {
                const savedEdits = localStorage.getItem(storageKey("remindRoomieCalendarEdits"));
                eventEdits = savedEdits ? JSON.parse(savedEdits) : {};
                if (!eventEdits || Array.isArray(eventEdits) || typeof eventEdits !== "object") {
                    throw new Error("Saved event changes have an invalid format.");
                }
            } catch (error) {
                console.error("Could not load event changes for the home page.", error);
            }
            try {
                const savedDeletedEvents = localStorage.getItem(storageKey("remindRoomieDeletedEvents"));
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
                    return event.date &&
                        !Number.isNaN(eventDate.getTime()) &&
                        eventDate >= today && eventDate <= weekEnd;
                })
                .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));

            if (eventsThisWeek.length) {
                eventsThisWeek.forEach(event => {
                    const card = document.createElement("article");
                    card.className = "event-card roomie-card roomie-event-card roomie-person-card";
                    // Color by the person the event is for, the same as the calendar
                    const owner = (event.attendees || []).map(memberFor)
                        .find(member => member && member.id !== event.owner) || memberFor(event.owner);
                    setMemberCardColor(card, owner);
                    // One circle per person, the same as the calendar cards
                    const avatar = document.createElement("div");
                    avatar.className = "home-event-avatars";
                    const makeCircle = member => {
                        return createMemberAvatar(member, "event-avatar", "?", "div");
                    };
                    const isFamilyWide = event.kind === "family" && (!event.attendees?.length ||
                        householdData.family.every(member => member.id === event.owner || event.attendees.includes(member.id)));
                    if (isFamilyWide) {
                        const familyCircle = makeCircle(owner);
                        familyCircle.textContent = "";
                        const familyIcon = document.createElement("i");
                        familyIcon.className = "fa-solid fa-users";
                        familyIcon.setAttribute("aria-hidden", "true");
                        familyCircle.append(familyIcon);
                        avatar.append(familyCircle);
                    } else {
                        // Up to 3 people show their circle; with more, show 2 and a "+N" circle
                        const people = (event.attendees || []).map(memberFor).filter(Boolean);
                        const shown = people.length > 3 ? people.slice(0, 2) : people;
                        const overlap = shown.length === 3 ? "-14px" : "-8px";
                        (shown.length ? shown : [owner]).forEach((member, index) => {
                            const circle = makeCircle(member);
                            if (index > 0) {
                                circle.style.marginLeft = overlap;
                            }
                            avatar.append(circle);
                        });
                        if (people.length > shown.length) {
                            const more = makeCircle(null);
                            more.textContent = `+${people.length - shown.length}`;
                            more.style.backgroundColor = "#eeeeee";
                            more.style.marginLeft = "-8px";
                            avatar.append(more);
                        }
                    }
                    const details = document.createElement("div");
                    details.className = "event-details";
                    const title = document.createElement("h4");
                    title.textContent = event.title;
                    const date = document.createElement("p");
                    date.className = "roomie-due-date";
                    const dateText = formatEventDate(event.date);
                    const timeText = event.time
                        ? new Date(`2000-01-01T${event.time}`).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit"
                        })
                        : "All day";
                    date.textContent = `${dateText} · ${timeText}`;
                    details.append(title, date);
                    details.append(createAttribution(eventAddedBy(event)));
                    card.append(avatar, details);
                    card.tabIndex = 0;
                    card.setAttribute("role", "button");
                    card.setAttribute("aria-label", `View event details: ${event.title}`);
                    const openEventDetails = () => {
                        window.location.href = `calendar.html?event=${encodeURIComponent(event.id)}`;
                    };
                    card.addEventListener("click", openEventDetails);
                    card.addEventListener("keydown", keyEvent => {
                        if (["Enter", " "].includes(keyEvent.key)) {
                            keyEvent.preventDefault();
                            openEventDetails();
                        }
                    });
                    homeEvents.append(card);
                });
            } else {
                const empty = document.createElement("p");
                empty.className = "home-list-empty";
                empty.textContent = "No personal events this week.";
                homeEvents.append(empty);
            }

            }
        renderHomeEvents();
        window.addEventListener("roomie:local-events-updated", renderHomeEvents);
        window.addEventListener("roomie:members-updated", renderHomeEvents);

        const assignedToCurrentUser = task => {
            if (task.memberIds?.length) return task.memberIds.includes(window.roomieCloud.user.uid);
            const assignedNames = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : String(task.assignedTo || "").split(",").map(name => name.trim());
            return assignedNames.includes(userName) || assignedNames.includes("Household");
        };
        function renderHomeTasks() {
            homeTasks.replaceChildren();
            const tasks = window.roomieCloud.tasks;
            const todayTasks = tasks.filter(task =>
                assignedToCurrentUser(task) && task.status !== "rejected" && isTaskDueToday(task)
            );
            const completed = todayTasks.filter(task => task.status === "completed").length;
            const total = todayTasks.length;
            const percentage = total ? Math.round(completed / total * 100) : 0;
            document.getElementById("taskProgress").textContent = `${completed} of ${total} tasks due today completed`;
            document.getElementById("progressPercentage").textContent = `${percentage}%`;
            document.getElementById("progressRing").style.background =
                `conic-gradient(#357266 ${percentage}%, #ffffff ${percentage}%)`;
            const myTasks = window.roomieCloud.tasks
                .filter(task => assignedToCurrentUser(task) && ["requested", "accepted"].includes(task.status));

            if (myTasks.length) {
            sortTasksByDueDate(myTasks).forEach(task => {
                const card = document.createElement("article");
                card.className = "event-card roomie-card roomie-task-card roomie-person-card";
                const assignedNames = Array.isArray(task.assignedTo)
                    ? task.assignedTo
                    : String(task.assignedTo || "").split(",").map(name => name.trim());
                // These tasks are yours, so they take your current color
                const assignee = memberFor(meId);
                setMemberCardColor(card, assignee);
                // Profile circles for everyone on the task, stacked like the Tasks page
                const avatar = document.createElement("div");
                avatar.className = "home-event-avatars";
                const people = (task.memberIds || []).map(memberFor).filter(Boolean);
                const shown = people.length > 3 ? people.slice(0, 2) : people;
                const overlap = shown.length === 3 ? "-14px" : "-8px";
                (shown.length ? shown : [assignee]).forEach((member, index) => {
                    const circle = createMemberAvatar(member, "event-avatar task-home-avatar", "?", "div");
                    if (index > 0) {
                        circle.style.marginLeft = overlap;
                    }
                    avatar.append(circle);
                });
                if (people.length > shown.length) {
                    const more = document.createElement("div");
                    more.className = "event-avatar task-home-avatar";
                    more.style.backgroundColor = "#eeeeee";
                    more.style.marginLeft = "-8px";
                    more.textContent = `+${people.length - shown.length}`;
                    avatar.append(more);
                }
                const details = document.createElement("div");
                details.className = "event-details";
                const title = document.createElement("h4");
                title.textContent = task.title;
                const due = document.createElement("p");
                due.className = "roomie-due-date";
                const status = String(task.status || "requested").toLowerCase();
                due.textContent = `${formatTaskDue(task)} · ${status.charAt(0).toUpperCase()}${status.slice(1)}`;
                details.append(title, due);
                details.append(createAttribution(assignedByName(task)));
                card.append(avatar, details);
                card.tabIndex = 0;
                card.setAttribute("role", "button");
                card.setAttribute("aria-label", `View task details: ${task.title}`);
                const openTaskDetails = () => {
                    window.location.href = `tasks.html?task=${encodeURIComponent(task.id)}`;
                };
                card.addEventListener("click", openTaskDetails);
                card.addEventListener("keydown", event => {
                    if (["Enter", " "].includes(event.key)) {
                        event.preventDefault();
                        openTaskDetails();
                    }
                });
                homeTasks.append(card);
            });
            } else {
                const empty = document.createElement("p");
                empty.className = "home-list-empty";
                empty.textContent = "No tasks assigned to you.";
                homeTasks.append(empty);
            }
        }

        renderHomeTasks();
        window.addEventListener("roomie:tasks-updated", renderHomeTasks);
        window.addEventListener("roomie:members-updated", () => {
            householdData.family = window.roomieCloud.members;
            profileAvatar.style.backgroundColor = myColor() || "";
            renderHomeTasks();
        });

    }


    // --------------------------------
    // CALENDAR PAGE
    // --------------------------------

    const calendarGrid = document.getElementById("calendarGrid");

    if (calendarGrid) {

        const calendarStorageKey = storageKey("remindRoomieCalendarEvents");
        const editsStorageKey = storageKey("remindRoomieCalendarEdits");
        const deletedStorageKey = storageKey("remindRoomieDeletedEvents");
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
        const editAssignees = document.getElementById("editAssignees");
        const monthTitle = document.getElementById("monthTitle");
        const selectedDayTitle = document.getElementById("selectedDayTitle");
        const weekEvents = document.getElementById("weekEvents");
        const dayEvents = document.getElementById("dayEvents");
        const pastEventsList = document.getElementById("pastEvents");
        const togglePastEventsButton = document.getElementById("togglePastEvents");
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
        const requestedEventId = new URLSearchParams(window.location.search).get("event");

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
                    owner: meId
                })),
                ...householdData.calendar.housemates.map(event => ({ ...event, kind: "personal" })),
                ...householdData.calendar.shared.map(event => ({
                    ...event,
                    kind: "family",
                    owner: event.createdBy || event.addedBy
                })),
                ...savedEvents.map(event => event.scope === "shared"
                    ? { ...event, kind: "family", owner: event.addedBy }
                    : { ...event, kind: "personal", owner: meId })
            ];
        }

        // Personal tab: your own events, plus shared events you are part of
        // (events with no attendee list are shared with the whole family).
        // Shared tab: everyone's events.
        function visibleEvents() {
            return allEvents().filter(event => {
                if (scope === "personal") {
                    const isMine = event.kind === "personal" && isMe(event.owner);
                    const isIncluded = event.kind === "family" &&
                        (!event.attendees?.length || event.attendees.some(isMe));
                    return isMine || isIncluded;
                }
                return true;
            });
        }

        function ownerOf(event) {
            return memberFor(event.owner);
        }

        // The person an event is for: the first attendee who isn't the creator.
        // Events with no one else listed (your own, or family-wide) use the creator.
        function recipientOf(event) {
            const recipientId = (event.attendees || []).find(value => memberFor(value) && value !== event.owner);
            return memberFor(recipientId) || ownerOf(event);
        }

        function ownerColor(event) {
            return recipientOf(event)?.color || "#f7dafa";
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

        function renderPastEvents() {
            pastEventsList.replaceChildren();
            const events = visibleEvents()
                .filter(event => event.date < todayISO)
                .sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""));

            if (!events.length) {
                const empty = document.createElement("p");
                empty.className = "empty-chores";
                empty.textContent = "No past events.";
                pastEventsList.append(empty);
                return;
            }

            events.forEach(event => pastEventsList.append(createEventCard(event)));
        }

        function createEventCard(event) {
            const card = document.createElement("article");
            const owner = recipientOf(event);
            card.className = `cal-event ${event.kind} roomie-card roomie-event-card roomie-person-card`;
            setMemberCardColor(card, owner);

            // One circle per person assigned, overlapping like the task cards
            const avatar = document.createElement("span");
            avatar.className = "cal-event-avatars";

            function buildCircle(member) {
                return createMemberAvatar(member, "cal-event-avatar");
            }

            const time = document.createElement("span");
            time.className = "cal-event-time";
            time.textContent = formatTime(event.time);

            const details = document.createElement("div");
            details.className = "cal-event-details";

            const title = document.createElement("h4");
            title.textContent = event.title;

            const date = document.createElement("p");
            date.className = "cal-event-date roomie-due-date";
            date.textContent = formatEventDate(event.date);

            const meta = document.createElement("p");
            meta.textContent = event.location || "";

            details.append(title, date);
            if (event.location) {
                details.append(meta);
            }
            details.append(createAttribution(eventAddedBy(event)));

            if (event.description) {
                const description = document.createElement("p");
                description.className = "cal-event-description";
                description.textContent = event.description;
                details.append(description);
            }

            card.append(avatar, details, time);

            // Events shared with the whole family show the family icon in place of the initial
            const isFamilyWide = event.kind === "family" && (!event.attendees?.length ||
                householdData.family.every(member => member.id === event.owner || event.attendees.includes(member.id)));
            if (isFamilyWide) {
                const familyCircle = buildCircle(null);
                familyCircle.textContent = "";
                setMemberAvatarColor(familyCircle, owner);
                const familyAvatarIcon = document.createElement("i");
                familyAvatarIcon.className = "fa-solid fa-users";
                familyAvatarIcon.setAttribute("aria-hidden", "true");
                familyCircle.append(familyAvatarIcon);
                avatar.append(familyCircle);
            } else {
                // Up to 3 people show their circle; with more, show 2 and a "+N" circle for the rest
                const people = (event.attendees || []).map(memberFor).filter(Boolean);
                const shownPeople = people.length > 3 ? people.slice(0, 2) : people;
                const overlap = shownPeople.length === 3 ? "-14px" : "-8px";
                (shownPeople.length ? shownPeople : [owner]).forEach((member, index) => {
                    const circle = buildCircle(member);
                    if (index > 0) {
                        circle.style.marginLeft = overlap;
                    }
                    avatar.append(circle);
                });
                if (people.length > shownPeople.length) {
                    const more = buildCircle(null);
                    more.textContent = `+${people.length - shownPeople.length}`;
                    more.style.backgroundColor = "#eeeeee";
                    more.style.marginLeft = "-8px";
                    avatar.append(more);
                }
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
            renderPastEvents();
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

        togglePastEventsButton.addEventListener("click", () => {
            const isExpanded = togglePastEventsButton.getAttribute("aria-expanded") !== "true";
            togglePastEventsButton.setAttribute("aria-expanded", String(isExpanded));
            togglePastEventsButton.textContent = isExpanded ? "Hide past events" : "Show past events";
            pastEventsList.hidden = !isExpanded;
        });

        function showEventMessage(message) {
            eventMessage.textContent = message;
            eventMessage.hidden = false;
        }

        // Lists every family member as a chip. The add form selects you by default;
        // the edit form selects the event's current people.
        function renderEventAssignees(container = eventAssignees, selectedIds = [meId]) {
            container.replaceChildren();
            householdData.family.forEach(member => {
                const label = document.createElement("label");
                label.className = "task-assignee-option";
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.name = "eventAssignee";
                checkbox.value = member.id;
                checkbox.checked = selectedIds.includes(member.id);

                const avatar = createMemberAvatar(
                    member,
                    "cal-assignee-avatar",
                    "",
                    "span",
                    "#e7d9f5"
                );
                if (member.photo) {
                    const image = document.createElement("img");
                    image.src = member.photo;
                    image.alt = "";
                    avatar.append(image);
                }

                const name = document.createElement("span");
                name.className = "cal-assignee-name";
                name.textContent = member.name;
                label.append(avatar, name, checkbox);
                container.append(label);
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

        function openRequestedEvent() {
            if (!requestedEventId) {
                return;
            }
            const event = allEvents().find(item => String(item.id) === requestedEventId);
            if (!event) {
                return;
            }
            if (!visibleEvents().some(item => String(item.id) === requestedEventId)) {
                setScope("shared");
            }
            openEvent(event.id);
            const url = new URL(window.location.href);
            url.searchParams.delete("event");
            window.history.replaceState({}, "", url);
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

            const isOwner = event._remote
                ? event.createdBy === window.roomieCloud.user.uid
                : isMe(event.owner);
            const owner = recipientOf(event);

            // Hero card, tinted with the recipient's secondary color
            eventHero.classList.add("roomie-card", "roomie-person-card");
            setMemberCardColor(eventHero, owner);
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

            body.append(heroTitle, createDetailHeroDate("Date", formatShortDay(event.date)));
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
                const currentPeople = (event.attendees?.length ? event.attendees : [event.owner])
                    .map(value => memberFor(value)?.id)
                    .filter(Boolean);
                renderEventAssignees(editAssignees, currentPeople);
                return;
            }

            const rows = [
                ["fa-calendar-day", "Date", formatDay(event.date)],
                ["fa-clock", "Time", formatTimeRange(event)]
            ];
            if (event.kind === "family" || event.sharedWithFamily) {
                rows.push([
                    "fa-user-group",
                    "Shared with",
                    event.attendees?.length
                        ? event.attendees.map(nameOf).join(", ")
                        : "The family"
                ]);
            }
            rows.push(["fa-location-dot", "Location", event.location || "No location"]);
            rows.push(
                ["fa-user", "Added by", eventAddedBy(event)],
                ["fa-align-left", "Description", event.description || "No description"]
            );

            renderDetailRows(eventDetailCard, rows);
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

        document.getElementById("confirmDelete").addEventListener("click", async () => {
            const remoteEvent = householdData.calendar.shared.find(event => event.id === pendingDeleteId);
            if (remoteEvent) {
                try {
                    await window.roomieCloud.deleteEvent(remoteEvent.id);
                    closeDeleteModal();
                    showCalendarView();
                } catch (error) {
                    console.error("Could not delete the shared event.", error);
                    showCalendarView();
                    window.roomieCloud.reportError(error);
                }
                return;
            }

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

        editEventForm.addEventListener("submit", async event => {
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

            const attendees = [...editAssignees.querySelectorAll('input[name="eventAssignee"]:checked')]
                .map(input => input.value);
            if (!attendees.length) {
                showEditMessage("Choose who this event is for.");
                return;
            }

            const changes = {
                title,
                date: editDate.value,
                time: editTime.value,
                endTime: editEndTime.value,
                location: editLocation.value.trim(),
                description: editDescription.value.trim(),
                attendees
            };
            const remoteEvent = householdData.calendar.shared.find(item => item.id === openEventId);
            if (remoteEvent) {
                try {
                    await window.roomieCloud.updateEvent(openEventId, changes);
                    editingEvent = false;
                    renderDetail();
                } catch (error) {
                    console.error("Could not save the shared event change.", error);
                    showEditMessage("Could not save this shared event. Please try again.");
                }
                return;
            }

            // A personal event given to someone else moves to the shared calendar
            const givenToOthers = attendees.some(value => !isMe(value));
            if (givenToOthers) {
                try {
                    await window.roomieCloud.addEvent({
                        ...changes,
                        addedBy: householdData.user.name,
                        scope: "shared"
                    });
                    const nextDeleted = [...deletedEventIds, openEventId];
                    localStorage.setItem(deletedStorageKey, JSON.stringify(nextDeleted));
                    deletedEventIds = nextDeleted;
                    showCalendarView();
                } catch (error) {
                    console.error("Could not move the event to the shared calendar.", error);
                    showEditMessage("Could not share this event. Please try again.");
                }
                return;
            }

            const nextEdits = {
                ...eventEdits,
                [openEventId]: changes
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

        addEventForm.addEventListener("submit", async event => {
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
                scope: attendees.length === 1 && isMe(attendees[0])
                    ? "personal"
                    : "shared"
            };
            if (newEvent.scope === "shared") {
                try {
                    newEvent.id = await window.roomieCloud.addEvent(newEvent);
                    newEvent._remote = true;
                    // onSnapshot supplies the event; inserting here would duplicate it.
                } catch (error) {
                    console.error("Could not save the shared event.", error);
                    showEventMessage("Could not save this shared event. Please try again.");
                    return;
                }
            } else {
                const nextEvents = [...savedEvents, newEvent];
                try {
                    localStorage.setItem(calendarStorageKey, JSON.stringify(nextEvents));
                } catch (error) {
                    console.error("Could not save the new event.", error);
                    showEventMessage("Could not save this event in your browser storage.");
                    return;
                }
                savedEvents = nextEvents;
            }

            // Jump to the new event so it is visible straight away
            const eventDay = new Date(`${newEvent.date}T00:00:00`);
            viewYear = eventDay.getFullYear();
            viewMonth = eventDay.getMonth();
            selectedDate = newEvent.date;
            closeEventForm();
            setScope(newEvent.scope);
        });

        window.addEventListener("roomie:tasks-updated", render);

        window.addEventListener("roomie:events-updated", () => {
            householdData.calendar.shared = window.roomieCloud.events.map(event => ({
                ...event,
                kind: "family",
                owner: event.createdBy || event.addedBy
            }));
            render();
            openRequestedEvent();
            if (openEventId && !editingEvent) {
                renderDetail();
            }
        });

        window.addEventListener("roomie:local-events-updated", () => {
            loadSavedEvents();
            loadEventEdits();
            loadDeletedEvents();
            render();
            openRequestedEvent();
        });
        window.addEventListener("storage", event => {
            if ([calendarStorageKey, editsStorageKey, deletedStorageKey].includes(event.key) || event.key === null) {
                loadSavedEvents();
                loadEventEdits();
                loadDeletedEvents();
                render();
                openRequestedEvent();
            }
        });
        window.addEventListener("roomie:members-updated", () => {
            householdData.family = window.roomieCloud.members;
            renderEventAssignees();
            render();
            openRequestedEvent();
            if (openEventId && !editingEvent) {
                renderDetail();
            }
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
        const taskListView = document.getElementById("taskListView");
        const taskDetailView = document.getElementById("taskDetailView");
        const taskDetailHero = document.getElementById("taskDetailHero");
        const taskDetailCard = document.getElementById("taskDetailCard");
        const yourTasksList = document.getElementById("yourTasks");
        const allTasksList = document.getElementById("allTasks");
        const pastTasksList = document.getElementById("pastTasks");
        const togglePastTasksButton = document.getElementById("togglePastTasks");
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
        let feedback = null;
        let openTaskId = null;
        let requestedTaskId = new URLSearchParams(window.location.search).get("task");
        let loadError = "";
        let pastTasksExpanded = false;

        function memberId(member, index) {
            return member.id || `member-${index}`;
        }

        function allTasks() {
            return sortTasksByDueDate(assignedTasks.map(task => ({
                ...task,
                status: task.completed ? "completed" : task.status || "requested"
            })));
        }

        function isAssignedToCurrentUser(task) {
            if (task.memberIds?.length) return task.memberIds.includes(window.roomieCloud.user.uid);
            const assignedNames = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : String(task.assignedTo || "").split(",").map(name => name.trim());
            return assignedNames.includes(householdData.user.name) || assignedNames.includes("Household");
        }

        function taskAssignees(task) {
            const assignedNames = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : String(task.assignedTo || "Household").split(",").map(name => name.trim()).filter(Boolean);
            const assigneesById = (task.memberIds || [])
                .map(id => familyMembers.find(person => person.id === id))
                .filter(Boolean);
            return assigneesById.length
                ? assigneesById
                : assignedNames
                    .map(name => familyMembers.find(person => person.name === name))
                    .filter(Boolean);
        }

        function makeTaskCardOpenable(card, task) {
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", `View task details: ${task.title}`);
            card.addEventListener("click", event => {
                if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a, form")) {
                    return;
                }
                openTask(task.id);
            });
            card.addEventListener("keydown", event => {
                if (event.target !== card || !["Enter", " "].includes(event.key)) {
                    return;
                }
                event.preventDefault();
                openTask(task.id);
            });
        }

        async function updateTask(task, update, showFeedback = false) {
            try {
                await window.roomieCloud.updateTask(task.id, update);
                loadError = "";
                if (showFeedback) {
                    feedback = { task: { ...task, ...update }, status: update.status };
                    openTaskId = null;
                }
                renderTasks();
            } catch (error) {
                console.error("Could not save the household task update.", error);
                loadError = "Could not save this task update. Please try again.";
                renderTasks();
            }
        }

        function createTaskSummary(task, options = {}) {
            const card = document.createElement("article");
            card.className = "task-list-card roomie-card roomie-task-card roomie-person-card";
            if (task.status === "completed") {
                card.classList.add("completed");
            }
 
            const assignedNames = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : String(task.assignedTo || "Household").split(",").map(name => name.trim()).filter(Boolean);
            // Match by account first, so a renamed person keeps their color on old tasks
            const assignees = taskAssignees(task);

            // The card takes the color of the person the task is for, not the person who assigned it
            setMemberCardColor(card, assignees[0], "#ffffff");
 
            function buildAvatar(member, fallbackName) {
                const circle = createMemberAvatar(
                    member,
                    "task-list-avatar",
                    fallbackName?.charAt(0).toUpperCase() || "?",
                    "span",
                    "#e5f1ee"
                );
                circle.style.color = "#080808";
                if (member?.photo) {
                    const image = document.createElement("img");
                    image.src = member.photo;
                    image.alt = member.name;
                    image.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
                    circle.style.overflow = "hidden";
                    circle.append(image);
                }
                circle.title = member?.name || fallbackName || "";
                return circle;
            }
 
            const avatar = document.createElement("span");
            avatar.className = "task-list-avatars";
            avatar.style.cssText = "display:flex;flex:0 0 auto;align-items:center;";
            avatar.setAttribute("aria-label", `Assigned to ${assignedNames.join(", ")}`);
            // Up to 3 people show their circle; with more, show 2 and a "+N" circle for the rest
            const shownAssignees = assignees.length > 3 ? assignees.slice(0, 2) : assignees;
            const avatarList = assignees.length
                ? shownAssignees.map(member => buildAvatar(member))
                : [buildAvatar(null, assignedNames[0])];
            if (assignees.length > shownAssignees.length) {
                const more = buildAvatar(null, "+");
                more.textContent = `+${assignees.length - shownAssignees.length}`;
                more.style.backgroundColor = "#eeeeee";
                avatarList.push(more);
            }
            // Three circles overlap a little more so they fit the row
            const overlap = avatarList.length === 3 ? "-14px" : "-8px";
            avatarList.forEach((circle, index) => {
                if (index > 0) {
                    circle.style.marginLeft = overlap;
                }
                avatar.append(circle);
            });
 
            const details = document.createElement("span");
            details.className = "task-list-details";
            const title = document.createElement("strong");
            title.textContent = task.title;
            const due = formatTaskDue(task).replace(/^Due /, "");
            const dueText = document.createElement("span");
            dueText.className = "roomie-due-date";
            dueText.textContent = due;
            details.append(title, dueText);
            details.append(createAttribution(assignedByName(task), "span"));

            if (task.status !== "completed" && isTaskPastDue(task)) {
                const overdue = document.createElement("span");
                overdue.className = "status overdue";
                overdue.textContent = "Overdue";
                card.append(overdue);
            }

            if (options.allowCompletion && isAssignedToCurrentUser(task) && ["accepted", "completed"].includes(task.status)) {
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
                const status = document.createElement("span");
                status.className = "status completed";
                status.textContent = "Completed";
                card.append(status);
            } else if (options.showStatus && task.status !== "completed") {
                const status = document.createElement("span");
                status.className = `status ${task.status}`;
                status.textContent = task.status.charAt(0).toUpperCase() + task.status.slice(1);
                card.append(status);
            }
 
            card.prepend(avatar, details);
            if (options.openable !== false) {
                makeTaskCardOpenable(card, task);
            }
            return card;
        }

        function renderRequest(task) {
            const card = document.createElement("article");
            card.className = "task-request-card roomie-card roomie-task-card roomie-person-card";
            const assignees = taskAssignees(task);
            const assignee = assignees.find(member => member.id === meId) || assignees[0];
            setMemberCardColor(card, assignee, "#ffffff");

            const title = document.createElement("h3");
            title.className = "task-request-title";
            title.textContent = task.title;
            const assignedBy = createAttribution(assignedByName(task));
            assignedBy.classList.add("task-assigned-by");
            const due = document.createElement("p");
            due.className = "task-due roomie-due-date";
            due.textContent = formatTaskDue(task);

            if (task.status !== "completed" && isTaskPastDue(task)) {
                const overdue = document.createElement("span");
                overdue.className = "status overdue";
                overdue.textContent = "Overdue";
                card.append(overdue);
            }

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
            makeTaskCardOpenable(card, task);
            return card;
        }

        function openTask(id) {
            openTaskId = id;
            feedback = null;
            document.body.classList.remove("show-task-feedback");
            renderTaskDetail();
            window.scrollTo(0, 0);
        }

        function closeTaskDetail() {
            openTaskId = null;
            taskDetailView.hidden = true;
            taskListView.hidden = false;
            renderTasks();
        }

        function renderTaskDetail() {
            const task = allTasks().find(item => item.id === openTaskId);
            if (!task) {
                closeTaskDetail();
                return;
            }

            const assignees = taskAssignees(task);
            setMemberCardColor(taskDetailHero, assignees[0], "#ffffff");
            taskDetailHero.replaceChildren();

            const top = document.createElement("div");
            top.className = "cal-hero-top";
            const label = document.createElement("p");
            label.className = "cal-form-label";
            label.textContent = "Task";
            top.append(label);

            const body = document.createElement("div");
            body.className = "cal-hero-body";
            const title = document.createElement("h2");
            title.className = "cal-hero-title";
            title.textContent = task.title;

            const normalizedStatus = String(task.status || "requested").toLowerCase();
            body.append(title, createDetailHeroDate("Due", formatTaskDueDate(task)));
            taskDetailHero.append(top, body);

            const assignedTo = assignees.length
                ? assignees.map(member => member.name).join(", ")
                : (Array.isArray(task.assignedTo) ? task.assignedTo.join(", ") : task.assignedTo) || "Household";
            const rows = [
                ["fa-calendar-day", "Due", formatTaskDueDate(task)]
            ];
            const dueTime = formatTaskDueTime(task);
            if (dueTime) {
                rows.push(["fa-clock", "Time", dueTime]);
            }
            rows.push(
                ["fa-circle-check", "Status", normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)],
                ["fa-user-group", "Assigned to", assignedTo],
                ["fa-user", "Added by", assignedByName(task)],
                ["fa-align-left", "Details", task.details || task.description || "No details"]
            );
            renderDetailRows(taskDetailCard, rows);

            taskListView.hidden = true;
            taskDetailView.hidden = false;
            feedbackView.hidden = true;
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
            }, { showStatus: true, openable: false }));
        }

        function renderTasks() {
            taskRequests.replaceChildren();
            yourTasksList.replaceChildren();
            allTasksList.replaceChildren();
            pastTasksList.replaceChildren();
            const tasks = allTasks();
            const pastTasks = tasks.filter(task =>
                task.status === "completed" && isTaskPastDue(task)
            );
            const activeTasks = tasks.filter(task => !pastTasks.includes(task));
            const requests = activeTasks.filter(task =>
                task.status === "requested" && isAssignedToCurrentUser(task)
            );
            const mine = activeTasks.filter(task =>
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
            activeTasks.forEach(task => allTasksList.append(createTaskSummary(task, {
                allowCompletion: true,
                showStatus: true
            })));

            if (pastTasks.length) {
                pastTasks.forEach(task => pastTasksList.append(createTaskSummary(task, {
                    allowCompletion: true,
                    showStatus: true
                })));
            } else {
                const empty = document.createElement("p");
                empty.className = "empty-chores";
                empty.textContent = "No completed past-due tasks yet.";
                pastTasksList.append(empty);
            }
            pastTasksList.hidden = !pastTasksExpanded;
            togglePastTasksButton.setAttribute("aria-expanded", String(pastTasksExpanded));
            togglePastTasksButton.textContent = pastTasksExpanded ? "Hide past tasks" : "Show past tasks";

            if (loadError) {
                const errorNotice = document.createElement("p");
                errorNotice.className = "family-message";
                errorNotice.textContent = loadError;
                taskRequests.append(errorNotice);
            }

            if (feedback) {
                renderFeedback();
            } else if (openTaskId) {
                renderTaskDetail();
            } else {
                feedbackView.hidden = true;
                taskDetailView.hidden = true;
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
                checkbox.defaultChecked = selectedIds.includes(checkbox.value);
                checkbox.checked = checkbox.defaultChecked;
                const name = document.createElement("span");
                name.textContent = member.name;
                label.append(checkbox, name);
                taskAssigneeOptions.append(label);
            });
        }

        function loadTasks() {
            loadError = "";
            familyMembers = window.roomieCloud.members.length
                ? [...window.roomieCloud.members]
                : [...householdData.family];
            assignedTasks = [...window.roomieCloud.tasks];

            const selected = [...taskAssigneeOptions.querySelectorAll('input:checked')].map(input => input.value);
            renderAssigneeOptions(selected.length ? selected : [memberId(familyMembers[0], 0)]);
            if (requestedTaskId && assignedTasks.some(task => task.id === requestedTaskId)) {
                openTaskId = requestedTaskId;
                requestedTaskId = null;
            }
            renderTasks();
        }

        document.getElementById("backToTasks").addEventListener("click", () => {
            feedback = null;
            document.body.classList.remove("show-task-feedback");
            renderTasks();
        });
        document.getElementById("backFromTaskDetails").addEventListener("click", closeTaskDetail);
        togglePastTasksButton.addEventListener("click", () => {
            pastTasksExpanded = !pastTasksExpanded;
            pastTasksList.hidden = !pastTasksExpanded;
            togglePastTasksButton.setAttribute("aria-expanded", String(pastTasksExpanded));
            togglePastTasksButton.textContent = pastTasksExpanded ? "Hide past tasks" : "Show past tasks";
        });

        addTaskForm.addEventListener("submit", async event => {
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

            const assignedTo = familyMembers
                    .filter((member, index) => memberIds.includes(memberId(member, index)))
                    .map(member => member.name)
                    .join(", ");
            try {
                await window.roomieCloud.addTask(title, assignedTo, newTaskDate.value, {
                    memberIds,
                    assignedBy: householdData.user.name,
                assignedById: meId,
                    date: newTaskDate.value,
                    time: newTaskTime.value,
                    status: "requested"
                });
                addTaskForm.reset();
                renderAssigneeOptions([memberId(familyMembers[0], 0)]);
                addTaskForm.hidden = true;
                addTaskButton.setAttribute("aria-expanded", "false");
            } catch (error) {
                console.error("Could not save the new household task.", error);
                newTaskMessage.textContent = "Could not save this task. Please try again.";
                newTaskMessage.hidden = false;
            }
        });

        window.addEventListener("roomie:tasks-updated", loadTasks);
        window.addEventListener("roomie:members-updated", loadTasks);

        loadTasks();
    }


    // --------------------------------
    // FAMILY PAGE
    // --------------------------------

    // --------------------------------
    // SETTINGS PAGE
    // --------------------------------

    const settingsPage = document.getElementById("settingsPage");

    if (settingsPage) {
        const nameForm = document.getElementById("settingsNameForm");
        const nameInput = document.getElementById("settingsName");
        const colorGrid = document.getElementById("settingsColors");
        const nameSettingsMessage = document.getElementById("nameSettingsMessage");
        const colorSettingsMessage = document.getElementById("colorSettingsMessage");

        function showSettingsMessage(messageElement, message, isError = false) {
            messageElement.textContent = message;
            messageElement.classList.toggle("is-error", isError);
            messageElement.hidden = false;
        }

        // Each color can belong to one person; taken colors are shown but disabled
        function renderColors() {
            const me = memberFor(meId);
            colorGrid.replaceChildren();

            householdData.colorPalette.forEach(swatch => {
                const owner = householdData.family.find(member =>
                    member.id !== meId && member.color === swatch.color
                );

                const button = document.createElement("button");
                button.type = "button";
                button.className = "color-swatch";
                button.style.backgroundColor = swatch.color;
                button.setAttribute("aria-pressed", String(me?.color === swatch.color));
                button.disabled = Boolean(owner);
                button.title = owner ? `Taken by ${owner.name}` : "Use this color";
                button.setAttribute("aria-label", owner ? `Taken by ${owner.name}` : "Use this color");
                button.addEventListener("click", () => saveColor(swatch.color));
                colorGrid.append(button);
            });
        }

        function renderName() {
            if (document.activeElement !== nameInput) {
                nameInput.value = memberFor(meId)?.name || householdData.user.name;
            }
        }

        async function saveColor(color) {
            try {
                await window.roomieCloud.updateProfile({ color });
                showSettingsMessage(colorSettingsMessage, "Color saved.");
            } catch (error) {
                console.error("Could not save the color.", error);
                showSettingsMessage(colorSettingsMessage, "Could not save your color. Please try again.", true);
            }
        }

        nameForm.addEventListener("submit", async event => {
            event.preventDefault();
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.focus();
                showSettingsMessage(nameSettingsMessage, "Enter a name.", true);
                return;
            }

            try {
                await window.roomieCloud.updateProfile({ displayName: name });
                householdData.user.name = name;
                showSettingsMessage(nameSettingsMessage, "Name saved.");
            } catch (error) {
                console.error("Could not save the name.", error);
                showSettingsMessage(nameSettingsMessage, "Could not save your name. Please try again.", true);
            }
        });

        function renderSettings() {
            renderName();
            renderColors();
        }

        window.addEventListener("roomie:members-updated", renderSettings);
        renderSettings();
    }

    const familyList = document.getElementById("familyList");

    if (familyList) {
        const memberForm = document.getElementById("memberForm");
        const addMemberButton = document.getElementById("addMemberButton");
        const memberEmail = document.getElementById("memberEmail");
        const familyMessage = document.getElementById("familyMessage");
        let familyMembers = window.roomieCloud.members.length
            ? [...window.roomieCloud.members]
            : [...householdData.family];

        function showFamilyMessage(message) {
            familyMessage.textContent = message;
            familyMessage.hidden = false;
        }

        function renderFamilyMembers() {
            familyList.replaceChildren();
            familyMembers.forEach(member => {
                const card = document.createElement("div");
                card.className = "task-card roomie-card roomie-person-card";
                setMemberCardColor(card, member, "#ffffff");
                const avatar = createMemberAvatar(
                    member,
                    "task-avatar",
                    member.name.charAt(0).toUpperCase(),
                    "div",
                    "#e7d9f5"
                );
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

        renderFamilyMembers();

        memberForm.addEventListener("submit", async event => {
            event.preventDefault();
            familyMessage.hidden = true;
            try {
                const email = memberEmail.value.trim();
                const code = await window.roomieCloud.createInvitation(email);
                showFamilyMessage(`Send ${email} the household ID ${window.roomieCloud.householdId} and one-time invitation code ${code}.`);
                memberForm.reset();
                memberForm.hidden = true;
                addMemberButton.setAttribute("aria-expanded", "false");
                addMemberButton.focus();
            } catch (error) {
                console.error("Could not create the household invitation.", error);
                showFamilyMessage("Could not create an invitation. Confirm the email and try again.");
            }
        });

        window.addEventListener("roomie:members-updated", () => {
            familyMembers = [...window.roomieCloud.members];
            householdData.family = familyMembers;
            renderFamilyMembers();
        });
    }


});
