const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const jsRoot = path.resolve(__dirname, '../Remind_Roomie/js');

// Exercise the real adapters with an in-memory Firebase API. No live project writes.
async function loadModule(file, sdk, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  const cache = new Map();
  function synthetic(key, values) {
    const module = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context, identifier: key });
    cache.set(key, module);
    return module;
  }
  synthetic(path.join(jsRoot, 'firebase-config.js'), { db: {}, auth: { currentUser: { uid: 'alice' } } });
  synthetic('firestore', sdk);
  synthetic('auth', globals.authSdk || { createUserWithEmailAndPassword() {}, updateProfile() {} });
  async function resolve(id, parent) {
    const key = id.startsWith('https:') ? (id.includes('firebase-auth') ? 'auth' : 'firestore') : path.resolve(path.dirname(parent.identifier), id);
    if (cache.has(key)) return cache.get(key);
    const module = new vm.SourceTextModule(fs.readFileSync(key, 'utf8'), { context, identifier: key });
    cache.set(key, module);
    await module.link(resolve);
    return module;
  }
  const entry = await resolve('./' + file, { identifier: path.join(jsRoot, '_entry.js') });
  await entry.evaluate();
  return entry.namespace;
}

function mockFirestore() {
  const listeners = [];
  const writes = [];
  const stored = new Map();
  let stopped = 0;
  const sdk = {
    collection: (_db, ...parts) => parts.join('/'),
    doc: (_db, ...parts) => parts.join('/'),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    addDoc: async (ref, data) => { writes.push({ ref, data }); return { id: 'new-task' }; },
    updateDoc: async (ref, data) => { writes.push({ ref, data }); },
    setDoc: async (ref, data) => { stored.set(ref, data); },
    deleteDoc: async ref => { writes.push({ ref, deleted: true }); },
    getDoc: async ref => ({ exists: () => stored.has(ref), data: () => stored.get(ref) }),
    onSnapshot: (ref, next, error) => { listeners.push({ ref, next, error }); return () => stopped++; },
    query: ref => ref,
    where: () => {},
    writeBatch: () => {
      const pending = [];
      return {
        set: (ref, data) => pending.push({ ref, data }),
        update: (ref, data) => pending.push({ ref, data }),
        commit: async () => { for (const write of pending) { stored.set(write.ref, write.data); writes.push(write); } }
      };
    }
  };
  return { sdk, listeners, writes, stored, stopped: () => stopped };
}

function storage(initial = {}) {
  const entries = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v) };
}

test('task writes preserve scheduling, status and completion; listener forwards errors', async () => {
  const fake = mockFirestore();
  const tasks = await loadModule('firebase-tasks.js', fake.sdk);
  assert.equal(await tasks.addTask('home', 'Trash', 'Alice', '2026-11-09', { time: '10:00' }), 'new-task');
  assert.equal(fake.writes[0].ref, 'households/home/tasks');
  assert.equal(fake.writes[0].data.time, '10:00');
  await tasks.setTaskCompleted('home', 'task', true);
  assert.equal(fake.writes[1].data.completed, true);
  await tasks.setTaskCompleted('home', 'task', false);
  assert.equal(fake.writes[2].data.status, 'accepted');
  await tasks.updateTask('home', 'task', { date: '2026-11-10', time: '11:00' });
  assert.equal(fake.writes[3].data.date, '2026-11-10');
  let received, error;
  const stop = tasks.listenToTasks('home', value => received = value, value => error = value);
  fake.listeners[0].next({ docs: [{ id: 'real-id', data: () => ({ id: 'stale-id', title: 'Trash' }) }] });
  assert.equal(received[0].id, 'real-id');
  fake.listeners[0].error('permission-denied');
  assert.equal(error, 'permission-denied');
  stop();
  assert.equal(fake.stopped(), 1);
});

test('household subscriptions update existing page data and can all unsubscribe', async () => {
  const fake = mockFirestore();
  const events = [];
  const window = { householdData: { calendar: {} }, dispatchEvent: event => events.push(event.type) };
  const api = await loadModule('firebase-household.js', fake.sdk, { window, CustomEvent: class { constructor(type) { this.type = type; } } });
  const errors = [];
  const cloud = api.createHouseholdCloud('home', { uid: 'alice' }, e => errors.push(e));
  fake.listeners[0].next({ docs: [{ id: 'one', data: () => ({ title: 'Trash', completed: true }) }] });
  assert.equal(cloud.tasks[0].status, 'completed');
  assert.equal(window.householdData.tasks.length, 1);
  fake.listeners[1].next({ docs: [{ id: 'meeting', data: () => ({ title: 'Meeting', addedBy: 'Alice' }) }] });
  assert.equal(window.householdData.calendar.shared[0].owner, 'Alice');
  fake.listeners[2].next({ docs: [{ id: 'alice', data: () => ({ displayName: 'Alice' }) }] });
  assert.equal(cloud.members[0].role, 'You');
  fake.listeners[0].error('offline');
  assert.deepEqual(errors, ['offline']);
  assert.deepEqual(events, ['roomie:tasks-updated', 'roomie:events-updated', 'roomie:members-updated']);
  cloud.stop.forEach(stop => stop());
  assert.equal(fake.stopped(), 3);
});

test('legacy import keeps decisions, edits and personal privacy; retry does not overwrite cloud changes', async () => {
  const fake = mockFirestore();
  const api = await loadModule('legacy-import.js', fake.sdk);
  const saved = storage({
    remindRoomieTasks: [{ id: 'old', title: 'Trash', memberIds: ['demo-id'], date: '2026-11-09' }],
    remindRoomieTaskDecisions: { old: { status: 'accepted', date: '2026-11-10' } },
    remindRoomieCalendarEvents: [
      { id: 'private', title: 'Dentist', scope: 'personal' },
      { id: 'shared', title: 'Dinner', scope: 'shared' },
      { id: 'deleted', title: 'Deleted', scope: 'shared' }
    ],
    remindRoomieCalendarEdits: { shared: { title: 'Updated dinner' } },
    remindRoomieDeletedEvents: ['deleted']
  });
  const original = saved.getItem('remindRoomieTasks');
  const cloud = { user: { uid: 'alice' }, householdId: 'home' };
  await api.importLegacyData(cloud, saved);
  const task = fake.writes.find(w => w.ref.includes('/tasks/')).data;
  assert.equal(task.status, 'accepted');
  assert.equal(task.date, '2026-11-10');
  assert.equal(task.memberIds, undefined);
  const shared = fake.writes.filter(w => w.ref.includes('/events/'));
  assert.equal(shared.length, 1);
  assert.equal(shared[0].data.title, 'Updated dinner');
  assert.equal(shared[0].data.createdBy, 'alice');
  assert.equal(JSON.parse(saved.getItem('remindRoomieCalendarEvents:alice'))[0].title, 'Dentist');
  assert.equal(saved.getItem('remindRoomieCalendarEvents:bob'), null);
  assert.equal(saved.getItem('remindRoomieTasks'), original);
  const writeCount = fake.writes.length;
  await api.importLegacyData(cloud, saved);
  assert.equal(fake.writes.length, writeCount);
});

test('invalid legacy data is rejected before writes', async () => {
  const fake = mockFirestore();
  const api = await loadModule('legacy-import.js', fake.sdk);
  await assert.rejects(api.importLegacyData({ user: { uid: 'alice' }, householdId: 'home' }, storage({ remindRoomieTasks: {} })), /invalid format/);
  assert.equal(fake.writes.length, 0);
});

// Small DOM harness for behavior checks of the existing classic page script.
class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.listeners = {}; this.style = {}; this.dataset = {};
    this.hidden = false; this.value = ''; this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(...items) { this.children.push(...items); }
  prepend(...items) { this.children.unshift(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute() {}
  addEventListener(type, fn) {
    const previous = this.listeners[type];
    this.listeners[type] = previous ? async event => { await previous(event); return fn(event); } : fn;
  }
  focus() {}
  reset() {}
  querySelectorAll(selector) {
    const descendants = this.children.flatMap(item => [item, ...item.querySelectorAll('*')]);
    if (selector === '*') return descendants;
    return descendants.filter(item => item.tag === 'input' && (!selector.includes(':checked') || item.checked));
  }
}

async function loadPage(page, cloud, saved = storage(), options = {}) {
  const html = fs.readFileSync(path.resolve(__dirname, `../Remind_Roomie/${page}.html`), 'utf8');
  const elements = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => {
    const element = new Element();
    element.hidden = /\bhidden\b/.test(match[0]);
    return [match[1], element];
  }));
  const listeners = {};
  const document = {
    getElementById: id => elements.get(id) || null,
    createElement: tag => new Element(tag),
    addEventListener: (type, fn) => listeners[type] = fn,
    body: new Element(),
    querySelectorAll: () => []
  };
  const window = { roomieHouseholdReady: options.missingReady ? undefined : options.ready || Promise.resolve(), roomieCloud: cloud,
    addEventListener: (type, fn) => listeners[type] = fn, scrollTo() {} };
  const householdData = {
    user: { name: 'Alice', initials: 'A' }, family: [{ id: 'alice', name: 'Alice' }], tasks: cloud?.tasks || [],
    calendar: { personal: [], housemates: [], shared: [] }
  };
  const context = vm.createContext({
    window, document, householdData, localStorage: saved, console: options.console || console, setTimeout, clearTimeout,
    Option: class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } }
  });
  vm.runInContext(fs.readFileSync(path.join(jsRoot, 'form-controls.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(jsRoot, 'script.js'), 'utf8'), context,
    { importModuleDynamically: options.importFirebase });
  const initialized = listeners.DOMContentLoaded();
  if (!options.deferInitialization) await initialized;
  return { elements, listeners, householdData, window, initialized, document };
}

test('task page renders one card per cloud task and recognizes UID assignees', async () => {
  const cloud = { user: { uid: 'alice' }, members: [{ id: 'alice', name: 'Alice' }],
    tasks: [{ id: 'task', title: 'Trash', assignedTo: 'Old name', memberIds: ['alice'], status: 'requested', _remote: true }] };
  const page = await loadPage('tasks', cloud);
  assert.equal(page.elements.get('allTasks').children.length, 1);
  assert.equal(page.elements.get('taskRequests').children[0].className, 'task-request-card');
  let update;
  cloud.updateTask = async (id, changes) => { update = { id, changes }; };
  const request = page.elements.get('taskRequests').children[0];
  const accept = request.children[3].children[0];
  await accept.listeners.click();
  assert.equal(update.id, 'task');
  assert.equal(update.changes.status, 'accepted');
});

test('home progress responds to snapshots and account-scoped personal events', async () => {
  const cloud = { user: { uid: 'alice' }, members: [], tasks: [
    { id: 'one', title: 'Done', status: 'completed', assignedTo: 'Alice' },
    { id: 'two', title: 'Trash', status: 'accepted', assignedTo: 'Alice' }
  ] };
  const page = await loadPage('index', cloud, storage({ remindRoomieCalendarEvents: [{ title: 'Another account event' }] }));
  assert.equal(page.elements.get('taskProgress').textContent, '1 of 2 tasks completed');
  assert.equal(page.elements.get('progressPercentage').textContent, '50%');
  assert.equal(page.elements.get('homeTasks').children.length, 1);
  assert.equal(page.elements.get('homeEvents').children[0].textContent, 'No personal events this week.');
  cloud.tasks = [];
  page.listeners['roomie:tasks-updated']();
  assert.equal(page.elements.get('progressPercentage').textContent, '0%');
});

test('calendar personal create/edit/delete stays scoped to the account', async () => {
  const saved = storage();
  const cloud = { user: { uid: 'alice' }, members: [], tasks: [], events: [] };
  const page = await loadPage('calendar', cloud, saved);
  const fields = page.elements;
  for (const [id, value] of Object.entries({ eventTitle: 'Dentist', eventDate: '2026-11-12', eventTime: '10:00', eventEndTime: '11:00' })) fields.get(id).value = value;
  await fields.get('addEventForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  let events = JSON.parse(saved.getItem('remindRoomieCalendarEvents:alice'));
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Dentist');
  assert.equal(saved.getItem('remindRoomieCalendarEvents'), null);
  const day = fields.get('dayEvents').children[0];
  day.listeners.click();
  const editPerson = new Element('input'); editPerson.checked = true; editPerson.value = 'alice';
  fields.get('editAssignees').append(editPerson);
  for (const [id, value] of Object.entries({ editTitle: 'New dentist', editDate: '2026-11-12', editTime: '11:00', editEndTime: '12:00' })) fields.get(id).value = value;
  await fields.get('editEventForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  const edits = JSON.parse(saved.getItem('remindRoomieCalendarEdits:alice'));
  assert.equal(edits[events[0].id].title, 'New dentist');
  const actions = fields.get('eventHero').children[0].children[1];
  actions.children[1].listeners.click();
  await fields.get('confirmDelete').listeners.click();
  assert.equal(JSON.parse(saved.getItem('remindRoomieDeletedEvents:alice'))[0], events[0].id);
});

test('shared event create uses snapshot once and edit/delete call the cloud', async () => {
  const cloud = { user: { uid: 'alice' }, members: [], tasks: [], events: [] };
  const page = await loadPage('calendar', cloud);
  const fields = page.elements;
  page.householdData.family.push({ id: 'bob', name: 'Bob' });
  page.listeners['roomie:local-events-updated']();
  // Replace attendee options to select a shared event.
  const attendee = new Element('input'); attendee.checked = true; attendee.value = 'Bob';
  fields.get('eventAssignees').append(attendee);
  cloud.addEvent = async event => {
    cloud.events = [{ ...event, id: 'remote', createdBy: 'alice', _remote: true }];
    page.listeners['roomie:events-updated']();
    return 'remote';
  };
  for (const [id, value] of Object.entries({ eventTitle: 'Dinner', eventDate: '2026-11-12', eventTime: '18:00', eventEndTime: '19:00' })) fields.get(id).value = value;
  await fields.get('addEventForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(page.householdData.calendar.shared.length, 1);
  assert.equal(fields.get('dayEvents').children.length, 1);
  fields.get('dayEvents').children[0].listeners.click();
  let update, deleted;
  const editPerson = new Element('input'); editPerson.checked = true; editPerson.value = 'alice';
  fields.get('editAssignees').append(editPerson);
  cloud.updateEvent = async (id, changes) => { update = { id, changes }; };
  cloud.deleteEvent = async id => { deleted = id; };
  for (const [id, value] of Object.entries({ editTitle: 'Dinner updated', editDate: '2026-11-12', editTime: '18:30', editEndTime: '19:30' })) fields.get(id).value = value;
  await fields.get('editEventForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(update.id, 'remote');
  assert.equal(update.changes.title, 'Dinner updated');
  const actions = fields.get('eventHero').children[0].children[1];
  actions.children[1].listeners.click();
  await fields.get('confirmDelete').listeners.click();
  assert.equal(deleted, 'remote');
});

test('login retries profile failures and recovers an account missing its Firestore profile', async () => {
  const fake = mockFirestore();
  const elements = new Map();
  const listeners = {};
  const document = { getElementById: id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }, addEventListener: (type, callback) => listeners[type] = callback };
  let authChanged;
  const user = { uid: 'alice', email: 'alice@example.com', displayName: 'Alice' };
  const originalGet = fake.sdk.getDoc;
  let fail = true;
  fake.sdk.getDoc = async ref => { if (fail) throw new Error('offline'); return originalGet(ref); };
  await loadModule('auth-page.js', fake.sdk, { document, window: { location: { replace() {} } }, authSdk: {
    onAuthStateChanged: (_auth, callback) => authChanged = callback,
    signInWithEmailAndPassword: async () => ({ user }),
    signOut: async () => {},
    createUserWithEmailAndPassword() {}, updateProfile() {}
  } });
  listeners.DOMContentLoaded();
  authChanged(user);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('authMessage').textContent, 'offline');
  fail = false;
  await elements.get('loginForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(fake.stored.get('users/alice').displayName, 'Alice');
  assert.equal(elements.get('householdSetup').hidden, false);
  assert.equal(elements.get('authForms').hidden, true);
  authChanged(null);
  assert.equal(elements.get('householdSetup').hidden, true);
});

test('protected pages wait for the household and release listeners on sign-out', async () => {
  const fake = mockFirestore();
  fake.stored.set('users/alice', { displayName: 'Alice', householdId: 'home' });
  fake.stored.set('households/home', { name: 'Home' });
  const elements = new Map(['accountName', 'signOutButton'].map(id => [id, new Element()]));
  const window = { householdData: {}, location: { replace: url => window.redirect = url }, addEventListener() {} };
  let authChanged;
  await loadModule('firebase-app.js', fake.sdk, {
    window, localStorage: storage(),
    document: { getElementById: id => elements.get(id), createElement: () => new Element(), body: new Element() },
    authSdk: {
      onAuthStateChanged: (_auth, callback) => authChanged = callback,
      signOut: async () => authChanged(null),
      createUserWithEmailAndPassword() {}, updateProfile() {}
    }
  });
  await authChanged({ uid: 'alice' });
  const cloud = await window.roomieHouseholdReady;
  assert.equal(cloud.householdId, 'home');
  assert.equal(window.householdData.user.name, 'Alice');
  assert.equal(elements.get('accountName').textContent, 'Alice');
  assert.equal(fake.listeners.length, 3);
  await elements.get('signOutButton').listeners.click();
  assert.equal(window.redirect, 'login.html');
  assert.equal(window.roomieCloud, null);
  assert.equal(fake.stopped(), 3);
});

test('protected page reports a failed household fetch without redirecting in a loop', async () => {
  const fake = mockFirestore();
  fake.sdk.getDoc = async () => { throw new Error('offline'); };
  let authChanged;
  const body = new Element();
  const window = { location: { replace() { throw new Error('unexpected redirect'); } }, addEventListener() {} };
  await loadModule('firebase-app.js', fake.sdk, {
    window, console: { error() {} },
    document: { getElementById: id => id === 'signOutButton' ? new Element() : null, createElement: () => new Element(), body },
    authSdk: {
      onAuthStateChanged: (_auth, callback) => authChanged = callback,
      signOut() {}, createUserWithEmailAndPassword() {}, updateProfile() {}
    }
  });
  await authChanged({ uid: 'alice' });
  assert.equal(await window.roomieHouseholdReady, null);
  assert.match(body.children[0].textContent, /could not be synchronized/);
});

test('Assign task opens and cancels while household loading is pending', async () => {
  let ready;
  const pending = new Promise(resolve => ready = resolve);
  const page = await loadPage('tasks', null, storage(), { ready: pending, deferInitialization: true });
  const fields = page.elements;
  assert.equal(fields.get('addTaskForm').hidden, true);
  fields.get('openAddTask').listeners.click();
  assert.equal(fields.get('addTaskForm').hidden, false);
  let prevented = false;
  await fields.get('addTaskForm').listeners.submit({ preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
  assert.equal(prevented, true);
  assert.match(fields.get('newTaskMessage').textContent, /still loading/);
  fields.get('cancelAddTask').listeners.click();
  assert.equal(fields.get('addTaskForm').hidden, true);
  page.window.roomieCloud = { user: { uid: 'alice' }, members: [], tasks: [] };
  ready();
  await page.initialized;
  fields.get('openAddTask').listeners.click();
  fields.get('newTaskTitle').value = 'Wash dishes';
  let task;
  page.window.roomieCloud.addTask = async (...args) => task = args;
  await fields.get('addTaskForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(task[0], 'Wash dishes');
  assert.equal(task[1], 'Alice');
  assert.equal(fields.get('addTaskForm').hidden, true);
});

test('Invite member opens during loading and displays an invitation after saving', async () => {
  let ready;
  const pending = new Promise(resolve => ready = resolve);
  const page = await loadPage('family', null, storage(), { ready: pending, deferInitialization: true });
  const fields = page.elements;
  assert.equal(fields.get('memberForm').hidden, true);
  fields.get('addMemberButton').listeners.click();
  assert.equal(fields.get('memberForm').hidden, false);
  await fields.get('memberForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.match(fields.get('familyMessage').textContent, /still loading/);
  fields.get('cancelAddMember').listeners.click();
  assert.equal(fields.get('memberForm').hidden, true);
  page.window.roomieCloud = { user: { uid: 'alice' }, householdId: 'home', members: [], tasks: [],
    createInvitation: async email => { assert.equal(email, 'bob@example.com'); return 'INVITE-CODE'; } };
  ready();
  await page.initialized;
  fields.get('addMemberButton').listeners.click();
  fields.get('memberEmail').value = 'bob@example.com';
  await fields.get('memberForm').listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(fields.get('memberForm').hidden, true);
  assert.equal(fields.get('familyMessage').hidden, false);
  assert.match(fields.get('familyMessage').textContent, /home.*INVITE-CODE/);
  // The visible result must live outside the form that is hidden on success.
  const html = fs.readFileSync(path.resolve(__dirname, '../Remind_Roomie/family.html'), 'utf8');
  assert.ok(html.indexOf('id="familyMessage"') > html.indexOf('</form>'));
});

test('form controls remain usable after household loading fails; submits explain the failure', async () => {
  for (const [pageName, triggerId, formId, messageId] of [
    ['tasks', 'openAddTask', 'addTaskForm', 'newTaskMessage'],
    ['family', 'addMemberButton', 'memberForm', 'familyMessage']
  ]) {
    const page = await loadPage(pageName, null);
    page.elements.get(triggerId).listeners.click();
    assert.equal(page.elements.get(formId).hidden, false);
    await page.elements.get(formId).listeners.submit({ preventDefault() {}, stopImmediatePropagation() {} });
    assert.match(page.elements.get(messageId).textContent, /could not be loaded/);
  }
});

test('a blocked Firebase module reports an error without disabling the Assign task button', async () => {
  const page = await loadPage('tasks', null, storage(), { missingReady: true, console: { error() {} },
    importFirebase: async () => { throw new Error('SDK network request failed'); } });
  assert.match(page.document.body.children[0].textContent, /Could not load Firebase/);
  page.elements.get('openAddTask').listeners.click();
  assert.equal(page.elements.get('addTaskForm').hidden, false);
});
