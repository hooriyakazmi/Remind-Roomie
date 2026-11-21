const PAGE_SIZE = 50;
const HOUSEHOLD_CHAT = { id: null, type: "household", name: "Household chat" };
const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function previewTime(date) {
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return timeFormat.format(date);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    const lastWeek = new Date(now);
    lastWeek.setDate(now.getDate() - 6);
    return date >= lastWeek && date < now ? weekdayFormat.format(date) : dayFormat.format(date);
}

function renderAvatar(avatar, title, member) {
    avatar.replaceChildren();
    avatar.classList.toggle("conversation-avatar-group", !member);
    if (member) {
        const initials = title.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("");
        avatar.textContent = initials.toLocaleUpperCase() || "?";
        avatar.style.setProperty("--member-profile-color", member.color || "#e5f1ee");
    } else {
        avatar.style.removeProperty("--member-profile-color");
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-users";
        avatar.append(icon);
    }
}

export function initMessages(cloud) {
    const inbox = document.getElementById("chatInbox");
    const inboxTitle = document.getElementById("inboxTitle");
    const inboxStatus = document.getElementById("inboxStatus");
    const chatList = document.getElementById("chatList");
    const noMembers = document.getElementById("noDirectMembers");
    const directError = document.getElementById("directChatError");
    const newGroup = document.getElementById("newGroupChat");
    const newChatPage = document.getElementById("newChatPage");
    const newChatTitle = document.getElementById("newChatTitle");
    const newChatForm = document.getElementById("newChatForm");
    const groupName = document.getElementById("groupName");
    const recipients = document.getElementById("chatRecipients");
    const create = newChatForm.querySelector("button");
    const createError = document.getElementById("newChatError");
    const chatView = document.getElementById("chatView");
    const chatTitle = document.getElementById("chatTitle");
    const chatParticipants = document.getElementById("chatParticipants");
    const chatAvatar = document.getElementById("chatAvatar");
    const chatPrivacy = document.getElementById("chatPrivacy");
    const chatDetails = document.getElementById("chatDetails");
    const chatDetailsMembers = document.getElementById("chatDetailsMembers");

    if (!cloud) {
        inboxStatus.textContent = "Messages are unavailable. Reload to try again.";
        return;
    }

    const thread = createMessageThread(cloud);
    const previews = new Map();
    const previewRows = new Map();
    let chats = [];
    let creatingGroup = null;
    let openingDirect = null;
    let activeChat = null;
    let inboxOrigin = null;

    function memberName(id) {
        return cloud.members.find(member => member.id === id)?.name || "Roommate";
    }

    function otherMembers() {
        return cloud.members.filter(member => member.id !== cloud.user.uid)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function describeChat(chat) {
        if (chat.type === "household") return [chat.name, "Everyone in your household"];
        const names = chat.memberIds.filter(id => id !== cloud.user.uid).map(memberName);
        return chat.type === "direct" ? [names[0], "Direct message"] : [chat.name, names.join(", ")];
    }

    function showInbox() {
        thread.close();
        activeChat = null;
        creatingGroup = null;
        newChatPage.hidden = true;
        chatView.hidden = true;
        inbox.hidden = false;
        const origin = inboxOrigin?.isConnected ? inboxOrigin
            : Array.from(chatList.querySelectorAll("button")).find(button =>
                button.dataset.conversation === inboxOrigin?.dataset.conversation);
        (origin || inboxTitle).focus();
    }

    function renderChatHeader() {
        const [name] = describeChat(activeChat);
        const household = activeChat.type === "household";
        const direct = activeChat.type === "direct";
        const memberIds = household ? cloud.members.map(member => member.id) : activeChat.memberIds;
        chatTitle.textContent = name;
        chatParticipants.textContent = direct ? "Tap for details" : `${memberIds.length} members · Tap for details`;
        chatDetailsMembers.replaceChildren(...memberIds.map(id => {
            const item = document.createElement("li");
            item.textContent = id === cloud.user.uid ? `${memberName(id)} (you)` : memberName(id);
            return item;
        }));
        chatPrivacy.textContent = household ? "Only members of your household can see this conversation."
            : "Only people in this chat can see this conversation.";
        const member = direct && cloud.members.find(item =>
            item.id !== cloud.user.uid && activeChat.memberIds.includes(item.id));
        renderAvatar(chatAvatar, name, member);
    }

    for (const button of [chatParticipants, document.getElementById("chatDetailsButton")]) {
        button.addEventListener("click", () => chatDetails.showModal());
    }

    function openChat(chat) {
        activeChat = chat;
        creatingGroup = null;
        openingDirect = null;
        inbox.hidden = true;
        newChatPage.hidden = true;
        chatView.hidden = false;
        renderChatHeader();
        thread.open(chat);
        chatTitle.focus();
    }

    function renderPreview(chatId) {
        const row = previewRows.get(chatId);
        if (!row) return;
        const message = previews.get(chatId)?.message;
        const sender = message?.senderId === cloud.user.uid ? "You" : memberName(message?.senderId);
        row.preview.textContent = message ? (row.showSender ? `${sender}: ${message.text}` : message.text) : row.detail;
        const date = message?.createdAt?.toDate();
        row.time.hidden = !date;
        row.item.dataset.activity = date?.getTime() ?? row.createdAt;
        if (date) {
            row.time.dateTime = date.toISOString();
            row.time.textContent = previewTime(date);
        }
    }

    function orderConversations() {
        const [household, ...rows] = chatList.children;
        if (!rows.length) return;
        const focused = chatList.contains(document.activeElement) ? document.activeElement : null;
        rows.sort((a, b) => Number(b.dataset.activity) - Number(a.dataset.activity)
            || a.firstElementChild.getAttribute("aria-label").localeCompare(b.firstElementChild.getAttribute("aria-label")));
        let previous = household;
        for (const row of rows) {
            if (previous.nextElementSibling !== row) chatList.insertBefore(row, previous.nextElementSibling);
            previous = row;
        }
        if (focused && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }

    function syncPreviews() {
        const ids = new Set([HOUSEHOLD_CHAT.id, ...chats.filter(chat => chat.createdAt !== null).map(chat => chat.id)]);
        for (const [id, entry] of previews) {
            if (ids.has(id)) continue;
            entry.stop();
            previews.delete(id);
        }
        for (const id of ids) {
            if (previews.has(id)) continue;
            const entry = { message: null };
            previews.set(id, entry);
            entry.stop = cloud.watchMessages(id, 1, messages => {
                entry.message = messages.at(-1);
                renderPreview(id);
                orderConversations();
            }, () => {
                entry.message = null;
                renderPreview(id);
                orderConversations();
            });
        }
    }

    function inboxRow({ title, detail, member, chat, open }) {
        const row = document.createElement("li");
        const createdAt = chat?.createdAt?.toMillis?.() ?? 0;
        row.dataset.activity = createdAt;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.conversation = member ? `member:${member.id}` : `chat:${chat.id || ""}`;
        button.setAttribute("aria-label", title);
        const avatar = document.createElement("span");
        avatar.className = "conversation-avatar";
        avatar.setAttribute("aria-hidden", "true");
        renderAvatar(avatar, title, member);

        const summary = document.createElement("span");
        summary.className = "conversation-summary";
        const name = document.createElement("strong");
        name.textContent = title;
        const preview = document.createElement("span");
        preview.className = "conversation-preview";
        preview.id = `preview-${button.dataset.conversation}`;
        preview.textContent = detail;
        button.setAttribute("aria-describedby", preview.id);
        summary.append(name, preview);
        const time = document.createElement("time");
        time.className = "conversation-time";
        time.hidden = true;
        button.append(avatar, summary, time);
        if (chat) {
            previewRows.set(chat.id, { preview, time, detail, showSender: !member, item: row, createdAt });
            renderPreview(chat.id);
        }
        button.addEventListener("click", () => {
            inboxOrigin = button;
            open(button);
        });
        row.append(button);
        return row;
    }

    function renderInbox() {
        const focus = document.activeElement?.dataset.conversation;
        const groups = chats.filter(chat => chat.type === "group");
        const groupRow = chat => {
            const [title, detail] = describeChat(chat);
            return inboxRow({ title, detail, chat, open: () => openChat(chat) });
        };
        const directChats = new Map();
        for (const chat of chats) {
            if (chat.type === "direct") directChats.set(chat.memberIds.find(id => id !== cloud.user.uid), chat);
        }
        const others = otherMembers();
        noMembers.hidden = others.length > 0;
        previewRows.clear();
        chatList.replaceChildren(
            groupRow(HOUSEHOLD_CHAT),
            ...others.map(member => inboxRow({
                title: member.name,
                detail: "Start a conversation",
                member,
                chat: directChats.get(member.id),
                open: button => {
                    if (openingDirect?.memberId !== member.id) openDirect(member, button);
                }
            })),
            ...groups.map(groupRow)
        );
        orderConversations();
        if (focus) {
            Array.from(chatList.querySelectorAll("button")).find(button => button.dataset.conversation === focus)?.focus();
        }
    }

    async function openDirect(member, button) {
        directError.hidden = true;
        const existing = chats.find(chat => chat.type === "direct" && chat.memberIds.includes(member.id));
        if (existing) {
            openChat(existing);
            return;
        }

        const request = { memberId: member.id };
        openingDirect = request;
        button.setAttribute("aria-busy", "true");
        try {
            const chat = await cloud.createChat("direct", [member.id]);
            if (openingDirect === request && !inbox.hidden) openChat(chat);
        } catch (error) {
            console.error("Could not open the direct message.", error);
            if (openingDirect !== request || inbox.hidden) return;
            directError.textContent = "Could not open this direct message. Please try again.";
            directError.hidden = false;
        } finally {
            if (openingDirect === request) openingDirect = null;
            button.removeAttribute("aria-busy");
        }
    }

    function renderRecipients() {
        const checked = new Set(new FormData(newChatForm).getAll("recipient"));
        const others = otherMembers();
        recipients.replaceChildren(...others.map(member => {
            const label = document.createElement("label");
            const field = document.createElement("input");
            field.type = "checkbox";
            field.name = "recipient";
            field.value = member.id;
            field.checked = checked.has(member.id);
            label.append(field, member.name);
            return label;
        }));
        create.disabled = Boolean(creatingGroup) || others.length < 2;
        if (others.length < 2) {
            createError.textContent = "Invite at least two household members to start a group.";
            createError.hidden = false;
        }
    }

    newGroup.addEventListener("click", () => {
        inboxOrigin = newGroup;
        openingDirect = null;
        newChatForm.reset();
        createError.hidden = true;
        renderRecipients();
        inbox.hidden = true;
        newChatPage.hidden = false;
        newChatTitle.focus();
    });
    document.querySelectorAll("[data-back-to-messages]").forEach(button => {
        button.addEventListener("click", showInbox);
    });

    newChatForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (newChatPage.hidden || create.disabled) return;
        const ids = new FormData(newChatForm).getAll("recipient");
        const name = groupName.value.trim();
        createError.hidden = true;
        if (!name || ids.length < 2 || ids.length > 9) {
            createError.textContent = "Enter a group name and select 2 to 9 household members.";
            createError.hidden = false;
            return;
        }

        const request = {};
        creatingGroup = request;
        create.disabled = true;
        try {
            const chat = await cloud.createChat("group", ids, name);
            if (creatingGroup === request) openChat(chat);
        } catch (error) {
            console.error("Could not open the conversation.", error);
            if (creatingGroup !== request) return;
            createError.textContent = "Could not open the conversation. Please try again.";
            createError.hidden = false;
            creatingGroup = null;
            renderRecipients();
        }
    });

    renderInbox();
    syncPreviews();
    const stopInbox = cloud.watchChats(next => {
        chats = next;
        inboxStatus.hidden = true;
        newGroup.disabled = false;
        renderInbox();
        syncPreviews();
    }, error => {
        console.error("Could not load conversations.", error);
        inboxStatus.textContent = "Could not load private conversations. Reload to try again.";
        inboxStatus.hidden = false;
        newGroup.disabled = true;
    });

    const refreshMembers = () => {
        renderInbox();
        if (!newChatPage.hidden) renderRecipients();
        if (activeChat) {
            renderChatHeader();
            thread.refresh();
        }
    };
    window.addEventListener("roomie:members-updated", refreshMembers);
    cloud.stop.push(() => {
        openingDirect = null;
        creatingGroup = null;
        thread.close();
        stopInbox();
        previews.forEach(entry => entry.stop());
        previews.clear();
        window.removeEventListener("roomie:members-updated", refreshMembers);
    });
}

function createMessageThread(cloud) {
    const thread = document.getElementById("messageThread");
    const list = document.getElementById("messageList");
    const status = document.getElementById("threadStatus");
    const older = document.getElementById("olderMessages");
    const form = document.getElementById("messageForm");
    const input = document.getElementById("messageText");
    const send = form.querySelector('button[type="submit"]');
    const extras = document.getElementById("messageExtras");
    const extrasPanel = document.getElementById("messageExtrasPanel");
    const errorNotice = document.getElementById("messageError");
    const drafts = new Map();
    let active = null;

    function renderMessages(scrollToEnd = false, loadingEarlier = false) {
        const distanceFromEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
        const members = new Map(cloud.members.map(member => [member.id, member.name]));
        let previousDay;
        const rows = active.messages.map(message => {
            const mine = message.senderId === cloud.user.uid;
            const row = document.createElement("li");
            row.className = mine ? "chat-message chat-message-own" : "chat-message";
            const bubble = document.createElement("div");
            bubble.className = "chat-bubble";

            const sender = document.createElement("strong");
            sender.className = mine || active.type === "direct" ? "visually-hidden" : "chat-sender";
            sender.textContent = mine ? "You" : members.get(message.senderId) || "Roommate";

            const body = document.createElement("p");
            body.textContent = message.text;

            const date = message.createdAt?.toDate();
            if (date && date.toDateString() !== previousDay) {
                previousDay = date.toDateString();
                const dateLabel = document.createElement("span");
                dateLabel.className = "chat-date";
                dateLabel.textContent = previousDay === new Date().toDateString() ? "Today" : dayFormat.format(date);
                row.append(dateLabel);
            }
            const time = document.createElement(date ? "time" : "span");
            if (date) time.dateTime = date.toISOString();
            time.textContent = date ? timeFormat.format(date) : "Sending…";
            const meta = document.createElement("span");
            meta.className = "chat-message-time";
            meta.append(time);
            if (mine && date) {
                const check = document.createElement("span");
                check.className = "chat-sent";
                check.textContent = "✓";
                check.title = "Sent";
                meta.append(check);
            }

            row.append(sender);
            bubble.append(body, meta);
            row.append(bubble);
            return row;
        });

        list.replaceChildren(...rows);
        if (loadingEarlier) {
            thread.scrollTop = thread.scrollHeight - thread.clientHeight - distanceFromEnd;
        } else if (scrollToEnd || distanceFromEnd < 48) {
            thread.scrollTop = thread.scrollHeight;
        }
    }

    function renderComposer() {
        const draft = active.draft;
        input.disabled = !active.ready;
        input.readOnly = draft.sending;
        extras.disabled = !active.ready || draft.sending;
        send.disabled = extras.disabled || !input.value.trim();
        errorNotice.textContent = draft.error;
        errorNotice.hidden = !draft.error;
    }

    function watchMessages(view) {
        view.stop?.();
        view.stop = cloud.watchMessages(view.id, view.count + 1, snapshot => {
            if (active !== view) return;
            const previousLast = view.messages.at(-1)?.id;
            const previousFirst = view.messages[0]?.id;
            view.messages = snapshot.slice(-view.count);
            status.hidden = view.messages.length > 0;
            status.textContent = "No messages yet. Start the conversation.";
            older.hidden = snapshot.length <= view.count;
            older.disabled = false;
            view.ready = true;
            renderComposer();
            const latest = view.messages.at(-1);
            const prepended = view.messages.findIndex(message => message.id === previousFirst) > 0;
            renderMessages(!previousLast || (latest?.id !== previousLast && latest?.senderId === cloud.user.uid), prepended);
        }, error => {
            if (active !== view) return;
            console.error("Could not load messages.", error);
            view.ready = false;
            older.hidden = true;
            status.hidden = false;
            status.textContent = "Could not load messages. Reopen the conversation to try again.";
            renderComposer();
        });
    }

    older.addEventListener("click", () => {
        older.disabled = true;
        active.count += PAGE_SIZE;
        watchMessages(active);
    });

    input.addEventListener("input", () => {
        active.draft.text = input.value;
        renderComposer();
    });

    extrasPanel.addEventListener("click", event => {
        const emoji = event.target.closest("button[data-emoji]")?.dataset.emoji;
        if (!emoji || extras.disabled) return;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        if (input.value.length - (end - start) + emoji.length <= input.maxLength) {
            input.setRangeText(emoji, start, end, "end");
            active.draft.text = input.value;
            renderComposer();
        }
        extrasPanel.hidePopover();
        input.focus();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!active || send.disabled) return;
        const { id, draft } = active;
        const text = input.value.trim();
        draft.error = "";
        if (!text) {
            draft.error = "Enter a message to send.";
            renderComposer();
            input.focus();
            return;
        }

        draft.sending = true;
        renderComposer();
        try {
            await cloud.sendMessage(id, text);
            draft.text = "";
        } catch (error) {
            console.error("Could not send the message.", error);
            draft.error = "Could not send your message. Please try again.";
        } finally {
            draft.sending = false;
            if (active?.draft === draft) {
                input.value = draft.text;
                renderComposer();
                if (document.activeElement === document.body || document.activeElement === send) input.focus();
            }
        }
    });

    function close() {
        extrasPanel.hidePopover();
        active?.stop?.();
        active = null;
    }

    return {
        open({ id, type }) {
            close();
            if (!drafts.has(id)) drafts.set(id, { text: "", error: "", sending: false });
            active = { id, type, draft: drafts.get(id), count: PAGE_SIZE, messages: [], ready: false };
            input.placeholder = type === "household" ? "Message your household…" : "Message…";
            input.value = active.draft.text;
            status.textContent = "Loading messages…";
            status.hidden = false;
            older.hidden = true;
            list.replaceChildren();
            renderComposer();
            watchMessages(active);
        },
        close,
        refresh: () => renderMessages()
    };
}
