
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
            `conic-gradient(#357266 ${percentage}%, #ffffff ${percentage}%)`;


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
