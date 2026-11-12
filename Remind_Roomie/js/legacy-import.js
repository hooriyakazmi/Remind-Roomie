import { db } from "./firebase-config.js";
import { doc, getDoc, runTransaction, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// Import is explicit because the old browser store has no account ownership.
// Keep the original keys intact so failed imports never destroy the source data.
export async function importLegacyData(cloud, storage = localStorage) {
  const read = (key, fallback) => JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
  const tasks = read("remindRoomieTasks", null) ?? read("remindRoomieChores", []);
  const events = read("remindRoomieCalendarEvents", []);
  const decisions = read("remindRoomieTaskDecisions", {});
  const edits = read("remindRoomieCalendarEdits", {});
  const deleted = read("remindRoomieDeletedEvents", []);
  if (!Array.isArray(tasks) || !Array.isArray(events) || !Array.isArray(deleted) ||
      !decisions || typeof decisions !== "object" || Array.isArray(decisions) ||
      !edits || typeof edits !== "object" || Array.isArray(edits) ||
      [...tasks, ...events].some(item => !item || typeof item.title !== "string")) {
    throw new Error("Saved browser data has an invalid format. The original data has been kept.");
  }
  const marker = doc(db, "users", cloud.user.uid, "imports", cloud.householdId);
  if ((await getDoc(marker)).exists()) return;
  const importedEvents = events.filter(event => !deleted.includes(event.id))
    .map(event => ({ ...event, ...(edits[event.id] || {}) }));
  const shared = importedEvents.filter(event => event.scope === "shared");
  if (tasks.length + shared.length > 450) {
    throw new Error("This import is too large for one batch. The original data has been kept.");
  }
  const batch = writeBatch(db);
  tasks.forEach((task, index) => {
    const { id, memberIds, _remote, ...data } = task;
    const status = decisions[id]?.status || task.status || (task.completed ? "completed" : "requested");
    batch.set(doc(db, "households", cloud.householdId, "tasks", `legacy-${cloud.user.uid}-${index}`), {
      ...data,
      ...(decisions[id] || {}),
      assignedTo: task.assignedTo || "Household",
      status,
      completed: status === "completed",
      createdAt: serverTimestamp()
    });
  });
  shared.forEach((event, index) => {
    const { id, _remote, ...data } = event;
    batch.set(doc(db, "households", cloud.householdId, "events", `legacy-${cloud.user.uid}-${index}`), {
      ...data, createdBy: cloud.user.uid, createdAt: serverTimestamp()
    });
  });
  // Stage personal events under this account before synchronizing them to the household.
  // Stable IDs also make retries safe if the cloud batch fails.
  const key = `remindRoomieCalendarEvents:${cloud.user.uid}`;
  const existing = read(key, []);
  if (!Array.isArray(existing)) throw new Error("This account's calendar storage is invalid.");
  const merged = new Map(existing.map(event => [event.id, event]));
  importedEvents.filter(event => event.scope !== "shared").forEach((event, index) => {
    const id = `legacy-personal-${index}`;
    if (!merged.has(id)) merged.set(id, { ...event, id });
  });
  storage.setItem(key, JSON.stringify([...merged.values()]));
  batch.set(marker, { importedAt: serverTimestamp() });
  await batch.commit();
}

export function offerLegacyImport(cloud) {
  try {
    const hasLegacy = ["remindRoomieTasks", "remindRoomieChores", "remindRoomieCalendarEvents"]
      .some(key => localStorage.getItem(key));
    const doneKey = `remindRoomieImported:${cloud.user.uid}:${cloud.householdId}`;
    if (!hasLegacy || localStorage.getItem(doneKey)) return;
    const container = document.createElement("aside");
    container.className = "app-status";
    const explanation = document.createElement("p");
    explanation.textContent = "Older browser data is available. Import only if it belongs to you: saved tasks and all calendar events will be visible to this household. Personal events appear on other members’ Shared tabs.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Import my browser data";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await importLegacyData(cloud);
        await syncAccountCalendar(cloud);
        localStorage.setItem(doneKey, "true");
        window.dispatchEvent(new CustomEvent("roomie:local-events-updated"));
        explanation.textContent = "Browser data imported. The original browser data has been kept.";
        button.remove();
      } catch (error) {
        console.error("Could not import browser data.", error);
        explanation.textContent = `Import failed: ${error.message} You can retry using the button below.`;
        button.disabled = false;
      }
    });
    container.append(explanation, button);
    document.body.prepend(container);
  } catch (error) {
    console.error("Browser storage is unavailable.", error);
  }
}

// Upgrade account-owned browser events so every household member can see them.
// A stable document ID and transaction make retries safe without overwriting edits.
export async function syncAccountCalendar(cloud, storage = localStorage) {
  const key = `remindRoomieCalendarEvents:${cloud.user.uid}`;
  const read = (name, fallback) => JSON.parse(storage.getItem(name) || JSON.stringify(fallback));
  const events = read(key, []);
  const edits = read(`remindRoomieCalendarEdits:${cloud.user.uid}`, {});
  const deleted = read(`remindRoomieDeletedEvents:${cloud.user.uid}`, []);
  if (!Array.isArray(events) || !Array.isArray(deleted) || !edits || typeof edits !== "object") {
    throw new Error("This account's calendar storage is invalid.");
  }
  for (const event of events) {
    if (deleted.includes(event.id)) continue;
    const { id, _remote, ...data } = { ...event, ...(edits[event.id] || {}) };
    const ref = doc(db, "households", cloud.householdId, "events",
      `browser-${cloud.user.uid}-${encodeURIComponent(id)}`);
    await runTransaction(db, async transaction => {
      if ((await transaction.get(ref)).exists()) return;
      transaction.set(ref, {
        ...data,
        attendees: data.attendees?.length ? data.attendees : [cloud.user.uid],
        scope: data.scope || "personal",
        createdBy: cloud.user.uid,
        createdAt: serverTimestamp()
      });
    });
  }
  // Keep the browser source intact if any cloud write fails.
  if (events.length) storage.setItem(key, "[]");
}
