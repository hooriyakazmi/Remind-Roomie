const { test, expect } = require('@playwright/test');

// A shared in-memory profile acts as the backend for browser-only rendering
// tests. Firestore transactions and permissions are tested separately in the emulator.
async function profileBackend(context, failSave = false) {
  let profile = { id: 'alice', name: 'Alice', initials: 'A', previousNames: [], color: '#90cdd8', secondary: '#CDE7EC' };
  await context.exposeFunction('__readProfile', () => profile);
  await context.exposeFunction('__saveProfile', changes => {
    if (failSave) throw new Error('permission-denied');
    if (changes.displayName && changes.displayName !== profile.name) {
      profile = { ...profile, name: changes.displayName, initials: changes.displayName.charAt(0).toUpperCase(), previousNames: [...profile.previousNames, profile.name] };
    }
    return profile;
  });
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await context.route('https://www.gstatic.com/**', route => route.abort());
  await context.route('**/js/firebase-app.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    const profile = await window.__readProfile();
    const today = new Date();
    const date = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-');
    const bob = {id:'bob',name:'Bob',initials:'B',color:'#B9C8FC',secondary:'#D9E2FF'};
    const events = [
      {id:'uid-event',title:'Household dinner',date,time:'18:00',endTime:'19:00',scope:'shared',attendees:['alice','bob'],createdBy:'alice',addedBy:'Alice',_remote:true},
      {id:'old-event',title:'Older invitation',date,time:'10:00',endTime:'11:00',scope:'shared',attendees:['Alice'],createdBy:'bob',addedBy:'Bob',_remote:true}
    ];
    window.roomieCloud = {
      user:{uid:'alice'},householdId:'test-home',members:[profile,bob],membersReady:Promise.resolve(),events,
      tasks:[
        {id:'old',title:'Legacy task',assignedTo:'Alice',assignedBy:'Alice',status:'requested',_remote:true},
        {id:'new',title:'Modern task',memberIds:['alice'],assignedTo:'Alice',assignedBy:'Alice',assignedById:'alice',status:'accepted',_remote:true}
      ],
      updateProfile:async changes => {
        const next = await window.__saveProfile(changes);
        applyProfile(next);
        localStorage.setItem('roomieTestProfile', JSON.stringify(next));
      }
    };
    function applyProfile(next) {
      window.roomieCloud.members = [next,bob];
      window.householdData.family = window.roomieCloud.members;
      window.householdData.user = {name:next.name,initials:next.initials,greeting:'Welcome back!'};
      window.dispatchEvent(new CustomEvent('roomie:members-updated'));
    }
    window.addEventListener('storage', event => {
      if (event.key==='roomieTestProfile') applyProfile(JSON.parse(event.newValue));
    });
    window.householdData.tasks = window.roomieCloud.tasks;
    window.householdData.calendar = {personal:[],housemates:[],shared:events};
    applyProfile(profile);
    window.roomieHouseholdReady = Promise.resolve(window.roomieCloud);
  ` }));
}

async function openReady(page, path) {
  await page.goto(path);
  await expect.poll(() => page.evaluate(() => window.roomieAppState)).toBe('ready');
}

test('saving a name updates all open screens, legacy records, initials, and survives reloads', async ({ context, page }) => {
  await profileBackend(context);
  const home = await context.newPage();
  const family = await context.newPage();
  const tasks = await context.newPage();
  const calendar = await context.newPage();
  await openReady(home, '/index.html');
  await openReady(family, '/family.html');
  await openReady(tasks, '/tasks.html');
  await openReady(calendar, '/calendar.html');
  await calendar.getByText('Household dinner', { exact: true }).click();
  await openReady(page, '/settings.html');
  await expect(page.locator('#settingsName')).toHaveValue('Alice');
  await page.locator('#settingsName').fill('  Robin  ');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('#settingsMessage')).toContainText('Name saved');
  await expect(page.locator('#settingsName')).toHaveValue('Robin');
  for (const openPage of [page, home, family, tasks, calendar]) {
    await expect(openPage.locator('#accountName')).toHaveText('Robin');
  }
  await expect(home.locator('#userName')).toHaveText('Robin');
  await expect(home.locator('#profileAvatar')).toHaveText('R');
  await expect(home.locator('#homeTasks')).toContainText('Legacy task');
  await expect(family.locator('#familyList')).toContainText('Robin');
  await expect(family.locator('#familyList')).not.toContainText('Alice');
  await expect(tasks.locator('#taskRequests')).toContainText('Assigned by Robin');
  await expect(tasks.locator('#allTasks')).not.toContainText('Alice');
  await expect(tasks.locator('#allTasks').getByLabel('Assigned to Robin')).toHaveCount(2);
  await expect(calendar.locator('#eventDetailCard')).toContainText('Shared with Robin, Bob');
  await expect(calendar.locator('#eventDetailCard')).toContainText('added by Robin');
  await calendar.locator('#backToCalendar').click();
  await expect(calendar.locator('#dayEvents')).toContainText('Older invitation');
  await calendar.locator('#addEventButton').click();
  await expect(calendar.locator('#eventAssignees')).toContainText('Robin');
  await page.reload();
  await expect(page.locator('#settingsName')).toHaveValue('Robin');
  await page.locator('#settingsName').fill('Sam');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(tasks.locator('#taskRequests')).toContainText('Assigned by Sam');
  await expect(home.locator('#homeTasks')).toContainText('Legacy task');
  await expect(home.locator('#profileAvatar')).toHaveText('S');
});

test('a failed rename keeps the current identity and the typed name for retry', async ({ context, page }) => {
  await profileBackend(context, true);
  await openReady(page, '/settings.html');
  await page.locator('#settingsName').fill('Robin');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('#settingsMessage')).toContainText('Could not save');
  await expect(page.locator('#settingsName')).toHaveValue('Robin');
  await expect(page.locator('#accountName')).toHaveText('Alice');
  await expect(page.getByRole('button', { name: 'Save name' })).toBeEnabled();
});

test('blank names are rejected and profile snapshots preserve an unsaved draft', async ({ context, page }) => {
  await profileBackend(context);
  await openReady(page, '/settings.html');
  await page.locator('#settingsName').fill('   ');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('#settingsMessage')).toContainText('between 1 and 60');
  await page.locator('#settingsName').fill('Draft name');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('roomie:members-updated')));
  await expect(page.locator('#settingsName')).toHaveValue('Draft name');
});
