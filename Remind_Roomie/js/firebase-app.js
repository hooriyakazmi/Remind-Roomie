import { auth, db } from "./firebase-config.js";
import { createHouseholdCloud } from "./firebase-household.js";
import { offerLegacyImport } from "./legacy-import.js";
import { onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

function reportError(error) {
  console.error("Could not synchronize household data.", error);
  let notice = document.getElementById("appStatus");
  if (!notice) {
    notice = document.createElement("p");
    notice.id = "appStatus";
    notice.className = "app-status";
    notice.setAttribute("role", "alert");
    document.body.prepend(notice);
  }
  notice.textContent = error.code === "permission-denied"
    ? "Access to your household was denied. Check your household membership and the deployed Firestore rules for this Firebase project, then reload."
    : "Household data could not be synchronized. Check your connection and reload to retry.";
}

function stopCloud() {
  window.roomieCloud?.stop.forEach(unsubscribe => unsubscribe());
  window.roomieCloud = null;
}

document.getElementById("signOutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    reportError(error);
  }
});

// The existing renderers wait for authentication before reading household state.
window.roomieHouseholdReady = new Promise(resolve => {
  let generation = 0;
  onAuthStateChanged(auth, async user => {
    const currentGeneration = ++generation;
    stopCloud();
    if (!user) {
      resolve(null);
      window.location.replace("login.html");
      return;
    }
    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      if (currentGeneration !== generation) return;
      const profile = profileSnapshot.data();
      if (!profileSnapshot.exists() || typeof profile?.householdId !== "string" || !profile.householdId) {
        resolve(null);
        window.location.replace("login.html");
        return;
      }
      const householdSnapshot = await getDoc(doc(db, "households", profile.householdId));
      if (currentGeneration !== generation) return;
      if (!householdSnapshot.exists()) throw new Error("Your household could not be found.");

      const name = profile.displayName || user.displayName || "Roommate";
      if (user.displayName !== name) {
        updateProfile(user, { displayName: name }).catch(error => {
          console.warn("Could not synchronize the account display name.", error);
        });
      }
      const data = window.householdData;
      data.user = { name, initials: name.charAt(0).toUpperCase(), greeting: "Welcome back!" };
      data.family = [{ id: user.uid, name, role: "You", initials: data.user.initials }];
      data.tasks = [];
      data.calendar = { personal: [], housemates: [], shared: [] };
      window.roomieCloud = createHouseholdCloud(profile.householdId, user, reportError);
      document.getElementById("accountName").textContent = name;
      offerLegacyImport(window.roomieCloud);
      resolve(window.roomieCloud);
    } catch (error) {
      if (currentGeneration !== generation) return;
      reportError(error);
      resolve(null);
    }
  }, error => {
    stopCloud();
    reportError(error);
    resolve(null);
  });
});

window.addEventListener("pagehide", event => {
  if (!event.persisted) stopCloud();
});
