import { auth, db } from "./firebase-config.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { addTask, listenToTasks, updateTask } from "./firebase-tasks.js";

// Create the required profile only after Firebase Authentication creates the account.
export async function signUp(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await setDoc(doc(db, "users", credential.user.uid), {
    email: credential.user.email,
    displayName,
    householdId: null
  });
  return credential.user;
}

// Create a household and attach its creator in a single rules-checked batch.
export async function createHousehold(user, name) {
  if (!name.trim()) throw new Error("Enter a household name.");
  const householdRef = doc(collection(db, "households"));
  const batch = writeBatch(db);
  batch.set(householdRef, {
    name,
    createdBy: user.uid,
    createdAt: serverTimestamp()
  });
  batch.update(doc(db, "users", user.uid), { householdId: householdRef.id });
  await batch.commit();
  return householdRef.id;
}

// Invitations are high-entropy, email-bound, and redeemable once by Firestore rules.
export async function createHouseholdInvitation(householdId, invitedEmail) {
  const email = invitedEmail.trim().toLowerCase();
  const code = crypto.randomUUID().replaceAll("-", "").toUpperCase();
  await setDoc(doc(db, "households", householdId, "invitations", code), {
    householdId,
    email,
    status: "pending",
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp()
  });
  return code;
}

// Redeem a household-scoped code without exposing invitation listings to other users.
export async function joinHousehold(householdId, code, user) {
  const normalizedCode = code.trim().toUpperCase();
  const invitationRef = doc(db, "households", householdId, "invitations", normalizedCode);
  const invitationSnapshot = await getDoc(invitationRef);
  if (!invitationSnapshot.exists() || invitationSnapshot.data().email !== user.email?.toLowerCase()) {
    throw new Error("That invitation is invalid or was issued to a different email address.");
  }

  const batch = writeBatch(db);
  batch.update(invitationRef, {
    status: "accepted",
    acceptedBy: user.uid,
    acceptedAt: serverTimestamp()
  });
  batch.update(doc(db, "users", user.uid), {
    householdId,
    invitationId: normalizedCode
  });
  await batch.commit();
}

// Share only member profiles with people whose profile already belongs to this household.
export function listenToHouseholdMembers(householdId, callback, onError) {
  const membersQuery = query(
    collection(db, "users"),
    where("householdId", "==", householdId)
  );
  return onSnapshot(membersQuery, snapshot => {
    callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
  }, onError);
}

// All shared calendar writes stay inside the authenticated household's Firestore path.
export function listenToEvents(householdId, callback, onError) {
  return onSnapshot(
    collection(db, "households", householdId, "events"),
    snapshot => callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id, _remote: true }))),
    onError
  );
}

export async function addHouseholdEvent(householdId, event) {
  const eventRef = doc(collection(db, "households", householdId, "events"));
  const { id, ...eventData } = event;
  await setDoc(eventRef, {
    ...eventData,
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp()
  });
  return eventRef.id;
}

export async function updateHouseholdEvent(householdId, eventId, changes) {
  await updateDoc(doc(db, "households", householdId, "events", eventId), changes);
}

export async function deleteHouseholdEvent(householdId, eventId) {
  await deleteDoc(doc(db, "households", householdId, "events", eventId));
}

// Provide the existing pages a small integration surface instead of replacing their renderers.
export function createHouseholdCloud(householdId, user, onError) {
  const cloud = { householdId, user, tasks: [], events: [], members: [], reportError: onError };
  cloud.createInvitation = email => createHouseholdInvitation(householdId, email);
  cloud.addTask = (title, assignedTo, dueDate, details) =>
    addTask(householdId, title, assignedTo, dueDate, details);
  cloud.updateTask = (taskId, changes) => updateTask(householdId, taskId, changes);
  cloud.addEvent = event => addHouseholdEvent(householdId, event);
  cloud.updateEvent = (eventId, changes) => updateHouseholdEvent(householdId, eventId, changes);
  cloud.deleteEvent = eventId => deleteHouseholdEvent(householdId, eventId);
  cloud.stop = [
    listenToTasks(householdId, tasks => {
      cloud.tasks = tasks.map(task => ({
        ...task,
        _remote: true,
        status: task.status || (task.completed ? "completed" : "requested")
      }));
      window.householdData.tasks = cloud.tasks;
      window.dispatchEvent(new CustomEvent("roomie:tasks-updated"));
    }, onError),
    listenToEvents(householdId, events => {
      cloud.events = events;
      window.householdData.calendar.shared = events.map(event => ({
        ...event,
        kind: "family",
        owner: event.addedBy
      }));
      window.dispatchEvent(new CustomEvent("roomie:events-updated"));
    }, onError),
    listenToHouseholdMembers(householdId, members => {
      cloud.members = members.map(member => ({
        id: member.id,
        name: member.displayName || "Roommate",
        role: member.id === user.uid ? "You" : "Roommate",
        initials: (member.displayName || "Roommate").charAt(0).toUpperCase()
      }));
      window.householdData.family = cloud.members;
      window.dispatchEvent(new CustomEvent("roomie:members-updated"));
    }, onError)
  ];
  return cloud;
}
