// Keep basic form interactions independent of Firebase and the main app script.
// This classic script runs after the page markup, without waiting for cloud setup.
(function () {
    [
        ["openAddTask", "addTaskForm", "cancelAddTask", "newTaskTitle", "newTaskMessage"],
        ["addMemberButton", "memberForm", "cancelAddMember", "memberEmail", "familyMessage"]
    ].forEach(([triggerId, formId, cancelId, fieldId, messageId]) => {
        const trigger = document.getElementById(triggerId);
        const form = document.getElementById(formId);
        if (!trigger || !form || trigger.dataset.formControlsReady) return;
        trigger.dataset.formControlsReady = "true";
        const message = document.getElementById(messageId);
        trigger.addEventListener("click", () => {
            form.hidden = false;
            trigger.setAttribute("aria-expanded", "true");
            document.getElementById(fieldId).focus();
        });
        document.getElementById(cancelId).addEventListener("click", () => {
            form.reset();
            message.hidden = true;
            form.hidden = true;
            trigger.setAttribute("aria-expanded", "false");
            trigger.focus();
        });
        form.addEventListener("submit", event => {
            if (window.roomieAppState === "ready" && window.roomieCloud) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            message.textContent = window.roomieAppState === "loading"
                ? "Your household is still loading. Please wait, then try again."
                : "Your household could not be loaded. Sign in and reload this page to try again.";
            message.hidden = false;
        });
    });
})();
