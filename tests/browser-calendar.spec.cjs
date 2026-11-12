const { test, expect } = require('@playwright/test');

async function backend(context) {
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await context.route('https://www.gstatic.com/**', route => route.abort());
  await context.route('**/js/firebase-app.js', route => route.fulfill({contentType:'application/javascript', body:`
    const uid = new URL(location.href).searchParams.get('as') || 'george';
    const members = [{id:'george',name:'George',initials:'G'}, {id:'max',name:'Max',initials:'M'}, {id:'other',name:'Other',initials:'O'}];
    const me = members.find(person => person.id === uid);
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
    window.householdData.user = me;
    window.householdData.family = members;
    window.householdData.calendar = {personal:[],housemates:[],shared:[]};
    const tasks = [
      {id:'to-me',title:'Assigned to George',memberIds:['george'],assignedById:'max',date,status:'accepted'},
      {id:'by-me',title:'Assigned by George',memberIds:['max'],assignedById:'george',date,status:'requested'},
      {id:'unrelated',title:'Unrelated task',memberIds:['max'],assignedById:'other',date,status:'accepted'}
    ];
    const cloud = window.roomieCloud = {
      user:{uid}, members, membersReady:Promise.resolve(), tasks, events:[],
      addEvent:async event => {
        const result = {...event, id:crypto.randomUUID(), createdBy:uid, _remote:true};
        const events = [...JSON.parse(localStorage.getItem('testEvents') || '[]'), result];
        localStorage.setItem('testEvents', JSON.stringify(events));
        apply(events);
        return result.id;
      },
      updateEvent:async (id, changes) => {
        const events = cloud.events.map(event => event.id === id ? {...event,...changes} : event);
        localStorage.setItem('testEvents', JSON.stringify(events)); apply(events);
      },
      deleteEvent:async id => {
        const events = cloud.events.filter(event => event.id !== id);
        localStorage.setItem('testEvents', JSON.stringify(events)); apply(events);
      }
    };
    function apply(events) {
      cloud.events = events;
      window.householdData.calendar.shared = events;
      window.dispatchEvent(new CustomEvent('roomie:events-updated'));
    }
    apply(JSON.parse(localStorage.getItem('testEvents') || '[]'));
    window.addEventListener('storage', event => {
      if (event.key === 'testEvents') apply(JSON.parse(event.newValue));
    });
    window.roomieHouseholdReady = Promise.resolve(cloud);
  `}));
}

async function open(page, actor = 'george', path = 'calendar.html') {
  await page.goto('/' + path + '?as=' + actor);
  await expect.poll(() => page.evaluate(() => window.roomieAppState)).toBe('ready');
}
async function create(page, title) {
  await page.locator('#addEventButton').click();
  await page.locator('#eventTitle').fill(title);
  await page.getByRole('combobox', {name:'Start time, type a time',exact:true}).fill('10:00 AM');
  await page.locator('#eventTitle').focus();
  await page.getByRole('combobox', {name:'End time, type a time',exact:true}).fill('11:00 AM');
}
async function submit(page) {
  await page.locator('#eventTitle').focus();
  await page.locator('#addEventForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#calendarView')).toBeVisible();
}

test('George personal event reaches Max Shared live, with creator-only edit/delete', async ({context, page}) => {
  await backend(context);
  const max = await context.newPage();
  await open(page);
  await open(max, 'max');
  await max.locator('[data-scope="shared"]').click();
  await create(page, 'George dentist');
  await submit(page);
  await expect(page.locator('#dayEvents')).toContainText('George dentist');
  await expect(max.locator('#dayEvents')).toContainText('George dentist');
  await max.locator('[data-scope="personal"]').click();
  await expect(max.locator('#dayEvents')).not.toContainText('George dentist');
  await max.locator('[data-scope="shared"]').click();
  await max.locator('#dayEvents .cal-event').click();
  await expect(max.getByRole('button', {name:'Edit event',exact:true})).toHaveCount(0);
  await max.locator('#backToCalendar').click();
  await page.locator('#dayEvents .cal-event').click();
  await page.getByRole('button', {name:'Edit event',exact:true}).click();
  await page.locator('#editTitle').fill('Dentist updated');
  await page.locator('#editEventForm').evaluate(form => form.requestSubmit());
  await expect(max.locator('#dayEvents')).toContainText('Dentist updated');
  await page.getByRole('button', {name:'Delete event',exact:true}).click();
  await page.locator('#confirmDelete').click();
  await expect(max.locator('#dayEvents')).not.toContainText('Dentist updated');
});

test('Personal follows guest list even when the creator is excluded', async ({context, page}) => {
  await backend(context);
  const max = await context.newPage();
  await open(page);
  await open(max, 'max');
  await create(page, 'Max invitation');
  await page.locator('#eventAssignees input[value="george"]').uncheck();
  await page.locator('#eventAssignees input[value="max"]').check();
  await submit(page);
  await expect(max.locator('#dayEvents')).toContainText('Max invitation');
  await page.locator('[data-scope="personal"]').click();
  await expect(page.locator('#dayEvents')).not.toContainText('Max invitation');
  await page.locator('[data-scope="shared"]').click();
  await expect(page.locator('#dayEvents')).toContainText('Max invitation');
});

test('Settings toggle includes tasks assigned to or by the user and updates an open calendar', async ({context, page}) => {
  await backend(context);
  await open(page);
  const settings = await context.newPage();
  await open(settings, 'george', 'settings.html');
  await expect(page.locator('#dayEvents')).not.toContainText('Assigned to George');
  await settings.locator('.switch-track').click();
  await expect(page.locator('#dayEvents')).toContainText('Assigned to George');
  await expect(page.locator('#dayEvents')).toContainText('Assigned by George');
  await expect(page.locator('#dayEvents')).not.toContainText('Unrelated task');
  await page.locator('[data-scope="shared"]').click();
  await expect(page.locator('#dayEvents')).not.toContainText('Assigned to George');
  await page.locator('[data-scope="personal"]').click();
  await page.reload();
  await expect(page.locator('#dayEvents')).toContainText('Assigned to George');
  await settings.locator('.switch-track').click();
  await expect(page.locator('#dayEvents')).not.toContainText('Assigned to George');
  await expect(page.locator('#dayEvents')).not.toContainText('Assigned by George');
});
