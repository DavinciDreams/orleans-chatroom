let connection = null;
let currentNickname = '';
let currentChannel = '';

// Initialize SignalR connection
function initializeConnection() {
    connection = new signalR.HubConnectionBuilder()
        .withUrl("/chatHub")
        .withAutomaticReconnect()
        .build();

    // Handle incoming messages
    connection.on("ReceiveMessage", (message) => {
        addMessageToUI(message);
    });

    // Handle history load
    connection.on("LoadHistory", (messages) => {
        document.getElementById('messagesList').innerHTML = '';
        messages.forEach(msg => addMessageToUI(msg));
        scrollToBottom();
    });

    // Handle member list updates
    connection.on("UpdateMembers", (members) => {
        updateMembersList(members);
    });

    // Handle connection errors
    connection.onreconnecting((error) => {
        console.log('Reconnecting...', error);
        showStatus('Reconnecting...', 'warning');
    });

    connection.onreconnected((connectionId) => {
        console.log('Reconnected!', connectionId);
        showStatus('Reconnected!', 'success');
    });

    connection.onclose((error) => {
        console.log('Connection closed', error);
        showStatus('Connection lost. Please refresh the page.', 'danger');
    });
}

// Join channel
async function joinChannel() {
    const nickname = document.getElementById('nicknameInput').value.trim();
    const channel = document.getElementById('channelInput').value.trim();

    if (!nickname || !channel) {
        alert('Please enter both nickname and channel name');
        return;
    }

    try {
        document.getElementById('joinBtn').disabled = true;
        document.getElementById('joinBtn').innerHTML = '<span class="spinner-border spinner-border-sm"></span> Joining...';

        await connection.start();
        await connection.invoke("JoinChannel", channel, nickname);

        currentNickname = nickname;
        currentChannel = channel;

        document.getElementById('currentNickname').textContent = nickname;
        document.getElementById('currentChannel').textContent = channel;
        document.getElementById('loginPanel').classList.add('d-none');
        document.getElementById('chatPanel').classList.remove('d-none');
        document.getElementById('messageInput').focus();

        showStatus(`Joined #${channel} as ${nickname}`, 'success');
    } catch (error) {
        console.error('Error joining channel:', error);
        alert('Failed to join channel. Make sure the Orleans server is running.');
        document.getElementById('joinBtn').disabled = false;
        document.getElementById('joinBtn').innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Join Channel';
    }
}

// Send message
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (!message) return;

    try {
        await connection.invoke("SendMessage", message);
        messageInput.value = '';
        messageInput.focus();
    } catch (error) {
        console.error('Error sending message:', error);
        showStatus('Failed to send message', 'danger');
    }
}

// Leave channel
async function leaveChannel() {
    try {
        await connection.invoke("LeaveChannel");
        await connection.stop();

        document.getElementById('loginPanel').classList.remove('d-none');
        document.getElementById('chatPanel').classList.add('d-none');
        document.getElementById('messagesList').innerHTML = '';
        document.getElementById('membersList').innerHTML = '';
        document.getElementById('joinBtn').disabled = false;
        document.getElementById('joinBtn').innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Join Channel';

        currentNickname = '';
        currentChannel = '';
    } catch (error) {
        console.error('Error leaving channel:', error);
    }
}

// Add message to UI
function addMessageToUI(message) {
    const messagesList = document.getElementById('messagesList');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message mb-3';

    const isSystem = message.author === 'System';
    const isOwnMessage = message.author === currentNickname;

    if (isSystem) {
        messageDiv.innerHTML = `
            <div class="text-center text-muted small">
                <i class="bi bi-info-circle"></i> ${escapeHtml(message.text)}
            </div>
        `;
    } else {
        const timestamp = new Date(message.created).toLocaleTimeString();
        const messageClass = isOwnMessage ? 'bg-primary text-white' : 'bg-white';
        const alignment = isOwnMessage ? 'ms-auto' : '';

        messageDiv.innerHTML = `
            <div class="card ${messageClass} ${alignment}" style="max-width: 70%;">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-start mb-1">
                        <strong class="me-2">${escapeHtml(message.author)}</strong>
                        <small class="text-muted ${isOwnMessage ? 'text-white-50' : ''}">${timestamp}</small>
                    </div>
                    <div>${escapeHtml(message.text)}</div>
                </div>
            </div>
        `;
    }

    messagesList.appendChild(messageDiv);
    scrollToBottom();
}

// Update members list
function updateMembersList(members) {
    const membersList = document.getElementById('membersList');
    const memberCount = document.getElementById('memberCount');

    membersList.innerHTML = '';
    memberCount.textContent = members.length;

    members.forEach(member => {
        const li = document.createElement('li');
        li.className = 'mb-2';
        const isCurrentUser = member === currentNickname;
        li.innerHTML = `
            <i class="bi bi-person-fill ${isCurrentUser ? 'text-primary' : 'text-success'}"></i>
            <strong>${escapeHtml(member)}</strong>
            ${isCurrentUser ? '<span class="badge bg-primary ms-1">You</span>' : ''}
        `;
        membersList.appendChild(li);
    });
}

// Scroll to bottom of messages
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

// Show status message
function showStatus(message, type) {
    // You can implement a toast notification here
    console.log(`[${type}] ${message}`);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeConnection();

    document.getElementById('joinBtn').addEventListener('click', joinChannel);
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('leaveBtn').addEventListener('click', leaveChannel);

    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    document.getElementById('nicknameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinChannel();
        }
    });

    document.getElementById('channelInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinChannel();
        }
    });
});
