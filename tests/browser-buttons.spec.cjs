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
