mermaid.initialize({ startOnLoad: false, theme: 'default' });

        const API_URL = 'http://127.0.0.1:8000';
        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const heroSection = document.getElementById('hero-section');
        const statusIndicator = document.getElementById('status-indicator');
        const memoryFilter = document.getElementById('memory-filter');
        const docList = document.getElementById('doc-list');
        const bootOverlay = document.getElementById('boot-overlay');
        
        let loadingMsgDiv = null;
        let currentMode = 'pdf';
        let currentChatId = null;
        
        function switchMode(mode) {
            currentMode = mode;
            document.getElementById('btn-mode-pdf').classList.toggle('active', mode === 'pdf');
            document.getElementById('btn-mode-general').classList.toggle('active', mode === 'general');
            
            const filterSelect = document.getElementById('memory-filter');
            if (mode === 'general') {
                filterSelect.disabled = true;
                chatInput.placeholder = "Ask general knowledge questions...";
            } else {
                filterSelect.disabled = false;
                chatInput.placeholder = "Ask AI to analyze your document...";
            }
        }

        function toggleSidebar() {
            const sidebar = document.querySelector('.sidebar');
            sidebar.classList.toggle('collapsed');
        }

        function cleanFilename(path) {
            return path.split('\\').pop().split('/').pop();
        }

        function handleKeyPress(event) { if (event.key === 'Enter') sendMessage(); }

        function showThinking(text = null) {
            if (!heroSection.classList.contains('hidden')) heroSection.classList.add('hidden');
            loadingMsgDiv = document.createElement('div');
            loadingMsgDiv.className = `message bot`;
            
            if (text) {
                loadingMsgDiv.innerHTML = `<strong>${text}</strong>`;
            } else {
                loadingMsgDiv.innerHTML = `
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>`;
            }
            chatMessages.appendChild(loadingMsgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function removeThinking() {
            if (loadingMsgDiv) {
                loadingMsgDiv.remove();
                loadingMsgDiv = null;
            }
        }

        async function appendMessage(text, sender) {
            if (!heroSection.classList.contains('hidden')) heroSection.classList.add('hidden');
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${sender}`;
            
            // Helper to format bold text and newlines
            function formatText(t) { return t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }
            
            function escapeHtml(unsafe) {
                return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
            }
            
            let htmlContent = "";
            let remainingText = text;

            // Simple parser for different blocks
            const blocks = remainingText.split(/(```mermaid|```chart|```python)/i);
            
            htmlContent += formatText(blocks[0]);
            
            for (let i = 1; i < blocks.length; i += 2) {
                const type = blocks[i].toLowerCase();
                const subParts = blocks[i+1].split(/```/);
                const code = subParts[0].trim();
                
                if (type === '```mermaid') {
                    htmlContent += `<pre class="mermaid">${escapeHtml(code)}</pre>`;
                } else if (type === '```chart') {
                    const canvasId = 'chart-' + Math.random().toString(36).substr(2, 9);
                    htmlContent += `<div style="background: #ffffff; padding: 1rem; border-radius: 12px; margin: 1rem 0;"><canvas id="${canvasId}" data-config='${escapeHtml(code)}'></canvas></div>`;
                } else if (type === '```python') {
                    htmlContent += `<div style="background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 8px; margin: 1rem 0; font-family: monospace; overflow-x: auto; position: relative;">
                        <pre style="margin: 0;">${escapeHtml(code)}</pre>
                        <button onclick="runPython(this)" style="position: absolute; top: 8px; right: 8px; background: #3b82f6; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Run Code</button>
                    </div>`;
                }
                
                if (subParts.length > 1) {
                    htmlContent += formatText(subParts.slice(1).join('```'));
                }
            }
            
            // Add TTS Speaker Button for bot
            if (sender === 'bot' || sender === 'assistant') {
                const plainText = text.replace(/```[\s\S]*?```/g, '').replace(/<[^>]*>?/gm, ''); // strip code and html
                htmlContent += `<button onclick="speakText('${escapeHtml(plainText.replace(/'/g, "\\'"))}')" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; display: block; margin-top: 8px;" title="Read Aloud">🔊 Read Aloud</button>`;
            }

            msgDiv.innerHTML = htmlContent;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Render Mermaid
            if (text.toLowerCase().includes('```mermaid')) {
                try { await mermaid.run({ nodes: msgDiv.querySelectorAll('.mermaid') }); } catch(e) {}
            }
            
            // Render Charts
            const canvases = msgDiv.querySelectorAll('canvas[id^="chart-"]');
            canvases.forEach(canvas => {
                try {
                    const config = JSON.parse(canvas.getAttribute('data-config'));
                    new Chart(canvas, config);
                } catch(e) {
                    console.error("Chart generation error:", e);
                }
            });
        }
        
        function speakText(text) {
            if (!('speechSynthesis' in window)) return;
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        }
        
        async function runPython(btn) {
            const code = btn.previousElementSibling.innerText;
            btn.innerText = "Running...";
            btn.disabled = true;
            try {
                const response = await fetch(`${API_URL}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: code })
                });
                const data = await response.json();
                appendMessage(`**Code Output:**\n${data.output}`, 'bot');
            } catch(e) {
                appendMessage(`**Error:** Failed to execute code.`, 'bot');
            }
            btn.innerText = "Run Code";
            btn.disabled = false;
        }

        async function fetchAvailableDocuments() {
            try {
                const response = await fetch(`${API_URL}/documents`);
                if (!response.ok) throw new Error("Server not ready");
                
                const data = await response.json();
                updateUIDocuments(data.documents);
                statusIndicator.innerHTML = '🟢 LocalLens is active. Strict Isolation Mode Enabled.';
                
                if (bootOverlay) {
                    bootOverlay.classList.add('hidden');
                    // Check setup and name after boot finishes
                                            setTimeout(async () => {
                            let setupComplete = false; // FORCE SETUP FOR TESTING
                            if (!setupComplete) {
                                document.getElementById('setup-overlay').classList.remove('hidden');
                                
                                // Automatically verify via backend
                                try {
                                    const sysResp = await fetch(`${API_URL}/system-check`);
                                    const checks = await sysResp.json();
                                    
                                    // RAM Check
                                    const stRam = document.getElementById('status-ram');
                                    if (checks.ram_ok) {
                                        stRam.innerText = '✅';
                                    } else {
                                        stRam.innerText = '❌';
                                    }
                                    
                                    // Ollama Check
                                    const stOllama = document.getElementById('status-ollama');
                                    if (checks.ollama_running) {
                                        stOllama.innerText = '✅';
                                    } else {
                                        stOllama.innerText = '❌';
                                        document.getElementById('btn-complete-setup').innerText = "Ollama is not running. Please start it.";
                                        return;
                                    }
                                    
                                    // Model Check & Download
                                    const stModel = document.getElementById('status-model');
                                    const modelDesc = document.getElementById('model-desc');
                                    const pbContainer = document.getElementById('progress-bar-container');
                                    const pbFill = document.getElementById('progress-bar-fill');
                                    const btn = document.getElementById('btn-complete-setup');
                                    
                                    if (checks.llama_downloaded) {
                                        stModel.innerText = '✅';
                                        modelDesc.innerText = 'Llama 3.2 is ready.';
                                        btn.innerText = "All Checks Passed! Starting...";
                                        setTimeout(completeSetup, 1500);
                                    } else {
                                        // Start Download!
                                        modelDesc.innerText = 'Downloading Llama 3.2...';
                                        pbContainer.classList.remove('hidden');
                                        btn.innerText = "Downloading AI Model...";
                                        
                                        try {
                                            const pullResp = await fetch(`${API_URL}/pull-model`);
                                            const reader = pullResp.body.getReader();
                                            const decoder = new TextDecoder();
                                            
                                            while (true) {
                                                const { done, value } = await reader.read();
                                                if (done) break;
                                                
                                                const lines = decoder.decode(value).split('\\n');
                                                for (let line of lines) {
                                                    if (!line.trim()) continue;
                                                    try {
                                                        const pData = JSON.parse(line);
                                                        if (pData.completed && pData.total) {
                                                            const percent = Math.round((pData.completed / pData.total) * 100);
                                                            pbFill.style.width = `${percent}%`;
                                                            modelDesc.innerText = `Downloading Llama 3.2: ${percent}%`;
                                                        } else if (pData.status) {
                                                            modelDesc.innerText = pData.status;
                                                        }
                                                    } catch(e){}
                                                }
                                            }
                                            
                                            // Done!
                                            pbFill.style.width = '100%';
                                            stModel.innerText = '✅';
                                            modelDesc.innerText = 'Llama 3.2 downloaded successfully!';
                                            btn.innerText = "All Checks Passed! Starting...";
                                            setTimeout(completeSetup, 1500);
                                            
                                        } catch(e) {
                                            stModel.innerText = '❌';
                                            modelDesc.innerText = 'Failed to download model.';
                                            btn.innerText = "Setup Failed.";
                                        }
                                    }
                                    
                                } catch(e) {
                                    console.log("System check failed", e);
                                    document.getElementById('btn-complete-setup').innerText = "System check failed to connect to backend.";
                                }
                            } else {
                                showNamePrompt();
                            }
                        }, 600); // Wait for boot overlay fade out
                }
            } catch (error) {
                statusIndicator.innerHTML = '🟡 AI Engine is booting up... Please wait.';
                setTimeout(fetchAvailableDocuments, 500);
            }
        }

        function showNamePrompt() {
            let userName = localStorage.getItem('operatorName');
            if (!userName) {
                document.getElementById('name-overlay').classList.remove('hidden');
                document.getElementById('operator-name-input').focus();
            } else {
                document.querySelector('.hero-title').innerText = `Welcome, ${userName}`;
            }
        }

        

        function completeSetup() {
            localStorage.setItem('setupComplete', 'true');
            document.getElementById('setup-overlay').classList.add('hidden');
            showNamePrompt();
        }

        function submitName() {
            const input = document.getElementById('operator-name-input');
            let userName = input.value.trim();
            if (userName) {
                localStorage.setItem('operatorName', userName);
            } else {
                userName = "Operator";
            }
            document.querySelector('.hero-title').innerText = `Welcome, ${userName}`;
            document.getElementById('name-overlay').classList.add('hidden');
        }

        async function fetchChats() {
            try {
                const response = await fetch(`${API_URL}/chats`);
                if (response.ok) {
                    const chats = await response.json();
                    updateUIChats(chats);
                }
            } catch(e) { console.log(e); }
        }

        function updateUIChats(chats) {
            const chatList = document.getElementById('chat-list');
            const notebookList = document.getElementById('notebook-list');
            chatList.innerHTML = '';
            notebookList.innerHTML = '';
            
            chats.reverse().forEach(chat => {
                const pill = document.createElement('div');
                pill.className = 'doc-pill';
                pill.style.cursor = 'pointer';
                if (chat.chat_id === currentChatId) {
                    pill.style.background = 'var(--pill-hover)';
                    pill.style.borderLeft = '2px solid var(--accent-color)';
                }
                pill.innerHTML = `
                    <span title="${chat.title}" onclick="loadChat('${chat.chat_id}')" style="flex: 1;">${chat.title}</span>
                    <button class="delete-btn" onclick="deleteChat(event, '${chat.chat_id}')" title="Delete">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
                
                if (chat.focus && chat.focus.trim() !== '') {
                    notebookList.appendChild(pill);
                } else {
                    chatList.appendChild(pill);
                }
            });
        }

        async function loadChat(chatId) {
            try {
                const response = await fetch(`${API_URL}/chats/${chatId}`);
                if (response.ok) {
                    const chat = await response.json();
                    currentChatId = chatId;
                    chatMessages.innerHTML = '';
                    
                    if (chat.messages && chat.messages.length > 0) {
                        heroSection.classList.add('hidden');
                        chat.messages.forEach(msg => {
                            appendMessage(msg.content, msg.role);
                        });
                    } else {
                        heroSection.classList.remove('hidden');
                        document.querySelector('.hero-title').innerText = chat.title || "New Notebook";
                        if (chat.focus) {
                            document.querySelector('.hero-subtitle').innerText = "Focus: " + chat.focus;
                        } else {
                            let userName = localStorage.getItem('operatorName') || "Operator";
                            document.querySelector('.hero-subtitle').innerText = "Secure, offline intelligence. How can I help you today?";
                        }
                    }
                    
                    fetchChats();
                }
            } catch(e) { console.log("Failed to load chat", e); }
        }

        function showConfirmModal(title, message, onProceed) {
            document.getElementById('confirm-title').innerText = title;
            document.getElementById('confirm-message').innerText = message;
            
            const overlay = document.getElementById('confirm-overlay');
            const btnCancel = document.getElementById('confirm-cancel');
            const btnProceed = document.getElementById('confirm-proceed');
            
            // Clear old listeners
            btnCancel.onclick = null;
            btnProceed.onclick = null;
            
            btnCancel.onclick = () => { overlay.classList.add('hidden'); };
            btnProceed.onclick = async () => {
                overlay.classList.add('hidden');
                await onProceed();
            };
            
            overlay.classList.remove('hidden');
        }

        function deleteChat(event, chatId) {
            event.stopPropagation();
            showConfirmModal("Delete Chat", "Are you sure you want to permanently delete this conversation?", async () => {
                try {
                    await fetch(`${API_URL}/chats/${chatId}`, { method: 'DELETE' });
                    if (currentChatId === chatId) startNewChat();
                    else fetchChats();
                } catch(e) {}
            });
        }

        async function fetchBriefings() {
            try {
                const response = await fetch(`${API_URL}/briefings`);
                if (response.ok) {
                    const data = await response.json();
                    updateUIBriefings(data);
                }
            } catch(e) { console.error("Failed to fetch briefings", e); }
        }

        function updateUIBriefings(briefings) {
            const briefingsList = document.getElementById('briefings-list');
            if(!briefingsList) return;
            briefingsList.innerHTML = '';
            
            Object.keys(briefings).forEach(filename => {
                const pill = document.createElement('div');
                pill.className = 'doc-pill';
                pill.style.cursor = 'pointer';
                const cleanName = cleanFilename(filename);
                pill.innerHTML = `<span title="${cleanName}" style="flex: 1;">${cleanName}</span>`;
                pill.onclick = () => showBriefing(filename, briefings[filename]);
                briefingsList.appendChild(pill);
            });
        }
        
        function showBriefing(filename, content) {
            currentChatId = null;
            chatMessages.innerHTML = '';
            heroSection.classList.add('hidden');
            
            // Format the content
            const formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
            
            const msgDiv = document.createElement('div');
            msgDiv.className = `message bot`;
            msgDiv.innerHTML = `<h3 style="margin-top:0; color: var(--accent-color);">Executive Briefing: ${cleanFilename(filename)}</h3><div style="font-size: 0.95em; line-height: 1.5;">${formatted}</div>`;
            
            chatMessages.appendChild(msgDiv);
        }

        function updateUIDocuments(documents) {
            const currentSelection = memoryFilter.value;
            docList.innerHTML = '';
            memoryFilter.innerHTML = '<option value="All Documents">Target: All Documents</option>';

            documents.forEach(docPath => {
                const cleanName = cleanFilename(docPath);

                const pill = document.createElement('div');
                pill.className = 'doc-pill';
                pill.innerHTML = `
                    <span title="${cleanName}">${cleanName}</span>
                    <button class="delete-btn" onclick="deleteDocument('${docPath.replace(/\\/g, '\\\\')}')" title="Remove file">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
                docList.appendChild(pill);

                const option = document.createElement('option');
                option.value = docPath;
                option.text = `File: ${cleanName}`;
                memoryFilter.appendChild(option);
            });

            if (documents.includes(currentSelection)) memoryFilter.value = currentSelection;
        }

        function deleteDocument(docPath) {
            showConfirmModal("Remove Document", `Remove "${cleanFilename(docPath)}" from the knowledge base?`, async () => {
                try {
                    await fetch(`${API_URL}/delete`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ document_name: docPath })
                    });
                    if (memoryFilter.value === docPath) memoryFilter.value = "All Documents";
                    fetchAvailableDocuments();
                } catch (e) { alert("Failed to delete."); }
            });
        }

        function clearDatabase() {
            showConfirmModal("Wipe Database", "Permanently wipe the entire knowledge base? This action cannot be undone.", async () => {
                try {
                    await fetch(`${API_URL}/clear`, { method: 'POST' });
                    fetchAvailableDocuments();
                } catch (e) { alert("Failed to wipe database."); }
            });
        }

        async function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const isImage = ['image/jpeg', 'image/png', 'image/jpg'].includes(file.type) || file.name.match(/\.(jpg|jpeg|png)$/i);
            
            appendMessage(`Uploading <b>${file.name}</b>...`, 'user');
            
            if (isImage) {
                showThinking("👁️ Waking up Vision Model... (Processing images takes extra time to protect your memory limit)");
            } else {
                showThinking("📄 Reading document and analyzing text...");
            }
            
            const formData = new FormData();
            formData.append("file", file);

            try {
                const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
                removeThinking();
                if (!response.ok) throw new Error('Upload failed');
                appendMessage(`✅ Processed successfully.`, 'bot');
                fetchAvailableDocuments();
            } catch (error) {
                removeThinking();
                appendMessage(`❌ Error: ${error.message}. Make sure server is running.`, 'bot');
            }
            event.target.value = '';
        }

        async function sendMessage() {
            const text = chatInput.value.trim();
            if (!text) return;
            const selectedDoc = memoryFilter.value;

            let displayMessage = text;
            if (currentMode === 'pdf' && selectedDoc && selectedDoc !== "All Documents") {
                const cleanName = cleanFilename(selectedDoc);
                displayMessage = `<div style="font-size: 0.75em; opacity: 0.6; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Target: ${cleanName}</div>${text}`;
            } else if (currentMode === 'pdf' && selectedDoc === "All Documents") {
                displayMessage = `<div style="font-size: 0.75em; opacity: 0.6; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Target: All Documents</div>${text}`;
            }

            appendMessage(displayMessage, 'user');
            chatInput.value = '';
            
            showThinking();

            const isAirlock = document.getElementById('airlock-toggle').checked;
            try {
                const response = await fetch(`${API_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message: text, 
                        document_name: selectedDoc,
                        mode: currentMode,
                        chat_id: currentChatId,
                        airlock_enabled: isAirlock
                    })
                });
                removeThinking();
                if (!response.ok) {
                    let errDetail = "Connection Error";
                    try {
                        const errData = await response.json();
                        errDetail = errData.detail || errDetail;
                    } catch(e) {}
                    throw new Error(errDetail);
                }
                const data = await response.json();
                
                if (data.chat_id) {
                    currentChatId = data.chat_id;
                    fetchChats(); // Refresh sidebar to show new chat
                }
                
                appendMessage(data.response, 'assistant');
            } catch (error) {
                removeThinking();
                appendMessage(`❌ Error: ${error.message}`, 'assistant');
            }
        }

        function initNeuralCore() {
            const container = document.getElementById('mask-canvas-container');
            container.innerHTML = ''; 
            const scene = new THREE.Scene();
            
            const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
            camera.position.z = 6;

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(320, 320);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);

            // 1. Inner Core (Solid glowing sphere)
            const coreGeometry = new THREE.IcosahedronGeometry(1.0, 4); // Smoother sphere
            const coreMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0x4f46e5, // Brand accent color
                emissiveIntensity: 0.8,
                roughness: 0.1,
                metalness: 0.8
            });
            const core = new THREE.Mesh(coreGeometry, coreMaterial);
            scene.add(core);

            // 2. Outer Shell (Wireframe geometric structure)
            const shellGeometry = new THREE.IcosahedronGeometry(1.5, 1);
            const shellMaterial = new THREE.MeshBasicMaterial({
                color: 0x64748b,
                wireframe: true,
                transparent: true,
                opacity: 0.2
            });
            const shell = new THREE.Mesh(shellGeometry, shellMaterial);
            scene.add(shell);
            
            // 3. Orbiting Data Particles
            const particleGeom = new THREE.BufferGeometry();
            const particleCount = 100;
            const posArray = new Float32Array(particleCount * 3);
            for(let i=0; i<particleCount*3; i++) {
                posArray[i] = (Math.random() - 0.5) * 5;
            }
            particleGeom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
            const particleMat = new THREE.PointsMaterial({
                size: 0.05,
                color: 0x4f46e5,
                transparent: true,
                opacity: 0.6
            });
            const particles = new THREE.Points(particleGeom, particleMat);
            scene.add(particles);

            // 4. Studio Lighting
            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            
            const blueLight = new THREE.DirectionalLight(0x4f46e5, 2);
            blueLight.position.set(-5, 5, 5);
            scene.add(blueLight);

            const warmLight = new THREE.DirectionalLight(0xf43f5e, 1.5);
            warmLight.position.set(5, -5, 5);
            scene.add(warmLight);

            // 5. Animation Loop
            const clock = new THREE.Clock();
            function animate() {
                requestAnimationFrame(animate);
                const t = clock.getElapsedTime();
                
                // Pulse and rotate core
                core.rotation.y += 0.003;
                core.rotation.x += 0.004;
                core.scale.setScalar(1 + Math.sin(t * 2) * 0.04); 
                
                // Slow reverse rotate shell
                shell.rotation.y -= 0.002;
                shell.rotation.z += 0.001;
                
                // Float and rotate particles
                particles.rotation.y = t * 0.1;
                particles.position.y = Math.sin(t * 0.5) * 0.2;

                renderer.render(scene, camera);
            }
            animate();
        }

        async function startNewChat() {
            chatMessages.innerHTML = '';
            heroSection.classList.remove('hidden');
            currentChatId = null;
            fetchChats();
        }

        async function submitNewNotebook() {
            const titleInput = document.getElementById('nb-title-input').value.trim();
            const focusInput = document.getElementById('nb-focus-input').value.trim();
            
            if (!titleInput) {
                alert("Please provide a title for your notebook.");
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/notebooks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: titleInput, focus: focusInput })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    document.getElementById('notebook-overlay').classList.add('hidden');
                    document.getElementById('nb-title-input').value = '';
                    document.getElementById('nb-focus-input').value = '';
                    
                    // Display notebook title in hero section
                    document.querySelector('.hero-title').innerText = data.title;
                    if (data.focus) {
                        document.querySelector('.hero-subtitle').innerText = "Focus: " + data.focus;
                    } else {
                        document.querySelector('.hero-subtitle').innerText = "Secure, offline intelligence.";
                    }
                    
                    loadChat(data.chat_id);
                }
            } catch(e) {
                console.error("Failed to create notebook", e);
            }
        }

        // OFFLINE VOICE DICTATION (RAW PCM TO BACKEND)
        let audioContext;
        let mediaStreamSource;
        let scriptProcessor;
        let audioChunks = [];
        let isDictating = false;
        
        async function toggleVoice() {
            const micBtn = document.getElementById('btn-mic');
            
            if (isDictating) {
                isDictating = false;
                micBtn.style.color = '#94a3b8';
                
                // Stop recording
                if (scriptProcessor && mediaStreamSource) {
                    scriptProcessor.disconnect();
                    mediaStreamSource.disconnect();
                }
                
                chatInput.value = "Transcribing offline... please wait.";
                
                // Convert chunks to Float32Array
                let totalLength = 0;
                for (let chunk of audioChunks) totalLength += chunk.length;
                let result = new Float32Array(totalLength);
                let offset = 0;
                for (let chunk of audioChunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                }
                
                // Convert to 16-bit PCM Blob
                let buffer = new ArrayBuffer(result.length * 2);
                let view = new DataView(buffer);
                for (let i = 0; i < result.length; i++) {
                    let s = Math.max(-1, Math.min(1, result[i]));
                    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                }
                
                const blob = new Blob([buffer], { type: 'application/octet-stream' });
                
                const formData = new FormData();
                formData.append('audio', blob, 'audio.pcm');
                
                try {
                    const response = await fetch(`${API_URL}/transcribe`, {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    chatInput.value = data.text;
                    if (data.text.trim()) sendMessage();
                } catch(e) {
                    chatInput.value = "";
                    alert("Failed to transcribe audio.");
                }
                
                return;
            }
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                mediaStreamSource = audioContext.createMediaStreamSource(stream);
                scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                
                audioChunks = [];
                isDictating = true;
                micBtn.style.color = '#ef4444'; // Red
                chatInput.value = "Listening... Click mic again to stop.";
                
                scriptProcessor.onaudioprocess = function(e) {
                    if (!isDictating) return;
                    audioChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
                };
                
                mediaStreamSource.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);
            } catch (e) {
                alert("Microphone access denied or unavailable.");
            }
        }

        window.onload = () => {
            initNeuralCore();
            fetchAvailableDocuments();
            fetchChats();
            fetchBriefings();
            setInterval(fetchBriefings, 5000); // Check for new auto-briefings every 5s
        };