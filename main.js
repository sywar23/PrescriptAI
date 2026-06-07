document.addEventListener('DOMContentLoaded', () => {
    // Reveal on scroll
    const revealElements = document.querySelectorAll('.reveal');
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => revealObserver.observe(el));

    // Parallax Effect for Hero
    const heroSection = document.querySelector('.hero-section');
    const heroImage = document.querySelector('.hero-image');
    const heroWave = document.querySelector('.hero-bg-wave');

    if (heroSection) {
        heroSection.addEventListener('mousemove', (e) => {
            const { clientX, clientY } = e;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            
            const moveX = (clientX - centerX) / 50;
            const moveY = (clientY - centerY) / 50;

            if (heroImage) {
                heroImage.style.transform = `translate(${moveX}px, ${moveY}px)`;
            }
            if (heroWave) {
                heroWave.style.transform = `translate(${-moveX / 2}px, ${-moveY / 2}px) scale(1.05)`;
            }
        });
    }

    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === "#") return; // Let default behavior happen or ignore

            e.preventDefault();
            try {
                const target = document.querySelector(href);
                if (target) {
                    window.scrollTo({
                        top: target.offsetTop - 80, // Offset for header
                        behavior: 'smooth'
                    });
                }
            } catch (err) {
                console.warn("Scroll target not found:", href);
            }
        });
    });
    // Chatbot Toggle Logic
    const chatTrigger = document.getElementById('chatTrigger');
    const chatWindow = document.getElementById('chatWindow');
    const closeChat = document.getElementById('closeChat');

    if (chatTrigger && chatWindow) {
        chatTrigger.addEventListener('click', () => {
            chatWindow.classList.toggle('active');
        });
    }

    if (closeChat && chatWindow) {
        closeChat.addEventListener('click', () => {
            chatWindow.classList.remove('active');
        });
    }

    // ---- LIVE CHAT LOGIC FOR INDEX PAGE ----
    const chatInputIndex = document.getElementById('chat-input-index');
    const chatSendIndex = document.getElementById('chat-send-index');
    const chatMessagesIndex = document.getElementById('chat-messages-index');
    let chatHistory = [];

    async function sendChatIndex() {
        const msg = chatInputIndex.value.trim();
        if(!msg) return;

        appendMsg('user', msg);
        chatInputIndex.value = '';

        // Créer la bulle du bot à l'avance pour le stream
        const botMsgDiv = document.createElement('div');
        botMsgDiv.className = 'message bot';
        botMsgDiv.innerHTML = `<div class="bubble"><i class="fa-solid fa-ellipsis fa-fade"></i></div>`;
        chatMessagesIndex.appendChild(botMsgDiv);
        const bubble = botMsgDiv.querySelector('.bubble');
        chatMessagesIndex.scrollTop = chatMessagesIndex.scrollHeight;

        try {
            const response = await fetch('./api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, history: chatHistory, lang: 'fr' })
            });

            if (!response.ok) throw new Error("Server error");

            bubble.innerHTML = ''; // Nettoyage de l'icône de chargement
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let currentStatus = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                
                // --- Gestion du STATUS ---
                if (chunk.includes('[STATUS]')) {
                    const statusMatch = chunk.match(/\[STATUS\]([^\[\n|]+)/);
                    if (statusMatch) {
                        currentStatus = statusMatch[1];
                        bubble.innerHTML = `<div style="font-size:0.75rem; color:#64748b; font-style:italic;"><i class="fa-solid fa-spinner fa-spin-pulse" style="margin-right:8px;"></i>${currentStatus}</div>`;
                        continue;
                    }
                }

                fullText += chunk;
                
                // Parsing des sources et confidence score
                if (fullText.includes('|SOURCES|')) {
                    const parts = fullText.split('|SOURCES|');
                    const messageBody = parts[0].trim();
                    const afterSources = parts[1] || "";
                    
                    const subParts = afterSources.split('|CONFIDENCE|');
                    const sourcesList = subParts[0] ? subParts[0].split(',').filter(s => s.trim() !== "") : [];
                    const confidenceScore = subParts[1] || "0";

                    let displayHtml = messageBody.replace(/\[MED_INFO\]/g, '').replace(/\n/g, '<br>').trim();
                    
                    const scoreInt = parseInt(confidenceScore);
                    const scoreColor = scoreInt > 80 ? '#10b981' : '#f59e0b';
                    let confidenceHtml = "";
                    
                    if (scoreInt > 0) {
                        confidenceHtml = `
                            <div style="margin-top:10px; display:flex; align-items:center; gap:8px; padding:6px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
                                <div style="flex:1;">
                                    <div style="display:flex; justify-content:space-between; font-size:0.55rem; font-weight:700; color:#64748b; margin-bottom:2px;">
                                        <span>CONFIANCE</span>
                                        <span style="color:${scoreColor}">${confidenceScore}%</span>
                                    </div>
                                    <div style="width:100%; height:3px; background:#e2e8f0; border-radius:2px; overflow:hidden;">
                                        <div style="width:${confidenceScore}%; height:100%; background:${scoreColor}; transition:width 1s ease;"></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }

                    if (sourcesList.length > 0) {
                        const sourceTags = sourcesList.map(s => `
                            <div class="premium-source-badge" style="display:inline-flex; align-items:center; gap:5px; background:#eff6ff; color:#2563eb; padding:4px 10px; border-radius:8px; font-size:0.7rem; border:1px solid #dbeafe; margin-top:5px; margin-right:5px;">
                                <i class="fa-solid fa-file-shield"></i>
                                <span>${s.trim()}</span>
                            </div>
                        `).join('');
                        displayHtml += `<div style="margin-top:10px; border-top:1px solid #e2e8f0; padding-top:8px;">
                            <div style="font-size:0.6rem; font-weight:800; color:#94a3b8; margin-bottom:5px;">SOURCES VÉRIFIÉES :</div>
                            ${sourceTags}
                            ${confidenceHtml}
                        </div>`;
                    } else {
                        displayHtml += confidenceHtml;
                    }
                    bubble.innerHTML = displayHtml;
                } else {
                    bubble.innerHTML = fullText.replace(/\[MED_INFO\]/g, '').replace(/\n/g, '<br>');
                }
                chatMessagesIndex.scrollTop = chatMessagesIndex.scrollHeight;
            }

            chatHistory.push({ role: 'user', content: msg });
            chatHistory.push({ role: 'assistant', content: fullText });

        } catch (error) {
            console.error("❌ Chat Error:", error);
            bubble.innerHTML = "Erreur de connexion avec le serveur PrescriptIA.";
        }
    }

    function appendMsg(role, text) {
        if (!chatMessagesIndex) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.innerHTML = `<div class="bubble">${text.replace(/\n/g, '<br>')}</div>`;
        chatMessagesIndex.appendChild(msgDiv);
        chatMessagesIndex.scrollTop = chatMessagesIndex.scrollHeight;
    }

    if (chatSendIndex) {
        chatSendIndex.addEventListener('click', (e) => {
            e.preventDefault();
            sendChatIndex();
        });
    }
    if (chatInputIndex) {
        chatInputIndex.addEventListener('keypress', (e) => { 
            if(e.key === 'Enter') {
                e.preventDefault();
                sendChatIndex();
            }
        });
    }
});
