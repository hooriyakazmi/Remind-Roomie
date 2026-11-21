const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await context.route('**/js/firebase-app.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const uid = new URLSearchParams(location.search).get('as') || 'alice';
      const members = [
        { id: 'alice', name: 'Alice', initials: 'A', color: '#90cdd8' },
        { id: 'bob', name: 'Bob', initials: 'B', color: '#B9C8FC' },
        { id: 'cara', name: 'Cara', initials: 'C', color: '#f7dafa' },
        { id: 'dan', name: 'Dan', initials: 'D', color: '#d5eee7' }
      ];
      const me = members.find(member => member.id === uid);
      const chatsKey = 'test:chats';
      const messageKey = id => id ? 'test:messages:' + id : 'test:household-messages';
      const read = key => JSON.parse(localStorage.getItem(key) || '[]');
      const write = (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
        window.dispatchEvent(new Event('test:messages'));
      };
      function subscribe(sync) {
        sync();
        window.addEventListener('storage', sync);
        window.addEventListener('test:messages', sync);
        return () => {
          window.removeEventListener('storage', sync);
          window.removeEventListener('test:messages', sync);
        };
      }
      window.householdData.user = { ...me, greeting: 'Welcome back!' };
      window.householdData.family = members;
      window.householdData.calendar = { personal: [], housemates: [], shared: [] };
      window.householdData.tasks = [];
      window.roomieCloud = {
        user: { uid }, members, events: [], tasks: [], stop: [],
        watchChats(onChats) {
          return subscribe(() => onChats(read(chatsKey).filter(chat => chat.memberIds.includes(uid))));
        },
        async createChat(type, ids, name) {
          const chats = read(chatsKey);
          const memberIds = [uid, ...ids].sort();
          const id = type === 'direct' ? 'direct-' + memberIds.join('-') : 'group-' + chats.length;
          const existing = chats.find(chat => chat.id === id);
          if (existing) return existing;
          const chat = { id, memberIds, name, type };
          write(chatsKey, [...chats, chat]);
          return chat;
        },
        watchMessages(id, count, onMessages) {
          return subscribe(() => onMessages(read(messageKey(id)).slice(-count).map(message => ({
            ...message, createdAt: { toDate: () => new Date(message.createdAt) }
          }))));
        },
        async sendMessage(id, text) {
          if (window.failSend) throw new Error('Offline');
          const messages = read(messageKey(id));
          messages.push({ id: String(messages.length), senderId: uid, text, createdAt: Date.now() });
          write(messageKey(id), messages);
        }
      };
      window.roomieHouseholdReady = Promise.resolve(window.roomieCloud);
    `
  }));
});

test('Home profile opens Settings and the Messages tab preserves live household chat', async ({ context, page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#profileAvatar')).toHaveText('A');
  await page.getByRole('link', { name: 'Profile settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('.bottom-nav').getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Messages' }).click();
  await expect(page.getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: /Household chat/ }).click();
  await expect(page.getByText('No messages yet.', { exact: false })).toBeVisible();

  const roommate = await context.newPage();
  await roommate.goto('/messages.html?as=bob');
  await roommate.getByRole('button', { name: /Household chat/ }).click();
  await expect(roommate.getByRole('button', { name: 'Add to message' })).toBeEnabled();
  await expect(roommate.getByRole('button', { name: 'Send' })).toBeDisabled();

  const input = page.getByRole('textbox', { name: 'Message' });
  const send = page.getByRole('button', { name: 'Send' });
  await page.getByRole('button', { name: 'Conversation details' }).click();
  const details = page.getByRole('dialog', { name: 'Conversation details' });
  await expect(details.getByRole('listitem')).toHaveText(['Alice (you)', 'Bob', 'Cara', 'Dan']);
  await details.getByRole('button', { name: 'Done' }).click();
  await input.fill('Hi ');
  await page.getByRole('button', { name: 'Add to message' }).click();
  await page.getByRole('button', { name: 'Thumbs up' }).click();
  await expect(input).toHaveValue('Hi 👍');
  await expect(send).toBeEnabled();

  await page.evaluate(() => window.failSend = true);
  await input.fill('  <b>Hello!</b>  ');
  await send.click();
  await expect(page.getByRole('alert')).toHaveText('Could not send your message. Please try again.');
  await expect(input).toHaveValue('  <b>Hello!</b>  ');

  await page.evaluate(() => window.failSend = false);
  await send.click();
  await expect(input).toHaveValue('');
  const outgoing = page.locator('.chat-message-own .chat-bubble');
  const incoming = roommate.locator('.chat-message .chat-bubble');
  await expect(outgoing.locator('..')).toContainText('You');
  await expect(outgoing.getByTitle('Sent')).toBeVisible();
  await expect(outgoing).toHaveCSS('justify-self', 'end');
  await expect(incoming.locator('..')).toContainText('Alice');
  await expect(incoming).toHaveCSS('justify-self', 'start');
  await expect(roommate.getByText('<b>Hello!</b>', { exact: true })).toBeVisible();

  await roommate.reload();
  await roommate.getByRole('button', { name: /Household chat/ }).click();
  await expect(roommate.getByText('<b>Hello!</b>', { exact: true })).toBeVisible();

  await roommate.evaluate(() => {
    const key = 'test:household-messages';
    const messages = JSON.parse(localStorage.getItem(key));
    const earlier = Array.from({ length: 50 }, (_, index) => ({
      id: `earlier-${index}`,
      senderId: 'bob',
      text: `Earlier message ${index + 1}`,
      createdAt: messages[0].createdAt - (50 - index) * 1000
    }));
    localStorage.setItem(key, JSON.stringify([...earlier, ...messages]));
    window.dispatchEvent(new Event('test:messages'));
  });
  const history = roommate.getByRole('list', { name: 'Messages in chronological order' });
  await expect(history.getByRole('listitem')).toHaveCount(50);
  await roommate.getByRole('button', { name: 'Load earlier messages' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(51);
  await expect(history.getByRole('listitem').first()).toContainText('Earlier message 1');
  await expect(roommate.getByRole('button', { name: 'Load earlier messages' })).toBeHidden();
});

test('the inbox lists members for one-tap direct messages and has a separate group button', async ({ context, page }) => {
  await page.goto('/messages.html');
  const bob = await context.newPage();
  const cara = await context.newPage();
  const dan = await context.newPage();
  await Promise.all([
    bob.goto('/messages.html?as=bob'), cara.goto('/messages.html?as=cara'), dan.goto('/messages.html?as=dan')
  ]);
  const conversations = page.getByRole('list', { name: 'Conversations' });
  await expect(conversations.getByRole('button')).toHaveCount(4);
  await expect(conversations.getByRole('button').first()).toHaveAccessibleName('Household chat');
  await expect(page.getByRole('button', { name: 'New group' })).toBeEnabled();
  const bobChat = conversations.getByRole('button', { name: 'Bob' });
  await expect(bobChat).toContainText('Start a conversation');
  await expect(bobChat.locator('.conversation-avatar')).toHaveCSS('background-color', 'rgb(185, 200, 252)');
  await bobChat.click();
  await expect(page.getByRole('heading', { name: 'Bob' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message' }).fill('Direct to Bob');
  await page.getByRole('button', { name: 'Send' }).click();

  const aliceChat = bob.getByRole('button', { name: 'Alice' });
  await expect(aliceChat.locator('.conversation-preview')).toHaveText('Direct to Bob');
  await expect(aliceChat.locator('time')).toBeVisible();
  await aliceChat.click();
  await expect(bob.getByRole('list', { name: 'Messages in chronological order' })).toContainText('Direct to Bob');
  await expect(cara.getByRole('list', { name: 'Conversations' })).not.toContainText('Direct to Bob');

  await page.getByRole('textbox', { name: 'Message' }).fill('A draft for Bob');
  await page.getByRole('button', { name: /Back to Messages/ }).click();
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByRole('textbox', { name: 'Group name' }).fill('Dinner crew');
  await page.getByRole('checkbox', { name: 'Bob' }).check();
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByRole('alert')).toContainText('select 2 to 9');
  await page.getByRole('checkbox', { name: 'Cara' }).check();
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByRole('heading', { name: 'Dinner crew' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Message' }).fill('Dinner at six');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(bob.getByRole('list', { name: 'Messages in chronological order' })).not.toContainText('Dinner at six');
  const dinnerChat = cara.getByRole('button', { name: 'Dinner crew' });
  await expect(dinnerChat.locator('.conversation-preview')).toHaveText('Alice: Dinner at six');
  await expect(cara.getByRole('list', { name: 'Conversations' }).getByRole('button').nth(1))
    .toHaveAccessibleName('Dinner crew');
  await dinnerChat.click();
  const dinnerMessages = cara.getByRole('list', { name: 'Messages in chronological order' });
  await expect(dinnerMessages).toContainText('Dinner at six');
  await expect(dinnerMessages).not.toContainText('Direct to Bob');
  await expect(dan.getByRole('button', { name: /Dinner crew/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Back to Messages/ }).click();
  await expect(bobChat).toContainText('Direct to Bob');
  await bobChat.click();
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('A draft for Bob');
});
