const { test, expect } = require('@playwright/test');

const cases = [
  { path: '/tasks.html', button: '#openAddTask', form: '#addTaskForm', field: '#newTaskTitle', cancel: '#cancelAddTask', message: '#newTaskMessage' },
  { path: '/family.html', button: '#addMemberButton', form: '#memberForm', field: '#memberEmail', cancel: '#cancelAddMember', message: '#familyMessage' }
];

// No test connects to Firebase or writes live data. Intercept the cloud adapter.
const readyCloud = `
  window.householdData.user = {name:'Alice',initials:'A',greeting:'Welcome back!'};
  window.householdData.family = [{id:'alice',name:'Alice',initials:'A',role:'You'}];
  window.householdData.tasks = [];
  window.householdData.calendar = {personal:[],housemates:[],shared:[]};
  window.roomieCloud = {
    user:{uid:'alice'},householdId:'test-home',members:window.householdData.family,tasks:[],events:[],
    addTask:async function(title,assignedTo,dueDate,details) {
      this.tasks.push({...details,id:'task-one',title,assignedTo,dueDate,_remote:true});
      window.dispatchEvent(new CustomEvent('roomie:tasks-updated'));
      return 'task-one';
    },
    createInvitation:async email => 'TEST-INVITATION-CODE'
  };
  document.getElementById('accountName').textContent='Alice';
  window.roomieHouseholdReady = Promise.resolve(window.roomieCloud);
`;

test.beforeEach(async ({ page }) => {
  await page.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('https://www.gstatic.com/**', route => route.abort());
});

for (const item of cases) {
  test(`${item.path}: controls open and cancel while Firebase never finishes`, async ({ page }) => {
    await page.route('**/js/firebase-app.js', route => route.fulfill({ contentType:'application/javascript', body:'await new Promise(() => {});' }));
    await page.goto(item.path, { waitUntil:'domcontentloaded' });
    await expect(page.locator(item.form)).toBeHidden();
    await page.locator(item.button).click();
    await expect(page.locator(item.form)).toBeVisible();
    await expect(page.locator(item.field)).toBeFocused();
    await page.locator(item.field).fill(item.path === '/tasks.html' ? 'Wash dishes' : 'bob@example.com');
    // Trigger a submit before assignees/profile load, verifying the cloud guard.
    await page.locator(item.form).evaluate(form => form.requestSubmit());
    await expect(page.locator(item.message)).toContainText('still loading');
    await page.locator(item.cancel).click();
    await expect(page.locator(item.form)).toBeHidden();
    await expect(page.locator(item.button)).toBeFocused();
  });

  test(`${item.path}: controls open when Firebase fails`, async ({ page }) => {
    await page.route('**/js/firebase-app.js', route => route.abort());
    await page.goto(item.path);
    await expect(page.locator('#appStatus')).toContainText('Could not load Firebase');
    await page.locator(item.button).click();
    await expect(page.locator(item.form)).toBeVisible();
  });

  test(`${item.path}: controls work even if the main application script cannot load`, async ({ page }) => {
    await page.route('**/js/script.js*', route => route.abort());
    await page.goto(item.path);
    await page.locator(item.button).click();
    await expect(page.locator(item.form)).toBeVisible();
    await page.locator(item.cancel).click();
    await expect(page.locator(item.form)).toBeHidden();
  });

  test(`${item.path}: authenticated form submission succeeds and shows its result`, async ({ page }) => {
    await page.route('**/js/firebase-app.js', route => route.fulfill({ contentType:'application/javascript', body:readyCloud }));
    await page.goto(item.path);
    await expect.poll(() => page.evaluate(() => window.roomieAppState)).toBe('ready');
    await page.locator(item.button).click();
    if (item.path === '/tasks.html') {
      await page.locator(item.field).fill('Wash dishes');
      await page.locator(item.form).getByRole('button', {name:'Assign task'}).click();
      await expect(page.locator(item.form)).toBeHidden();
      await expect(page.locator('#allTasks')).toBeHidden();
      await page.locator('#toggleAllTasks').click();
      await expect(page.locator('#allTasks')).toBeVisible();
      await expect(page.locator('#allTasks')).toContainText('Wash dishes');
      await expect(page.locator('#allTasks .task-list-card')).toHaveCount(1);
    } else {
      await page.locator(item.field).fill('bob@example.com');
      await page.locator(item.form).getByRole('button', {name:'Create invitation'}).click();
      await expect(page.locator(item.form)).toBeHidden();
      await expect(page.locator(item.message)).toBeVisible();
      await expect(page.locator(item.message)).toContainText('test-home');
      await expect(page.locator(item.message)).toContainText('TEST-INVITATION-CODE');
    }
  });
}

test.describe('task assignment date', () => {
  test.use({ timezoneId: 'America/Chicago' });

  test('rejects a past date and lets the user assign a task due today', async ({ page }) => {
    // It is already November 22 in UTC, but still the 21st in Chicago.
    await page.clock.setFixedTime(new Date('2026-11-22T02:00:00Z'));
    await page.route('**/js/firebase-app.js', route => route.fulfill({ contentType: 'application/javascript', body: readyCloud }));
    await page.goto('/tasks.html');
    await page.locator('#openAddTask').click();
    const form = page.locator('#addTaskForm');
    const date = form.getByLabel('Due date', { exact: true });
    await expect(date).toHaveAttribute('min', '2026-11-21');
    await page.locator('#newTaskTitle').fill('Wash dishes');
    await date.fill('2026-11-15');
    await form.getByRole('button', { name: 'Assign task' }).click();
    await expect(form.getByRole('alert')).toHaveText('Choose today or a future date.');
    await expect(form).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.roomieCloud.tasks.length)).toBe(0);

    await date.fill('2026-11-21');
    await form.getByRole('button', { name: 'Assign task' }).click();
    await expect(form).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.roomieCloud.tasks[0]?.dueDate)).toBe('2026-11-21');
  });
});

test('only the head sees Remove and can confirm a member removal from the family circle', async ({ context, page }) => {
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await context.route('**/js/firebase-app.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const uid = new URL(location.href).searchParams.get('as') || 'alice';
      const members = [
        {id:'alice',name:'Alice',initials:'A',role:'Roommate'},
        {id:'bob',name:'Bob',initials:'B',role:'Roommate'},
        {id:'cara',name:'Cara',initials:'C',role:'Roommate'}
      ].filter(member => member.id !== localStorage.getItem('removedMember'));
      const me = members.find(member => member.id === uid);
      me.role = 'You';
      window.householdData.user = me;
      window.householdData.family = members;
      const cloud = window.roomieCloud = {
        user:{uid}, headId:'alice', members,
        async removeMember(id) {
          if (uid !== 'alice' || window.failRemoval) throw new Error('Removal denied.');
          localStorage.setItem('removedMember', id);
          cloud.members = cloud.members.filter(member => member.id !== id);
          window.dispatchEvent(new CustomEvent('roomie:members-updated'));
        }
      };
      window.roomieHouseholdReady = Promise.resolve(cloud);
    `
  }));
  const roommate = await context.newPage();
  await roommate.goto('/family.html?as=bob');
  await expect(roommate.locator('#familyList')).toContainText('Head of family');
  await expect(roommate.getByRole('button', { name: /Remove / })).toHaveCount(0);
  await page.goto('/family.html');
  await expect(page.locator('#familyList')).toContainText('Head of family · You');
  await expect(page.getByRole('button', { name: 'Remove Alice' })).toHaveCount(0);
  const remove = page.getByRole('button', { name: 'Remove Bob' });
  const dialog = page.getByRole('dialog', { name: 'Remove household member?' });
  await remove.click();
  await expect(dialog).toContainText('Remove Bob from your family circle');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(remove).toBeVisible();
  await remove.click();
  await page.evaluate(() => { window.failRemoval = true; });
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not remove this member');
  await page.evaluate(() => { window.failRemoval = false; });
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('#familyList')).not.toContainText('Bob');
  await expect(page.locator('#familyMessage')).toContainText('Bob was removed');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove Cara' })).toBeVisible();
  await expect(page.locator('#familyList')).not.toContainText('Bob');
});
