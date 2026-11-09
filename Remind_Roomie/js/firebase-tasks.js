
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// Add task metadata while preserving the original helper's simple arguments.
export async function addTask(householdId, title, assignedTo, dueDate, details = {}) {
  const task = await addDoc(
    collection(db, "households", householdId, "tasks"),
    {
      title,
      assignedTo,
      dueDate,
      ...details,
      completed: false,
      status: details.status || "requested",
      createdAt: serverTimestamp()
    }
  );
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
