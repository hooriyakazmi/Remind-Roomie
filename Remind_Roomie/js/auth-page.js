import { auth, db } from "./firebase-config.js";
import { createHousehold, joinHousehold, signUp } from "./firebase-household.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// Share one error surface across login, registration, and household onboarding.
document.addEventListener("DOMContentLoaded", () => {
  const authForms = document.getElementById("authForms");
  const householdSetup = document.getElementById("householdSetup");
  const message = document.getElementById("authMessage");
  const displayName = document.getElementById("displayName");
  let currentUser = null;
  let profileLoadUid = null;
  let profileLoad = null;
  let creatingAccount = false;

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
  }

  function continueAfterAuthentication(user) {
    if (profileLoadUid === user.uid && profileLoad) {
      return profileLoad;
    }

    profileLoadUid = user.uid;
    currentUser = user;
    profileLoad = (async () => {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      // Recover when Auth succeeded but the initial Firestore profile write failed.
      if (!profileSnapshot.exists()) {
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          displayName: user.displayName || user.email.split("@")[0],
          householdId: null
        });
      }
      const profile = profileSnapshot.data() || { displayName: user.displayName || user.email.split("@")[0] };
      if (profile.householdId) {
        window.location.replace("index.html");
        return;
      }

      authForms.hidden = true;
      householdSetup.hidden = false;
      document.getElementById("signedInName").textContent = profile.displayName;
    })();
    profileLoad = profileLoad.catch(error => {
      profileLoadUid = null;
      profileLoad = null;
      throw error;
    });
    return profileLoad;
  }

  onAuthStateChanged(auth, user => {
    if (user && !creatingAccount) {
      continueAfterAuthentication(user).catch(error => showMessage(error.message));
    } else if (!user) {
      profileLoadUid = null;
      profileLoad = null;
      currentUser = null;
      householdSetup.hidden = true;
      authForms.hidden = false;
    }
  }, error => showMessage(error.message));

  document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    message.hidden = true;
    try {
      const email = document.getElementById("loginEmail").value.trim().toLowerCase();
      const password = document.getElementById("loginPassword").value;
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await continueAfterAuthentication(credential.user);
    } catch (error) {
      showMessage(error.message);
    }
  });

  document.getElementById("signupForm").addEventListener("submit", async event => {
    event.preventDefault();
    message.hidden = true;
    try {
      const name = displayName.value.trim();
      const email = document.getElementById("signupEmail").value.trim().toLowerCase();
      const password = document.getElementById("signupPassword").value;
      if (!name) throw new Error("Enter your name.");
      creatingAccount = true;
      currentUser = await signUp(email, password, name);
      creatingAccount = false;
      await continueAfterAuthentication(currentUser);
    } catch (error) {
      creatingAccount = false;
      showMessage(error.message);
    }
  });

  document.getElementById("showSignup").addEventListener("click", () => {
    document.getElementById("loginForm").hidden = true;
    document.getElementById("signupForm").hidden = false;
    document.getElementById("showSignup").hidden = true;
    document.getElementById("showLogin").hidden = false;
    displayName.focus();
  });

  document.getElementById("showLogin").addEventListener("click", () => {
    document.getElementById("signupForm").hidden = true;
    document.getElementById("loginForm").hidden = false;
    document.getElementById("showLogin").hidden = true;
    document.getElementById("showSignup").hidden = false;
    document.getElementById("loginEmail").focus();
  });

  

  document.getElementById("createHouseholdForm").addEventListener("submit", async event => {
    event.preventDefault();
    message.hidden = true;
    try {
      await createHousehold(currentUser, document.getElementById("householdName").value.trim());
      window.location.replace("index.html");
    } catch (error) {
      showMessage(error.message);
    }
  });

  const invitationPopup = document.getElementById("invitationPopup");
  const invitationCode = document.getElementById("invitationCode");

  document.getElementById("openInvitationPopup").addEventListener("click", () => {
    invitationPopup.hidden = false;
    invitationCode.focus();
  });

  document.getElementById("closeInvitationPopup").addEventListener("click", () => {
    invitationPopup.hidden = true;
  });

  document.getElementById("confirmInvitationCode").addEventListener("click", () => {
    if (!invitationCode.value.trim()) {
      invitationCode.focus();
      return;
    }

    invitationPopup.hidden = true;
  });

  invitationPopup.addEventListener("click", event => {
    if (event.target === invitationPopup) {
      invitationPopup.hidden = true;
    }
  });

  document.getElementById("joinHouseholdForm").addEventListener("submit", async event => {
    event.preventDefault();
    message.hidden = true;
    try {
      const householdId = document.getElementById("joinHouseholdId").value.trim();
      const code = document.getElementById("invitationCode").value.trim();
      if (!code) {
        invitationPopup.hidden = false;
        invitationCode.focus();
        return;
      }
      await joinHousehold(householdId, code, currentUser);
      window.location.replace("index.html");
    } catch (error) {
      showMessage(error.message);
    }
  });

  document.getElementById("authSignOut").addEventListener("click", async () => {
    try {
      await signOut(auth);
      householdSetup.hidden = true;
      authForms.hidden = false;
    } catch (error) {
      showMessage(error.message);
    }
  });
});
