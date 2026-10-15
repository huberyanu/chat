const groups = [
  { id: '1', name: 'Gruppe 1' },
  { id: '2', name: 'Gruppe 2' },
  { id: '3', name: 'Gruppe 3' },
];

const roomList = document.querySelector('#room-list');
const roomTitle = document.querySelector('#room-title');
const roomSymbol = document.querySelector('#room-symbol');
const lockedState = document.querySelector('#locked-state');
const messages = document.querySelector('#messages');
const messageList = document.querySelector('#message-list');
const composer = document.querySelector('#composer');
const nameInput = document.querySelector('#name-input');
const nameDialog = document.querySelector('#name-dialog');
const nameEntry = document.querySelector('#name-entry');
const nameError = document.querySelector('#name-error');
const dialog = document.querySelector('#password-dialog');
const passwordInput = document.querySelector('#password-input');
const formError = document.querySelector('#form-error');
const messageInput = document.querySelector('#message-input');
const imageInput = document.querySelector('#image-input');
const attachmentPreview = document.querySelector('#attachment-preview');
const connection = document.querySelector('#connection');

let currentGroup = groups[0];
let lastMessageId = 0;
let selectedImage = '';
let pollTimer;

nameInput.value = (localStorage.getItem('chat-name') || '').trim();
updateAvatar();
if (!nameInput.value) {
  nameDialog.showModal();
}
nameInput.addEventListener('input', () => {
  const name = nameInput.value.trim();
  if (name) localStorage.setItem('chat-name', name);
  else localStorage.removeItem('chat-name');
  updateAvatar();
});

document.querySelector('#name-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameEntry.value.trim();
  if (!name) {
    nameError.textContent = 'Bitte gib deinen Namen ein.';
    nameEntry.focus();
    return;
  }
  localStorage.setItem('chat-name', name);
  nameInput.value = name;
  updateAvatar();
  nameDialog.close();
});

function updateAvatar() {
  document.querySelector('#profile-avatar').textContent = (nameInput.value.trim()[0] || 'G').toUpperCase();
}

function savedPassword(groupId) {
  return localStorage.getItem(`chat-group-${groupId}`) || '';
}

function drawRooms() {
  roomList.replaceChildren();
  for (const group of groups) {
    const unlocked = Boolean(savedPassword(group.id));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `room-button${group.id === currentGroup.id ? ' active' : ''}`;
    button.setAttribute('aria-current', group.id === currentGroup.id ? 'page' : 'false');
    button.innerHTML = `<span class="room-number">${group.id.padStart(2, '0')}</span><span class="room-meta"><strong>${group.name}</strong><small>${unlocked ? 'Chat freigeschaltet' : 'Privater Chat'}</small></span><span class="room-lock" aria-label="${unlocked ? 'freigeschaltet' : 'gesperrt'}">${unlocked ? '✓' : '⌑'}</span>`;
    button.addEventListener('click', () => selectGroup(group));
    roomList.append(button);
  }
}

function selectGroup(group) {
  currentGroup = group;
  lastMessageId = 0;
  clearInterval(pollTimer);
  messageList.replaceChildren();
  roomTitle.textContent = group.name;
  roomSymbol.textContent = group.id.padStart(2, '0');
  document.querySelector('#divider-group').textContent = group.name;
  drawRooms();
  const password = savedPassword(group.id);
  if (!password) {
    setChatVisible(false);
    return;
  }
  setChatVisible(true);
  loadMessages();
  pollTimer = setInterval(loadMessages, 1200);
}

function setChatVisible(unlocked) {
  lockedState.hidden = unlocked;
  messages.hidden = !unlocked;
  composer.hidden = !unlocked;
}

async function api(path, options = {}) {
  const password = savedPassword(currentGroup.id);
  const headers = { ...(options.headers || {}) };
  if (password) headers['X-Group-Password'] = password;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Die Anfrage ist fehlgeschlagen.');
  return data;
}

async function loadMessages() {
  try {
    const data = await api(`/api/messages?group=${currentGroup.id}&after=${lastMessageId}`);
    connection.classList.remove('offline');
    for (const message of data.messages) appendMessage(message);
  } catch (error) {
    connection.classList.add('offline');
    if (error.message === 'Gruppe gesperrt.') {
      localStorage.removeItem(`chat-group-${currentGroup.id}`);
      selectGroup(currentGroup);
    }
  }
}

function appendMessage(message) {
  if (message.id <= lastMessageId) return;
  lastMessageId = message.id;
  const item = document.createElement('article');
  const isMine = message.sender === (nameInput.value.trim() || 'Gast');
  item.className = `message${isMine ? ' mine' : ''}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = (message.sender[0] || 'G').toUpperCase();
  const body = document.createElement('div');
  body.className = 'message-body';
  const top = document.createElement('div');
  top.className = 'message-top';
  const sender = document.createElement('strong');
  sender.textContent = message.sender;
  const time = document.createElement('time');
  time.dateTime = message.time;
  time.textContent = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.time));
  top.append(sender, time);
  body.append(top);
  if (message.text || message.image) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (message.text) bubble.append(document.createTextNode(message.text));
    if (message.image) {
      const image = document.createElement('img');
      image.src = message.image;
      image.alt = 'Geteiltes Bild';
      image.loading = 'lazy';
      bubble.append(image);
    }
    body.append(bubble);
  }
  item.append(avatar, body);
  messageList.append(item);
  messageList.scrollTop = messageList.scrollHeight;
}

document.querySelector('#unlock-button').addEventListener('click', () => {
  document.querySelector('#dialog-title').textContent = currentGroup.name;
  passwordInput.value = '';
  formError.textContent = '';
  dialog.showModal();
  passwordInput.focus();
});

document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';
  try {
    const response = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: currentGroup.id, password: passwordInput.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Das Passwort stimmt nicht.');
    localStorage.setItem(`chat-group-${currentGroup.id}`, passwordInput.value);
    dialog.close();
    selectGroup(currentGroup);
  } catch (error) {
    formError.textContent = error.message;
    passwordInput.select();
  }
});

imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    alert('Das Bild darf höchstens 4 MB groß sein.');
    imageInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    selectedImage = reader.result;
    attachmentPreview.replaceChildren();
    const image = document.createElement('img');
    image.src = selectedImage;
    image.alt = 'Bildvorschau';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-image';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Bild entfernen');
    remove.addEventListener('click', clearImage);
    attachmentPreview.append(image, remove);
    attachmentPreview.hidden = false;
  });
  reader.readAsDataURL(file);
});

function clearImage() {
  selectedImage = '';
  imageInput.value = '';
  attachmentPreview.replaceChildren();
  attachmentPreview.hidden = true;
}

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!nameInput.value.trim()) {
    nameDialog.showModal();
    nameEntry.focus();
    return;
  }
  const text = messageInput.value.trim();
  if (!text && !selectedImage) return;
  const sendButton = composer.querySelector('.send-button');
  sendButton.disabled = true;
  try {
    const data = await api(`/api/messages?group=${currentGroup.id}`, {
      method: 'POST',
      body: JSON.stringify({ sender: nameInput.value.trim() || 'Gast', text, image: selectedImage }),
    });
    messageInput.value = '';
    messageInput.style.height = 'auto';
    clearImage();
    appendMessage(data.message);
  } catch (error) {
    alert(error.message);
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
});

messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
});
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

drawRooms();
selectGroup(currentGroup);