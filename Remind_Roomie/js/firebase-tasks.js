
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// Add task metadata while preserving the original helper's simple arguments.
export async function addTask(householdId, title, assignedTo, dueDate, details = {}) {
  const data = { title, assignedTo, dueDate, ...details };
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  for (const date of [data.dueDate, data.date]) {
    if (date == null || date === "") continue;
    if (!isTaskDate(date) || date < today) throw new Error("Choose today or a future date.");
  }
  const task = await addDoc(collection(db, "households", householdId, "tasks"), {
    ...data,
    completed: false,
    status: details.status || "requested",
    createdAt: serverTimestamp()
  });
  return task.id;
}

// Keep task cards synchronized with Firestore changes from every household member.
export function listenToTasks(householdId, callback, onError) {
  return onSnapshot(
    collection(db, "households", householdId, "tasks"),
    (snapshot) => {
      const tasks = snapshot.docs.map((item) => ({
        ...item.data(),
        id: item.id
      }));

      callback(tasks);
    },
    onError
  );
}

// Persist task responses, rescheduling, and completion state in one update path.
export async function updateTask(householdId, taskId, changes) {
  await updateDoc(
    doc(db, "households", householdId, "tasks", taskId),
    {
      ...changes,
      ...(changes.status === "completed" ? { completed: true } : {}),
      ...(changes.status === "accepted" ? { completed: false } : {})
    }
  );
}

// Keep the helper available for callers that only need to toggle completion.
export async function setTaskCompleted(householdId, taskId, completed) {
  return updateTask(householdId, taskId, {
    completed,
    status: completed ? "completed" : "accepted"
  });
}

function findTaskMember(members, value) {
  if (!value) return undefined;
  const byId = members.find(member => member.id === value);
  if (byId) return byId;
  const matches = members.filter(member => member.name === value || member.previousNames?.includes(value));
  return matches.length === 1 ? matches[0] : undefined;
}

function isTaskDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function taskCreatorId(task, members) {
  return task.assignedById || findTaskMember(members, task.assignedBy)?.id;
}

export async function deleteTask(householdId, taskId, user, members) {
  const ref = doc(db, "households", householdId, "tasks", taskId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const task = snapshot.data();
    if (taskCreatorId(task, members) !== user.uid && task.completed !== true && task.status !== "completed") {
      throw new Error("Only the creator can delete an unfinished task.");
    }
    transaction.delete(ref);
  });
}

export async function editCreatedTask(householdId, taskId, user, members, { title, details, date, time, memberIds }) {
  const changes = {};
  if (title !== undefined) {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 100) throw new Error("Enter a task name between 1 and 100 characters.");
    changes.title = trimmed;
  }
  if (details !== undefined) {
    if (details.length > 1000) throw new Error("Enter no more than 1,000 characters for the details.");
    changes.details = changes.description = details.trim();
  }
  if (date && !isTaskDate(date)) throw new Error("Choose a valid due date.");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid due time.");
  if (date !== undefined) changes.date = changes.dueDate = date;
  if (time !== undefined) changes.time = changes.dueTime = time;

  const assignees = memberIds && members.filter(member => memberIds.includes(member.id));
  if (assignees && (!assignees.length || assignees.length !== memberIds.length)) {
    throw new Error("Choose at least one current household member.");
  }

  const ref = doc(db, "households", householdId, "tasks", taskId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This task no longer exists.");
    const task = snapshot.data();
    if (taskCreatorId(task, members) !== user.uid) throw new Error("Only the creator can edit this task.");

    const update = { ...changes };
    if (assignees && (task.memberIds?.length !== assignees.length ||
        assignees.some(member => !task.memberIds.includes(member.id)))) {
      update.memberIds = assignees.map(member => member.id);
      update.assignedTo = assignees.map(member => member.name).join(", ");
      update.status = "requested";
      update.completed = false;
    }
    if (Object.keys(update).length) transaction.update(ref, update);
  });
}

// Record the response and task change atomically. The original assigner gets
// the response through the same task subscription used by the existing pages.
export async function respondToTask(householdId, taskId, user, members, response) {
  const reason = typeof response.reason === "string" ? response.reason.trim() : "";
  if (!["accepted", "rejected", "rescheduled"].includes(response.action)) throw new Error("Choose a valid task response.");
  if (reason.length > 1000 || (!reason && response.action !== "accepted")) {
    throw new Error("Enter an explanation between 1 and 1000 characters.");
  }
  if (response.action === "rescheduled") {
    if (!isTaskDate(response.date || "")) {
      throw new Error("Choose a valid new due date.");
    }
    if (response.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(response.time)) throw new Error("Choose a valid new due time.");
  }
  const responseId = crypto.randomUUID();
  return runTransaction(db, async transaction => {
    const ref = doc(db, "households", householdId, "tasks", taskId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This task no longer exists.");
    const task = snapshot.data();
    if (task.completed || (task.status && task.status !== "requested")) {
      throw new Error("This task has already been answered. Reload to see its current status.");
    }
    const memberFor = value => findTaskMember(members, value);
    const assignedNames = Array.isArray(task.assignedTo) ? task.assignedTo : String(task.assignedTo || "").split(",").map(name => name.trim());
    const assigned = task.memberIds?.length ? task.memberIds.includes(user.uid)
      : assignedNames.includes("Household") || memberFor(task.assignedTo)?.id === user.uid || assignedNames.some(name => memberFor(name)?.id === user.uid);
    if (!assigned) throw new Error("Only a person assigned this task can respond to it.");
    const recipientId = taskCreatorId(task, members);
    if (!recipientId) throw new Error("The person who assigned this task could not be identified. Ask them to assign it again.");
    const recipient = await transaction.get(doc(db, "users", recipientId));
    if (!recipient.exists() || recipient.data().householdId !== householdId) {
      throw new Error("The person who assigned this task is no longer in your household.");
    }
    const previousDate = String(task.date || task.dueDate || "");
    const previousTime = String(task.time || task.dueTime || "");
    if (response.action === "rescheduled" && response.date === previousDate && (response.time || "") === previousTime) {
      throw new Error("Choose a different date or time to reschedule this task.");
    }
    const note = {
      action: response.action, reason, senderId: user.uid, recipientId,
      createdAt: serverTimestamp(), previousDate, previousTime,
      date: response.action === "rescheduled" ? response.date : previousDate,
      time: response.action === "rescheduled" ? response.time || "" : previousTime
    };
    const changes = response.action === "rejected"
      ? { status: "rejected", completed: false }
      : response.action === "accepted"
        ? { status: "accepted", completed: false }
        : { date: note.date, dueDate: note.date, time: note.time, dueTime: note.time };
    transaction.update(ref, {
      ...changes,
      assignedById: recipientId,
      [`responses.${responseId}`]: note
    });
    return { ...note, ...changes, responseId };
  });
}
