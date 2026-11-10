const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, writeBatch, serverTimestamp, Timestamp, setLogLevel, deleteField, onSnapshot
} = require('firebase/firestore');

// Refuse to run against production. The CLI supplies this only inside emulators:exec.
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run npm run test:rules to start the local emulator.');
const projectId = 'demo-remind-roomie';
let env;
const email = uid => `${uid}@example.com`;
const client = uid => uid ? env.authenticatedContext(uid, { email: email(uid) }).firestore() : env.unauthenticatedContext().firestore();
const profile = (uid, householdId = null) => ({ email: email(uid), displayName: uid, householdId });
const household = uid => ({ name: 'Our home', createdBy: uid, createdAt: serverTimestamp() });
const invite = (uid = 'bob', overrides = {}) => ({ householdId: 'home', email: email(uid), status: 'pending', createdBy: 'alice', createdAt: serverTimestamp(), ...overrides });
const invitationRef = (db, code = 'CODE', home = 'home') => doc(db, 'households', home, 'invitations', code);
const taskRef = (db, home = 'home', id = 'task') => doc(db, 'households', home, 'tasks', id);
const eventRef = (db, home = 'home', id = 'event') => doc(db, 'households', home, 'events', id);
const event = () => ({ title: 'Dinner', date: '2026-11-12', time: '18:00', endTime: '19:00', location: '', description: '', addedBy: 'alice', attendees: ['alice', 'bob'], scope: 'shared', createdBy: 'alice', createdAt: serverTimestamp() });
const task = () => ({ title: 'Trash', assignedTo: 'bob', memberIds: ['bob'], assignedBy: 'alice', dueDate: '2026-11-12', date: '2026-11-12', time: '10:00', completed: false, status: 'requested', createdAt: serverTimestamp() });

async function seed(entries) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const [key, data] of Object.entries(entries)) batch.set(doc(db, key), data);
    await batch.commit();
  });
}
async function createInvite(code = 'CODE') {
  await setDoc(invitationRef(client('alice'), code), invite());
}
function join(db, { code = 'CODE', home = 'home', uid = 'bob', invitationChanges = {}, profileChanges = {} } = {}) {
  const batch = writeBatch(db);
  batch.update(invitationRef(db, code, home), { status: 'accepted', acceptedBy: uid, acceptedAt: serverTimestamp(), ...invitationChanges });
  batch.update(doc(db, 'users', uid), { householdId: home, invitationId: code, ...profileChanges });
  return batch.commit();
}

before(async () => {
  setLogLevel('silent'); // Expected denials are asserted below.
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port), rules: fs.readFileSync(path.resolve(__dirname, '../Remind_Roomie/firestore.rules'), 'utf8') }
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed({
    'users/alice': profile('alice', 'home'),
    'users/bob': profile('bob'),
    'users/eve': profile('eve', 'other'),
    'households/home': household('alice'),
    'households/other': household('eve')
  });
});
after(async () => { if (env) await env.cleanup(); });

test('signup and missing-profile recovery allow only an unassigned self profile', async () => {
  const db = client('new');
  await assertSucceeds(setDoc(doc(db, 'users/new'), profile('new')));
  await assertFails(setDoc(doc(db, 'users/forged'), profile('forged')));
  await assertFails(setDoc(doc(client('bad'), 'users/bad'), profile('bad', 'home')));
  await assertFails(setDoc(doc(client('bad'), 'users/bad'), { ...profile('bad'), invitationId: 'CODE' }));
  await assertFails(setDoc(doc(client('bad'), 'users/bad'), { ...profile('bad'), email: email('alice') }));
  await assertFails(setDoc(doc(client('bad'), 'users/bad'), { ...profile('bad'), displayName: '' }));
  await assertFails(setDoc(doc(client('bad'), 'users/bad'), { ...profile('bad'), role: 'admin' }));
  await assertFails(setDoc(doc(client(), 'users/anonymous'), profile('anonymous')));
});

test('household creation matches the app batch and permits subsequent profile edits', async () => {
  const db = client('bob');
  const batch = writeBatch(db);
  batch.set(doc(db, 'households/new-home'), household('bob'));
  batch.update(doc(db, 'users/bob'), { householdId: 'new-home' });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db, 'households/new-home')));
  await assertSucceeds(updateDoc(doc(db, 'users/bob'), { displayName: 'Bobby' }));
  await assertFails(updateDoc(doc(db, 'users/bob'), { householdId: 'home' }));
  await assertFails(updateDoc(doc(db, 'users/bob'), { householdId: null }));
  await assertFails(updateDoc(doc(db, 'users/bob'), { invitationId: 'made-up' }));
  await assertFails(updateDoc(doc(db, 'users/bob'), { email: email('eve') }));
  await assertFails(deleteDoc(doc(db, 'users/bob')));
});

test('household and creator membership cannot be written separately or forged', async () => {
  const db = client('bob');
  await assertFails(setDoc(doc(db, 'households/orphan'), household('bob')));
  await assertFails(updateDoc(doc(db, 'users/bob'), { householdId: 'missing' }));
  const badCreator = writeBatch(db);
  badCreator.set(doc(db, 'households/forged'), household('alice'));
  badCreator.update(doc(db, 'users/bob'), { householdId: 'forged' });
  await assertFails(badCreator.commit());
  const emptyName = writeBatch(db);
  emptyName.set(doc(db, 'households/empty'), { ...household('bob'), name: '' });
  emptyName.update(doc(db, 'users/bob'), { householdId: 'empty' });
  await assertFails(emptyName.commit());
  const extraFields = writeBatch(db);
  extraFields.set(doc(db, 'households/extra'), { ...household('bob'), members: ['eve'] });
  extraFields.update(doc(db, 'users/bob'), { householdId: 'extra' });
  await assertFails(extraFields.commit());
  const assignedDb = client('alice');
  const alreadyAssigned = writeBatch(assignedDb);
  alreadyAssigned.set(doc(assignedDb, 'households/second'), household('alice'));
  alreadyAssigned.update(doc(assignedDb, 'users/alice'), { householdId: 'second' });
  await assertFails(alreadyAssigned.commit());
  await assertFails(setDoc(doc(client('missing'), 'households/no-profile'), household('missing')));
});

test('existing creator-owned household is not a membership bypass', async () => {
  await seed({ 'households/orphan': household('bob') });
  await assertFails(updateDoc(doc(client('bob'), 'users/bob'), { householdId: 'orphan' }));
});

test('household members can create/read invitations; nonmembers cannot create or enumerate them', async () => {
  await assertSucceeds(setDoc(invitationRef(client('alice')), invite()));
  await assertSucceeds(getDoc(invitationRef(client('bob'))));
  await assertSucceeds(getDocs(collection(client('alice'), 'households/home/invitations')));
  await assertFails(getDoc(invitationRef(client('eve'))));
  await assertFails(getDoc(invitationRef(client())));
  await assertFails(getDocs(collection(client('bob'), 'households/home/invitations')));
  await assertFails(setDoc(invitationRef(client('bob'), 'FORGED'), invite()));
  await assertFails(setDoc(invitationRef(client('eve'), 'FORGED'), invite('eve', { createdBy: 'eve' })));
  await assertFails(setDoc(invitationRef(client(), 'FORGED'), invite()));
});

test('invitation creation rejects forged fields and pre-accepted invitations', async () => {
  const db = client('alice');
  for (const overrides of [
    { householdId: 'other' }, { createdBy: 'eve' }, { email: '' },
    { status: 'accepted' }, { acceptedBy: 'bob' }, { acceptedAt: serverTimestamp() },
    { createdAt: Timestamp.fromMillis(0) }, { unexpected: true }
  ]) await assertFails(setDoc(invitationRef(db), invite('bob', overrides)));
});

test('valid invitation and profile transition succeed atomically, then cannot be reused', async () => {
  await createInvite();
  const db = client('bob');
  await assertSucceeds(join(db));
  assert.equal((await getDoc(doc(db, 'users/bob'))).data().householdId, 'home');
  assert.equal((await getDoc(invitationRef(db))).data().status, 'accepted');
  await assertSucceeds(getDoc(doc(db, 'households/home')));
  await assertSucceeds(getDoc(doc(db, 'users/alice')));
  assert.equal((await getDocs(query(collection(db, 'users'), where('householdId', '==', 'home')))).size, 2);
  await assertSucceeds(updateDoc(doc(db, 'users/bob'), { displayName: 'Bobby' }));
  await assertFails(join(db));
  await assertFails(updateDoc(doc(db, 'users/bob'), { invitationId: 'OTHER' }));
  await assertFails(updateDoc(doc(db, 'users/bob'), { householdId: 'other' }));
});

test('membership without invitation or with a missing, pending, wrong-email or wrong-household invitation fails', async () => {
  const db = client('bob');
  await createInvite();
  await assertFails(updateDoc(doc(db, 'users/bob'), { householdId: 'home' }));
  await assertFails(updateDoc(doc(db, 'users/bob'), { householdId: 'home', invitationId: 'MISSING' }));
  await assertFails(updateDoc(doc(db, 'users/bob'), { householdId: 'home', invitationId: 'CODE' }));
  await assertFails(join(db, { code: 'MISSING' }));
  await seed({ 'users/mallory': profile('mallory') });
  await assertFails(join(client('mallory'), { uid: 'mallory' }));
  const wrongHousehold = writeBatch(db);
  wrongHousehold.update(invitationRef(db), { status: 'accepted', acceptedBy: 'bob', acceptedAt: serverTimestamp() });
  wrongHousehold.update(doc(db, 'users/bob'), { householdId: 'other', invitationId: 'CODE' });
  await assertFails(wrongHousehold.commit());
  await seed({ 'households/home/invitations/MISMATCH': invite('bob', { householdId: 'other' }) });
  await assertFails(join(db, { code: 'MISMATCH' }));
});

test('acceptance cannot consume an invitation without the matching profile update', async () => {
  await createInvite();
  const db = client('bob');
  await assertFails(updateDoc(invitationRef(db), { status: 'accepted', acceptedBy: 'bob', acceptedAt: serverTimestamp() }));
  const mismatchedCode = writeBatch(db);
  mismatchedCode.update(invitationRef(db), { status: 'accepted', acceptedBy: 'bob', acceptedAt: serverTimestamp() });
  mismatchedCode.update(doc(db, 'users/bob'), { householdId: 'home', invitationId: 'OTHER' });
  await assertFails(mismatchedCode.commit());
  assert.equal((await getDoc(invitationRef(db))).data().status, 'pending');
  assert.equal((await getDoc(doc(db, 'users/bob'))).data().householdId, null);
});

test('accepted invitations cannot grant membership later, including stale invitations for this UID', async () => {
  await seed({ 'households/home/invitations/OLD': { ...invite(), status: 'accepted', acceptedBy: 'bob', acceptedAt: Timestamp.now() } });
  await assertFails(updateDoc(doc(client('bob'), 'users/bob'), { householdId: 'home', invitationId: 'OLD' }));
  await assertFails(join(client('bob'), { code: 'OLD' }));
});

test('acceptance freezes every invitation field except status, acceptedBy and acceptedAt', async () => {
  await createInvite();
  const db = client('bob');
  for (const invitationChanges of [
    { email: email('eve') }, { householdId: 'other' }, { createdBy: 'bob' },
    { createdAt: Timestamp.fromMillis(0) }, { unexpected: true },
    { email: deleteField() }, { createdBy: deleteField() }, { acceptedAt: deleteField() },
    { acceptedBy: 'eve' }, { acceptedAt: Timestamp.fromMillis(0) }, { status: 'pending' }
  ]) await assertFails(join(db, { invitationChanges }));
  await assertSucceeds(join(db));
});

test('an already assigned user cannot consume a new invitation or switch households', async () => {
  await setDoc(invitationRef(client('alice')), invite('eve'));
  await assertFails(join(client('eve'), { uid: 'eve' }));
  const ref = invitationRef(client('alice'));
  assert.equal((await getDoc(ref)).data().status, 'pending');
  await assertSucceeds(deleteDoc(ref)); // Household members can revoke invitations.
  await createInvite();
  await assertFails(deleteDoc(invitationRef(client('bob'))));
});

test('profiles and household member queries are restricted to self or current household', async () => {
  const db = client('alice');
  await assertSucceeds(getDoc(doc(db, 'users/alice')));
  await assertSucceeds(getDocs(query(collection(db, 'users'), where('householdId', '==', 'home'))));
  await assertFails(getDoc(doc(db, 'users/bob')));
  await assertFails(getDoc(doc(db, 'users/eve')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(getDocs(query(collection(db, 'users'), where('householdId', '==', 'other'))));
  await assertFails(updateDoc(doc(client('eve'), 'users/alice'), { householdId: 'other' }));
  await assertFails(getDoc(doc(client(), 'users/alice')));
  await assertFails(getDoc(doc(client('bob'), 'households/home')));
  await assertFails(getDocs(collection(db, 'households')));
  await assertFails(updateDoc(doc(db, 'households/home'), { createdBy: 'eve' }));
});

test('task CRUD, queries, acceptance, rejection, scheduling, and completion match firebase-tasks.js', async () => {
  const db = client('alice');
  await assertSucceeds(setDoc(taskRef(db), task()));
  await createInvite();
  await join(client('bob'));
  const roommate = client('bob');
  await assertSucceeds(getDoc(taskRef(roommate)));
  await assertSucceeds(getDocs(collection(roommate, 'households/home/tasks')));
  for (const changes of [
    { status: 'accepted', completed: false }, { date: '2026-11-14', time: '11:00' },
    { status: 'rejected' }, { status: 'completed', completed: true }, { status: 'accepted', completed: false }
  ]) await assertSucceeds(updateDoc(taskRef(roommate), changes));
  await assertSucceeds(deleteDoc(taskRef(roommate)));
});

test('anonymous, unassigned, and unrelated users cannot read, query or write household tasks/events', async () => {
  const alice = client('alice');
  await setDoc(taskRef(alice), task());
  await setDoc(eventRef(alice), event());
  for (const uid of [null, 'bob', 'eve', 'missing']) {
    const db = client(uid);
    for (const ref of [taskRef(db), eventRef(db)]) {
      await assertFails(getDoc(ref));
      await assertFails(updateDoc(ref, { title: 'Attack' }));
      await assertFails(deleteDoc(ref));
    }
    await assertFails(setDoc(taskRef(db, 'home', 'injected'), task()));
    await assertFails(setDoc(eventRef(db, 'home', 'injected'), { ...event(), createdBy: uid || 'anonymous' }));
    await assertFails(getDocs(collection(db, 'households/home/tasks')));
    await assertFails(getDocs(collection(db, 'households/home/events')));
  }
  await assertFails(setDoc(taskRef(alice, 'other'), task()));
  await assertFails(setDoc(eventRef(alice, 'other'), event()));
});

test('same-batch forged membership cannot unlock household tasks or events', async () => {
  const db = client('bob');
  const batch = writeBatch(db);
  batch.update(doc(db, 'users/bob'), { householdId: 'home' });
  batch.set(taskRef(db), task());
  batch.set(eventRef(db), { ...event(), createdBy: 'bob' });
  await assertFails(batch.commit());
});

test('shared event CRUD and queries preserve creator-only editing and deletion', async () => {
  const db = client('alice');
  await assertSucceeds(setDoc(eventRef(db), event()));
  await createInvite();
  await join(client('bob'));
  await assertSucceeds(getDoc(eventRef(client('bob'))));
  await assertSucceeds(getDocs(collection(client('bob'), 'households/home/events')));
  await assertFails(updateDoc(eventRef(client('bob')), { title: 'Not mine' }));
  await assertFails(deleteDoc(eventRef(client('bob'))));
  await assertFails(setDoc(eventRef(client('bob'), 'home', 'forged'), event()));
  await assertFails(updateDoc(eventRef(db), { createdBy: 'bob' }));
  await assertSucceeds(updateDoc(eventRef(db), { title: 'New dinner', date: '2026-11-14', time: '19:00', endTime: '20:00', location: 'Kitchen', description: 'Bring food' }));
  await assertSucceeds(deleteDoc(eventRef(db)));
});

test('legacy import batch matches legacy-import.js and markers cannot be overwritten or accessed by others', async () => {
  const db = client('alice');
  const marker = doc(db, 'users/alice/imports/home');
  await assertSucceeds(getDoc(marker)); // Importer checks for absence first.
  const batch = writeBatch(db);
  batch.set(taskRef(db, 'home', 'legacy-alice-0'), { title: 'Old task', assignedTo: 'Household', status: 'accepted', completed: false, createdAt: serverTimestamp() });
  batch.set(eventRef(db, 'home', 'legacy-alice-0'), event());
  batch.set(marker, { importedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(marker));
  await assertFails(setDoc(marker, { importedAt: serverTimestamp() }));
  await assertFails(deleteDoc(marker));
  await assertFails(getDoc(doc(client('eve'), 'users/alice/imports/home')));
  await assertFails(getDoc(doc(client(), 'users/alice/imports/home')));
  await assertFails(setDoc(doc(db, 'users/alice/imports/other'), { importedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(client('bob'), 'users/bob/imports/home'), { importedAt: serverTimestamp() }));
});

// Load the unchanged browser modules with the real emulator SDK. Only their
// Firebase configuration and Auth transport are supplied by the test harness.
async function actualHouseholdApi(db, user, entryFile = 'firebase-household.js') {
  const vm = require('node:vm');
  const root = path.resolve(__dirname, '../Remind_Roomie/js');
  // Use the main VM realm so Firebase's plain-object checks see app payloads
  // just as they do when the app and SDK run together in a browser.
  const modules = new Map();
  const synthetic = (id, values) => {
    const module = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { identifier: id });
    modules.set(id, module);
  };
  synthetic(path.join(root, 'firebase-config.js'), { db, auth: { currentUser: user } });
  synthetic('firestore', require('firebase/firestore'));
  synthetic('auth', {
    createUserWithEmailAndPassword() { throw new Error('Auth signup is outside these Firestore tests.'); },
    async updateProfile(user, changes) { Object.assign(user, changes); }
  });
  async function link(specifier, parent) {
    const id = specifier.startsWith('https:')
      ? (specifier.includes('firebase-auth') ? 'auth' : 'firestore')
      : path.resolve(path.dirname(parent.identifier), specifier);
    if (modules.has(id)) return modules.get(id);
    const module = new vm.SourceTextModule(fs.readFileSync(id, 'utf8'), { identifier: id });
    modules.set(id, module);
    await module.link(link);
    return module;
  }
  const module = await link('./' + entryFile, { identifier: path.join(root, '_test.js') });
  await module.evaluate();
  return module.namespace;
}

test('actual browser createHousehold, invitation, joinHousehold and member listener work with the emulator', async () => {
  const bob = { uid: 'bob', email: email('bob') };
  const bobDb = client('bob');
  const bobApi = await actualHouseholdApi(bobDb, bob);
  const householdId = await bobApi.createHousehold(bob, 'Actual app household');
  assert.equal((await getDoc(doc(bobDb, 'users/bob'))).data().householdId, householdId);
  const code = await bobApi.createHouseholdInvitation(householdId, ' CHARLIE@example.com ');
  const charlie = { uid: 'charlie', email: email('charlie') };
  const charlieDb = client('charlie');
  await setDoc(doc(charlieDb, 'users/charlie'), profile('charlie'));
  const charlieApi = await actualHouseholdApi(charlieDb, charlie);
  await charlieApi.joinHousehold(householdId, ` ${code.toLowerCase()} `, charlie);
  const joined = (await getDoc(doc(charlieDb, 'users/charlie'))).data();
  assert.equal(joined.householdId, householdId);
  assert.equal(joined.invitationId, code);
  const members = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { stop(); reject(new Error('Member snapshot timed out.')); }, 10000);
    const stop = charlieApi.listenToHouseholdMembers(householdId, rows => {
      // An initial cache snapshot may contain only Charlie's own profile.
      // Wait for the complete household snapshot from the emulator.
      if (rows.length !== 2) return;
      clearTimeout(timeout); stop(); resolve(rows);
    }, error => { clearTimeout(timeout); stop(); reject(error); });
  });
  assert.deepEqual(Array.from(members, member => member.id).sort(), ['bob', 'charlie']);
  await assertFails(charlieApi.joinHousehold(householdId, code, charlie));
  const outsiderApi = await actualHouseholdApi(client('eve'), { uid: 'eve', email: email('eve') });
  await assert.rejects(outsiderApi.joinHousehold(householdId, code, { uid: 'eve', email: email('eve') }));
});


test('actual name update preserves former names and membership; other members can read the new profile', async () => {
  const db = client('alice');
  const user = { uid: 'alice', email: email('alice'), displayName: 'alice' };
  const api = await actualHouseholdApi(db, user);
  await api.updateMyProfile(user, { displayName: '  Robin  ' });
  let saved = (await getDoc(doc(db, 'users/alice'))).data();
  assert.equal(saved.displayName, 'Robin');
  assert.deepEqual(saved.previousNames, ['alice']);
  assert.equal(saved.householdId, 'home');
  assert.equal(user.displayName, 'Robin');
  await api.updateMyProfile(user, { displayName: 'Sam' });
  await api.updateMyProfile(user, { color: '#90cdd8' });
  saved = (await getDoc(doc(db, 'users/alice'))).data();
  assert.deepEqual(saved.previousNames, ['alice', 'Robin']);
  assert.equal(saved.color, '#90cdd8');
  await createInvite();
  await join(client('bob'));
  const members = await getDocs(query(collection(client('bob'), 'users'), where('householdId', '==', 'home')));
  assert.equal(members.docs.find(member => member.id === 'alice').data().displayName, 'Sam');
});

test('name history rejects arbitrary additions and rewrites without weakening membership permissions', async () => {
  const db = client('alice');
  await assertFails(updateDoc(doc(db, 'users/alice'), { previousNames: ['eve'] }));
  await assertFails(updateDoc(doc(db, 'users/alice'), { displayName: 'Robin', previousNames: ['eve'] }));
  await assertFails(setDoc(doc(client('new'), 'users/new'), { ...profile('new'), previousNames: ['alice'] }));
  await assertSucceeds(updateDoc(doc(db, 'users/alice'), { displayName: 'Robin', previousNames: ['alice'] }));
  await assertFails(updateDoc(doc(db, 'users/alice'), { previousNames: [] }));
  await assertFails(updateDoc(doc(db, 'users/alice'), { displayName: 'Sam', previousNames: ['alice', 'Robin'], householdId: 'other' }));
  await assertFails(updateDoc(doc(client('eve'), 'users/alice'), { displayName: 'Taken', previousNames: ['alice', 'Robin'] }));
});

test('actual task responses deliver to the assigner and preserve rescheduling and rejection history', async () => {
  await seed({ 'users/bob': profile('bob', 'home') });
  const alice = client('alice');
  const bob = client('bob');
  await setDoc(taskRef(alice), { ...task(), assignedById: 'alice' });
  const api = await actualHouseholdApi(bob, { uid: 'bob' }, 'firebase-tasks.js');
  const members = [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }];
  let stop;
  let timeout;
  const received = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Task response was not delivered.')), 10000);
    stop = onSnapshot(taskRef(alice), snapshot => {
      const notes = Object.values(snapshot.data()?.responses || {});
      if (notes.length) resolve(notes[0]);
    }, reject);
  });
  try {
    await api.respondToTask('home', 'task', { uid: 'bob' }, members,
      { action: 'rescheduled', reason: 'Working late.', date: '2026-11-14', time: '14:00' });
    const delivered = await received;
    assert.equal(delivered.recipientId, 'alice');
    assert.equal(delivered.senderId, 'bob');
    assert.equal(delivered.reason, 'Working late.');
    assert.equal(typeof delivered.createdAt.toMillis(), 'number');
    await api.respondToTask('home', 'task', { uid: 'bob' }, members, { action: 'rejected', reason: 'I am away.' });
    const saved = (await getDoc(taskRef(alice))).data();
    assert.equal(saved.status, 'rejected');
    assert.equal(saved.date, '2026-11-14');
    assert.equal(Object.keys(saved.responses).length, 2);
    await assertFails(getDoc(taskRef(client('eve'))));
  } finally { clearTimeout(timeout); stop?.(); }
});

test('task response failures leave the task unchanged and unrelated users cannot send responses', async () => {
  await seed({ 'users/bob': profile('bob', 'home') });
  const alice = client('alice');
  await setDoc(taskRef(alice), { ...task(), assignedById: 'alice' });
  const api = await actualHouseholdApi(client('bob'), { uid: 'bob' }, 'firebase-tasks.js');
  const members = [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }];
  await assert.rejects(api.respondToTask('home', 'task', { uid: 'bob' }, members, { action: 'rejected', reason: '   ' }));
  const other = await actualHouseholdApi(client('eve'), { uid: 'eve' }, 'firebase-tasks.js');
  await assertFails(other.respondToTask('home', 'task', { uid: 'eve' }, members, { action: 'rejected', reason: 'No' }));
  const current = (await getDoc(taskRef(alice))).data();
  assert.equal(current.status, 'requested');
  assert.equal(current.responses, undefined);
});
