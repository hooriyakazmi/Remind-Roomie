import { auth, db } from "./firebase-config.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { addTask, listenToTasks, updateTask, respondToTask } from "./firebase-tasks.js";

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

// Firestore is the app's source of truth. Keep former names for records created
// before account IDs were stored, without rewriting anyone else's shared events.
export async function updateMyProfile(user, changes) {
  const next = { ...changes };
  if (Object.hasOwn(next, "displayName")) {
    if (typeof next.displayName !== "string" || !next.displayName.trim() || next.displayName.trim().length > 60) {
      throw new Error("Enter a name between 1 and 60 characters.");
    }
    next.displayName = next.displayName.trim();
    await runTransaction(db, async transaction => {
      const ref = doc(db, "users", user.uid);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Your account profile could not be found.");
      const profile = snapshot.data();
      const update = { ...next };
      if (profile.displayName !== next.displayName) {
        update.previousNames = [...(profile.previousNames || []), profile.displayName];
      }
      transaction.update(ref, update);
    });
    // A separate Auth failure must not undo or misreport a saved Firestore name.
    try {
      await updateProfile(user, { displayName: next.displayName });
    } catch (error) {
      console.warn("Name saved; Firebase Auth profile will synchronize on the next page load.", error);
    }
  } else {
    await updateDoc(doc(db, "users", user.uid), next);
  }
}

// Each member's color: their saved color, or a default from the palette. Members without
// a saved color are handled in account-ID order, so each gets a color nobody else has.
// Every page computes the same result, so two people never share a color.
function resolveColors(members) {
  const palette = window.householdData?.colorPalette || [];
  const taken = new Set(members.map(member => member.color).filter(Boolean));
  const resolved = new Map(members.map(member => [member.id, member.color || ""]));

  [...members]
    .filter(member => !member.color)
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach(member => {
      const pick = palette.find(item => !taken.has(item.color));
      if (!pick) return;
      resolved.set(member.id, pick.color);
      taken.add(pick.color);
    });

  return resolved;
}

// Save the default for the signed-in user once, if they don't have a color yet.
function assignDefaultColor(members, user) {
  const me = members.find(member => member.id === user.uid);
  if (!me || me.color) return;

  const color = resolveColors(members).get(user.uid);
  if (!color) return;

  updateDoc(doc(db, "users", user.uid), { color }).catch(error => {
    console.error("Could not assign a default color.", error);
  });
}

// Share only member profiles with people whose profile already belongs to this household.
export function listenToHouseholdMembers(householdId, callback, onError) {
  const membersQuery = query(
    collection(db, "users"),
    where("householdId", "==", householdId)
  );
  return onSnapshot(membersQuery, snapshot => {
    callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id })), snapshot.metadata?.fromCache);
  }, onError);
}

// All household calendar writes stay inside the authenticated household's Firestore path.
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
    addTask(householdId, title, assignedTo, dueDate, { ...details, assignedById: user.uid });
  cloud.updateTask = (taskId, changes) => updateTask(householdId, taskId, changes);
  cloud.respondToTask = (taskId, response) => respondToTask(householdId, taskId, user, cloud.members, response);
  cloud.addEvent = event => addHouseholdEvent(householdId, event);
  cloud.updateEvent = (eventId, changes) => updateHouseholdEvent(householdId, eventId, changes);
  cloud.deleteEvent = eventId => deleteHouseholdEvent(householdId, eventId);
  cloud.updateProfile = changes => updateMyProfile(user, changes);

  // Resolves with the first member list, so pages don't draw before colors are known
  cloud.membersReady = new Promise(resolve => {
    cloud.markMembersReady = resolve;
  });
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
        kind: event.scope === "personal" ? "personal" : "family",
        owner: event.createdBy || event.addedBy
      }));
      window.dispatchEvent(new CustomEvent("roomie:events-updated"));
    }, onError),
    listenToHouseholdMembers(householdId, (members, fromCache) => {
      // Cached data can be missing other people's colors, so only assign from server data
      if (!fromCache) assignDefaultColor(members, user);
      const palette = window.householdData?.colorPalette || [];
      const colors = resolveColors(members);
      cloud.members = members.map(member => {
        const name = member.displayName || "Roommate";
        const color = colors.get(member.id);
        return {
          id: member.id,
          name,
          previousNames: member.previousNames || [],
          role: member.id === user.uid ? "You" : "Roommate",
          initials: name.charAt(0).toUpperCase(),
          color,
          secondary: palette.find(item => item.color === color)?.secondary || ""
        };
      });
      cloud.markMembersReady();
      window.householdData.family = cloud.members;
      const me = cloud.members.find(member => member.id === user.uid);
      if (me) {
        window.householdData.user = {
          ...window.householdData.user,
          name: me.name,
          initials: me.initials
        };
      }
      window.dispatchEvent(new CustomEvent("roomie:members-updated"));
    }, error => {
      // Release waiting pages even if the member list fails, so they can show the error
      cloud.markMembersReady();
      onError(error);
    })
  ];
  return cloud;
}
