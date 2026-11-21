const { test, expect } = require('@playwright/test');

async function taskBackend(context, initial = {}) {
  let fail = false;
  let calls = 0;
  const task = { id: 'one', title: 'Wash dishes', assignedTo: 'Bob', memberIds: ['bob'], assignedBy: 'Alice', assignedById: 'alice', date: '2030-03-10', time: '10:00', dueDate: '2030-03-10', status: 'requested', completed: false, _remote: true, responses: {}, ...initial };
  let deleted = false;
  await context.exposeFunction('__readTasks', () => deleted ? [] : [task]);
  await context.exposeFunction('__deleteTask', (actor, id) => {
    if (fail) throw new Error('Connection lost.');
    if (id !== task.id || !(actor === task.assignedById || task.completed || task.status === 'completed')) {
      throw new Error('Task cannot be deleted by this account.');
    }
    deleted = true;
  });
  await context.exposeFunction('__editCreatedTask', (actor, id, changes) => {
    if (deleted || actor !== task.assignedById || id !== task.id) throw new Error('Only the creator can edit this task.');
    Object.assign(task, changes);
  });
  await context.exposeFunction('__respond', (senderId, taskId, response) => {
    calls++;
    if (fail) throw new Error('Connection lost.');
    const note = { ...response, reason: response.reason.trim(), senderId, recipientId: 'alice', createdAt: { seconds: calls }, previousDate: task.date, previousTime: task.time };
    if (response.action === 'rejected' || response.action === 'accepted') task.status = response.action;
    else { task.date = response.date; task.time = response.time; }
    task.responses['response-' + calls] = note;
    return { ...note, status: task.status };
  });
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await context.route('https://www.gstatic.com/**', route => route.abort());
  await context.route('**/js/firebase-app.js', route => route.fulfill({ contentType:'application/javascript', body:`
    const actorId = new URL(location.href).searchParams.get('as') || 'bob';
    const members = [{id:'alice',name:'Alice',initials:'A'}, {id:'bob',name:'Bob',initials:'B'}, {id:'carol',name:'Carol',initials:'C'}];
    const me = members.find(member => member.id === actorId);
    window.householdData.user = {name:me.name,initials:me.initials};
    window.householdData.family = members;
    window.householdData.calendar = {personal:[],housemates:[],shared:[]};
    window.roomieCloud = {
      user:{uid:actorId},householdId:'test-home',members,membersReady:Promise.resolve(),events:[],tasks:await window.__readTasks(),
      isTaskCreator: task => task.assignedById === actorId,
      deleteTask:async taskId => {
        await window.__deleteTask(actorId, taskId);
        await refreshTasks();
      },
      editCreatedTask:async (taskId, changes) => {
        await window.__editCreatedTask(actorId, taskId, changes);
        await refreshTasks();
      },
      respondToTask:async (taskId,response) => {
        const result = await window.__respond(actorId,taskId,response);
        await refreshTasks();
        return result;
      }
    };
    async function refreshTasks() {
      const tasks = await window.__readTasks();
      applyTasks(tasks);
      localStorage.setItem('roomieTestTasks', JSON.stringify(tasks));
    }
    function applyTasks(tasks) {
      window.roomieCloud.tasks = tasks;
      window.householdData.tasks = tasks;
      window.dispatchEvent(new CustomEvent('roomie:tasks-updated'));
    }
    window.addEventListener('storage', event => {
      if(event.key==='roomieTestTasks') applyTasks(JSON.parse(event.newValue));
    });
    window.roomieHouseholdReady=Promise.resolve(window.roomieCloud);
  ` }));
  return { task, get calls() { return calls; }, set fail(value) { fail = value; } };
}
async function openTaskPage(page, actor = 'bob') {
  await page.goto('/tasks.html?as=' + actor);
  await expect.poll(() => page.evaluate(() => window.roomieAppState)).toBe('ready');
}

test('a completed task can be deleted from Past Tasks after confirmation', async ({ context, page }) => {
  const backend = await taskBackend(context, { status: 'completed', completed: true, date: '2020-11-12', dueDate: '2020-11-12' });
  const roommate = await context.newPage();
  await openTaskPage(page);
  await openTaskPage(roommate, 'alice');
  await page.getByRole('button', { name: 'Past Tasks' }).click();
  await roommate.getByRole('button', { name: 'Past Tasks' }).click();
  await page.getByRole('button', { name: 'View task details: Wash dishes' }).click();
  const remove = page.getByRole('button', { name: 'Delete task' });
  await remove.click();
  const confirmation = page.getByRole('dialog', { name: 'Delete task?' });
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(remove).toBeVisible();
  await expect(roommate.locator('#pastTasks')).toContainText('Wash dishes');
  backend.fail = true;
  await remove.click();
  await confirmation.getByRole('button', { name: 'Delete task' }).click();
  await expect(confirmation.getByRole('alert')).toContainText('Could not delete this task');
  backend.fail = false;
  await confirmation.getByRole('button', { name: 'Delete task' }).click();
  await expect(page.locator('#pastTasks')).not.toContainText('Wash dishes');
  await expect(roommate.locator('#pastTasks')).not.toContainText('Wash dishes');
  await page.reload();
  await page.getByRole('button', { name: 'Past Tasks' }).click();
  await expect(page.locator('#pastTasks')).toHaveText('No completed past-due tasks yet.');
});

test('the creator can edit and delete an unfinished task assigned to another member', async ({ context, page }) => {
  await taskBackend(context);
  const assignee = await context.newPage();
  await openTaskPage(page, 'alice');
  await openTaskPage(assignee);
  await page.getByRole('button', { name: 'All Tasks' }).click();
  await page.getByRole('button', { name: 'View task details: Wash dishes' }).click();
  await assignee.getByRole('button', { name: 'View task details: Wash dishes' }).click();
  await expect(assignee.getByRole('button', { name: 'Edit task' })).toHaveCount(0);
  await expect(assignee.getByRole('button', { name: 'Delete task' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit task' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit task' });
  await expect(edit.getByRole('checkbox', { name: 'Bob' })).toBeChecked();
  await expect(edit.getByLabel('Due date')).toHaveValue('2030-03-10');
  await edit.getByLabel('Task name').fill('Clear the dishes');
  await edit.getByLabel('Details').fill('Empty the dishwasher first.');
  await edit.getByLabel('Due date').fill('2030-03-12');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Clear the dishes' })).toBeVisible();
  await expect(assignee.getByRole('heading', { name: 'Clear the dishes' })).toBeVisible();
  await expect(assignee.locator('#taskDetailCard')).toContainText('Empty the dishwasher first.');

  await page.getByRole('button', { name: 'Delete task' }).click();
  await page.getByRole('dialog', { name: 'Delete task?' }).getByRole('button', { name: 'Delete task' }).click();
  await expect(assignee.locator('#taskDetailView')).toBeHidden();
  await expect(page.locator('#allTasks')).not.toContainText('Clear the dishes');
});

test('accepting sends a confirmation without an explanation', async ({ context, page }) => {
  const backend = await taskBackend(context);
  const assigner = await context.newPage();
  await openTaskPage(assigner, 'alice');
  await openTaskPage(page);
  await page.getByRole('button', { name:'Reject', exact:true }).click();
  await page.getByLabel('Why are you rejecting this task?').fill('Draft from another action.');
  await page.getByRole('button', { name:'Accept', exact:true }).click();
  await expect(page.locator('.task-response-form textarea')).toHaveCount(0);
  const send = page.getByRole('button', { name:'Send acceptance' });
  await expect(send).toBeFocused();
  await send.click();
  await expect(page.locator('#taskFeedbackTitle')).toHaveText('Task accepted!');
  await expect(page.locator('#taskFeedbackMessage')).toContainText('sent to Alice');
  await expect(assigner.locator('#taskResponses')).toContainText('Bob accepted “Wash dishes”');
  await expect(assigner.locator('#taskResponses .task-response-text')).toHaveCount(0);
  expect(backend.task.responses['response-1'].reason).toBe('');
  expect(backend.task.status).toBe('accepted');
});

// Browser checks use a mock delivery service. Actual atomic Firestore writes and
// cross-household access are covered by the emulator tests.
test('reject requires an explanation, supports cancel, and delivers safely to only the assigner inbox', async ({ context, page }) => {
  const backend = await taskBackend(context);
  const assigner = await context.newPage();
  const other = await context.newPage();
  await openTaskPage(assigner, 'alice');
  await openTaskPage(other, 'carol');
  await openTaskPage(page);
  await page.getByRole('button', { name:'Reject', exact:true }).click();
  const reason = page.getByLabel('Why are you rejecting this task?');
  await expect(reason).toBeVisible();
  await page.locator('.task-response-form').getByRole('button', { name:'Cancel', exact:true }).click();
  await expect(page.locator('.task-response-form')).toHaveCount(0);
  expect(backend.calls).toBe(0);
  await page.getByRole('button', { name:'Reject', exact:true }).click();
  await reason.fill('   ');
  await page.getByRole('button', { name:'Send rejection' }).click();
  await expect(page.locator('.task-response-form [role=alert]')).toContainText('Enter an explanation');
  expect(backend.calls).toBe(0);
  const explanation = 'I am out of town.\n<img src=x onerror=alert(1)>';
  await reason.fill(explanation);
  await page.getByRole('button', { name:'Send rejection' }).click();
  await expect(page.locator('#taskFeedbackTitle')).toHaveText('Task declined');
  await expect(page.locator('#taskFeedbackMessage')).toContainText('sent to Alice');
  await expect(assigner.locator('#taskResponses')).toContainText('Bob rejected “Wash dishes”');
  await expect(assigner.locator('#taskResponses .task-response-text')).toHaveText(explanation);
  await expect(assigner.locator('#taskResponses img')).toHaveCount(0);
  await expect(other.locator('#taskResponsesSection')).toBeHidden();
  expect(backend.task.status).toBe('rejected');
  await assigner.reload();
  await expect(assigner.locator('#taskResponses')).toContainText('I am out of town.');
});

test('rescheduling sends the explanation and new schedule and retains earlier responses', async ({ context, page }) => {
  const backend = await taskBackend(context);
  const assigner = await context.newPage();
  await openTaskPage(assigner, 'alice');
  await openTaskPage(page);
  await page.getByRole('button', { name:'Reschedule', exact:true }).click();
  await page.getByLabel('New due date').fill('2030-03-12');
  await page.getByLabel('New due time').fill('14:00');
  await page.getByLabel('Why are you rescheduling?').fill('My work shift changed.');
  await page.getByRole('button', { name:'Save new time' }).click();
  await expect(page.locator('#taskFeedbackTitle')).toHaveText('Task rescheduled');
  await expect(assigner.locator('#taskResponses')).toContainText('My work shift changed.');
  await expect(assigner.locator('#taskResponses')).toContainText('March 12');
  expect(backend.task.status).toBe('requested');
  expect(backend.task.time).toBe('14:00');
  await page.getByRole('button', { name:'Back to Tasks' }).click();
  await page.getByRole('button', { name:'Reject', exact:true }).click();
  await page.getByLabel('Why are you rejecting this task?').fill('I will be away after all.');
  await page.getByRole('button', { name:'Send rejection' }).click();
  await expect(assigner.locator('#taskResponses .task-response-card')).toHaveCount(2);
  await expect(assigner.locator('#taskResponses')).toContainText('My work shift changed.');
  await expect(assigner.locator('#taskResponses')).toContainText('I will be away after all.');
});

test('failed delivery preserves the explanation and leaves the task unchanged for retry', async ({ context, page }) => {
  const backend = await taskBackend(context);
  backend.fail = true;
  await openTaskPage(page);
  await page.getByRole('button', { name:'Reject', exact:true }).click();
  await page.getByLabel('Why are you rejecting this task?').fill('Out of town.');
  await page.getByRole('button', { name:'Send rejection' }).click();
  await expect(page.locator('.task-response-form [role=alert]')).toContainText('Could not send');
  await expect(page.getByLabel('Why are you rejecting this task?')).toHaveValue('Out of town.');
  expect(backend.task.status).toBe('requested');
  expect(Object.keys(backend.task.responses)).toHaveLength(0);
  backend.fail = false;
  await page.getByRole('button', { name:'Send rejection' }).click();
  await expect(page.locator('#taskFeedbackTitle')).toHaveText('Task declined');
  expect(Object.keys(backend.task.responses)).toHaveLength(1);
});

test('live task snapshots and switching actions preserve the explanation draft and focus', async ({ context, page }) => {
  await taskBackend(context);
  await openTaskPage(page);
  await page.getByRole('button', { name:'Reject', exact:true }).click();
  const reason = page.getByLabel('Why are you rejecting this task?');
  await reason.fill('Need another time.');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('roomie:tasks-updated')));
  await expect(reason).toHaveValue('Need another time.');
  await expect(reason).toBeFocused();
  await page.getByRole('button', { name:'Reschedule', exact:true }).click();
  await expect(page.getByLabel('Why are you rescheduling?')).toHaveValue('Need another time.');
  await page.getByLabel('New due date').fill('2030-03-15');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('roomie:members-updated')));
  await expect(page.getByLabel('New due date')).toHaveValue('2030-03-15');
  await expect(page.getByLabel('Why are you rescheduling?')).toHaveValue('Need another time.');
});
