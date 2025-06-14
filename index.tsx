/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// Removed SPDX-License-Identifier: Apache-2.0 comment block as per user request.

import { GoogleGenAI, Chat, Part } from '@google/genai';

const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
let chat: Chat | null = null;

const messageList = document.getElementById('message-list') as HTMLElement;
const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLElement;
const newChatButton = document.getElementById('new-chat-button') as HTMLButtonElement;
const saveChatButton = document.getElementById('save-chat-button') as HTMLButtonElement;
const historyButton = document.getElementById('history-button') as HTMLButtonElement;
const settingsButton = document.getElementById('settings-button') as HTMLButtonElement;
const speakNavbarButton = document.getElementById('speak-button') as HTMLButtonElement;

const attachImageButton = document.getElementById('attach-image-button') as HTMLButtonElement;
const imageUploadInput = document.getElementById('image-upload-input') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container') as HTMLElement;
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const removeImageButton = document.getElementById('remove-image-button') as HTMLButtonElement;

let selectedImageBase64: string | null = null;
let selectedImageMimeType: string | null = null;

const settingsModal = document.getElementById('settings-modal') as HTMLElement;
const settingsModalCloseButton = document.getElementById('settings-modal-close-button') as HTMLButtonElement;
const autoSpeakToggle = document.getElementById('auto-speak-toggle') as HTMLInputElement;

const SYSTEM_INSTRUCTION = 'You are 8B Ai, a friendly, helpful, and slightly witty AI chat assistant. You can understand text and images. Start by greeting the user and asking how you can help today.';

const speechSynthesis = window.speechSynthesis;
let autoSpeakEnabled = false;

function speakText(text: string) {
    if (!speechSynthesis || !text) return;
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    speechSynthesis.speak(utterance);
}

function updateSpeakButtonState() {
    speakNavbarButton.classList.toggle('active', autoSpeakEnabled);
    speakNavbarButton.setAttribute('aria-pressed', String(autoSpeakEnabled));
    autoSpeakToggle.checked = autoSpeakEnabled;
}

function toggleAutoSpeak() {
    autoSpeakEnabled = !autoSpeakEnabled;
    updateSpeakButtonState();
    if (!autoSpeakEnabled && speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
}

function appendMessage(text: string, sender: 'user' | 'ai', imageSrc: string | null = null, isStreaming: boolean = false): HTMLElement | null {
    if (!messageList) {
        console.error("Message list element not found.");
        return null;
    }
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    
    // Special handling for error/warning messages from the system (styled as 'ai' but could be critical)
    if (sender === 'ai' && (text.startsWith('Warning:') || text.startsWith('Error:') || text.startsWith('Failed to initialize AI'))) {
        messageElement.classList.add('error-message'); // Use error styling for these
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('message-content-wrapper');

    const senderLabel = document.createElement('strong');
    senderLabel.textContent = sender === 'user' ? 'You' : '8B Ai';
    contentWrapper.appendChild(senderLabel);

    if (imageSrc && sender === 'user') {
        const imgElement = document.createElement('img');
        imgElement.src = imageSrc;
        imgElement.alt = "User uploaded image";
        imgElement.classList.add('message-image');
        contentWrapper.appendChild(imgElement);
    }

    const textP = document.createElement('p');
    textP.textContent = text;
    contentWrapper.appendChild(textP);
    
    messageElement.appendChild(contentWrapper);

    if (sender === 'ai' && !messageElement.classList.contains('error-message')) { // Don't add speak button to system error messages
        const speakIcon = document.createElement('button');
        speakIcon.classList.add('speak-message-button');
        speakIcon.setAttribute('aria-label', 'Speak this message');
        speakIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        speakIcon.addEventListener('click', () => {
            const messageText = textP.textContent;
            if (messageText) speakText(messageText);
        });
        contentWrapper.insertBefore(speakIcon, textP);
    }
    
    if (isStreaming) {
        messageElement.classList.add('streaming');
    }

    messageList.appendChild(messageElement);
    messageList.scrollTop = messageList.scrollHeight;
    return messageElement;
}

function updateStreamingMessage(messageElement: HTMLElement, chunkText: string) {
    const textP = messageElement.querySelector('p');
    if (textP) {
        textP.textContent += chunkText;
        messageList.scrollTop = messageList.scrollHeight;
    }
}

function finalizeStreamingMessage(messageElement: HTMLElement | null, fullText?: string) {
    if (messageElement) {
        messageElement.classList.remove('streaming');
        if (fullText && autoSpeakEnabled && messageElement.classList.contains('ai-message') && !messageElement.classList.contains('error-message')) {
            speakText(fullText);
        }
    }
}

async function startNewChatSession(isInitialGreeting: boolean = true) {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    if (!ai) {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (sendButton) sendButton.disabled = true;
        // Do not append message here, initializeApp or API_KEY check handles initial messaging
        return;
    }

    messageList.innerHTML = '';
    if(sendButton) sendButton.disabled = true;
    if(loadingIndicator) loadingIndicator.style.display = 'flex';
    let welcomeMessageElement: HTMLElement | null = null;
    let fullWelcomeText = "";

    try {
        chat = ai.chats.create({
            model: 'gemini-2.5-flash-preview-04-17',
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
            },
        });

        if (isInitialGreeting) {
            const stream = await chat.sendMessageStream({ message: "Hello" });
            for await (const chunk of stream) {
                if (!welcomeMessageElement) {
                    welcomeMessageElement = appendMessage("", "ai", null, true);
                }
                if (welcomeMessageElement && chunk.text) {
                    fullWelcomeText += chunk.text;
                    updateStreamingMessage(welcomeMessageElement, chunk.text);
                }
            }
        }
    } catch (error) {
        console.error("Failed to start new chat session or get initial greeting:", error);
        let errorText = "Sorry, I couldn't start our conversation properly. Please try again.";
        if (error instanceof Error) {
            errorText = `Error starting chat: ${error.message}`;
        }
        appendMessage(errorText, "ai");
    } finally {
        finalizeStreamingMessage(welcomeMessageElement, fullWelcomeText);
        if(loadingIndicator) loadingIndicator.style.display = 'none';
        if(sendButton) sendButton.disabled = !ai; // Only enable if AI is available
        if(messageInput) messageInput.focus();
        messageList.scrollTop = messageList.scrollHeight;
    }
}

async function handleSendMessage() {
    const inputText = messageInput.value.trim();
    if (!selectedImageBase64 && !inputText) return;
    
    if (!chat || !ai) {
        appendMessage("Error: AI is not available. Cannot send message.", "ai");
        if(loadingIndicator) loadingIndicator.style.display = 'none';
        // sendButton might already be disabled by initializeApp, but ensure it here too
        if(sendButton) sendButton.disabled = true; 
        return;
    }

    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    appendMessage(inputText, 'user', selectedImageBase64 ? imagePreview.src : null);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    messageInput.focus();

    let userImageBase64 = selectedImageBase64;
    let userImageMimeType = selectedImageMimeType;

    if (selectedImageBase64) {
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '#';
        selectedImageBase64 = null;
        selectedImageMimeType = null;
        imageUploadInput.value = '';
    }

    if(sendButton) sendButton.disabled = true;
    if(loadingIndicator) loadingIndicator.style.display = 'flex';

    let currentAiMessageElement: HTMLElement | null = null;
    let currentAiFullText = "";

    try {
        const parts: Part[] = [];
        if (userImageBase64 && userImageMimeType) {
            parts.push({
                inlineData: {
                    mimeType: userImageMimeType,
                    data: userImageBase64.split(',')[1]
                }
            });
        }
        if (inputText) {
            parts.push({ text: inputText });
        }

        if (parts.length === 0) {
           throw new Error("No content to send.");
        }

        const stream = await chat.sendMessageStream({ message: parts });

        for await (const chunk of stream) {
            if (!currentAiMessageElement) {
                currentAiMessageElement = appendMessage('', 'ai', null, true);
            }
            if (currentAiMessageElement && chunk.text) {
                currentAiFullText += chunk.text;
                updateStreamingMessage(currentAiMessageElement, chunk.text);
            }
        }
    } catch (error) {
        console.error('Error sending message:', error);
        let errorText = 'Sorry, something went wrong while sending your message. Please try again.';
        if (error instanceof Error) {
            errorText = `Error sending message: ${error.message}`;
        }
        if (currentAiMessageElement) {
             updateStreamingMessage(currentAiMessageElement, `\n\n[Error: Could not complete response]`);
             currentAiFullText += `\n\n[Error: Could not complete response]`;
        } else {
            currentAiFullText = errorText;
            appendMessage(errorText, "ai");
        }
    } finally {
        finalizeStreamingMessage(currentAiMessageElement, currentAiFullText);
        if(sendButton) sendButton.disabled = false;
        if(loadingIndicator) loadingIndicator.style.display = 'none';
        messageList.scrollTop = messageList.scrollHeight;
    }
}

attachImageButton.addEventListener('click', () => {
    if (imageUploadInput) imageUploadInput.click();
});

imageUploadInput.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
        if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
            alert('Unsupported file type. Please select a PNG, JPG, JPEG, or WEBP image.');
            target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedImageBase64 = e.target?.result as string;
            selectedImageMimeType = file.type;
            imagePreview.src = selectedImageBase64;
            imagePreviewContainer.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
});

removeImageButton.addEventListener('click', () => {
    imagePreviewContainer.style.display = 'none';
    imagePreview.src = '#';
    selectedImageBase64 = null;
    selectedImageMimeType = null;
    if (imageUploadInput) imageUploadInput.value = '';
});

saveChatButton.addEventListener('click', () => {
    const messagesToSave = [];
    const messageElements = messageList.querySelectorAll('.message');
    messageElements.forEach(msgElement => {
        const senderLabel = msgElement.querySelector('strong')?.textContent;
        const textContent = msgElement.querySelector('p')?.textContent;
        const imageElement = msgElement.querySelector('.message-image') as HTMLImageElement;
        const imageSrc = imageElement ? imageElement.src : null;

        let sender: 'user' | 'ai' | 'unknown' = 'unknown';
        if (senderLabel === 'You') sender = 'user';
        else if (senderLabel === '8B Ai') sender = 'ai';

        if (sender !== 'unknown' && (textContent || imageSrc)) {
             // Avoid saving system warnings/errors as chat history
            if (msgElement.classList.contains('error-message')) return;
            messagesToSave.push({
                sender,
                text: textContent || '',
                imageSrc
            });
        }
    });

    if (messagesToSave.length > 0) {
        try {
            localStorage.setItem('8bAi_savedChat', JSON.stringify(messagesToSave));
            alert('Chat saved successfully!');
        } catch (e) {
            console.error('Failed to save chat to localStorage:', e);
            alert('Failed to save chat. Storage might be full or unavailable.');
        }
    } else {
        alert('No messages to save.');
    }
});

sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
    }
});

messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    const scrollHeight = messageInput.scrollHeight;
    const maxHeight = 100;
    messageInput.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
});

newChatButton.addEventListener('click', () => {
    if (!ai) {
        appendMessage("Cannot start new chat. AI features are disabled.", "ai");
        return;
    }
    startNewChatSession(true);
});

historyButton.addEventListener('click', () => {
    alert('Chat history feature (loading saved chats) is coming soon!');
});

settingsButton.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
});

settingsModalCloseButton.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

settingsModal.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

speakNavbarButton.addEventListener('click', toggleAutoSpeak);
autoSpeakToggle.addEventListener('change', () => {
    if (autoSpeakToggle.checked !== autoSpeakEnabled) {
        toggleAutoSpeak();
    }
});


const initializeApp = () => {
    // Ensure critical UI elements are available before proceeding
    if (!messageList || !messageInput || !sendButton || !attachImageButton || !newChatButton || !loadingIndicator) {
        alert("Error: Core UI elements are missing. The application cannot start correctly.");
        console.error("Core UI elements missing from the DOM.");
        return;
    }

    if (!API_KEY) {
        const errorMsg = 'Warning: API_KEY is not configured. AI features are disabled. Please set the API_KEY environment variable to enable AI chat.';
        console.warn(errorMsg);
        appendMessage(errorMsg, 'ai');

        messageInput.disabled = true;
        messageInput.placeholder = "AI features disabled (API_KEY missing)";
        sendButton.disabled = true;
        attachImageButton.disabled = true;
        newChatButton.disabled = true;
        loadingIndicator.style.display = 'none';
        
        // Disable speak button as well, as its primary use is for AI messages
        speakNavbarButton.disabled = true;
        autoSpeakToggle.disabled = true;
        
        // Allow settings modal to open, but toggle inside might be disabled
        // Save chat could still technically work for manually typed content, so keep it enabled.
        // History button is a placeholder.

    } else {
        try {
            ai = new GoogleGenAI({ apiKey: API_KEY });
            // Enable relevant buttons if they were disabled by default
            messageInput.disabled = false;
            messageInput.placeholder = "Type your message to 8B Ai...";
            sendButton.disabled = false; // Will be managed by loading state
            attachImageButton.disabled = false;
            newChatButton.disabled = false;
            speakNavbarButton.disabled = false;
            autoSpeakToggle.disabled = false;

            startNewChatSession(true);
        } catch (e) {
            console.error("Failed to initialize GoogleGenAI:", e);
            const errorMsg = `Failed to initialize AI. Error: ${e instanceof Error ? e.message : String(e)}. AI features will be disabled.`;
            appendMessage(errorMsg, 'ai');
            messageInput.disabled = true;
            messageInput.placeholder = "AI initialization failed";
            sendButton.disabled = true;
            attachImageButton.disabled = true;
            newChatButton.disabled = true;
            speakNavbarButton.disabled = true;
            autoSpeakToggle.disabled = true;
            loadingIndicator.style.display = 'none';
        }
    }
    updateSpeakButtonState(); // Update based on initial autoSpeakEnabled value
};

// Defer initialization until the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}