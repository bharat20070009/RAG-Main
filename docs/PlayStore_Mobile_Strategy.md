# Air-Gap AI: Mobile Edition (Play Store Strategy)

To launch **Air-Gap AI** on the Google Play Store, we must pivot the architecture. Currently, your app relies on desktop-class technologies (Python, FastAPI, and the Ollama Engine) which require a PC processor and 8GB+ of RAM. 

Android phones cannot run Python servers or the Ollama desktop engine natively. To maintain your **100% Offline & Private** guarantee on mobile, we need to rebuild the app using mobile-native technologies.

Here is the exact technical roadmap to get Air-Gap AI onto the Play Store:

## Phase 1: The Frontend (UI/UX)
Your current `index.html` interface is beautiful and fully responsive. We do not need to throw it away!
*   **Technology:** We will use **Capacitor.js** or **Ionic**.
*   **How it works:** Capacitor takes your existing HTML, CSS, and JS and wraps it into a native Android WebView, instantly converting your web UI into an installable `.apk` file.

## Phase 2: The Backend (On-Device AI Engine)
This is the most critical change. We must replace Python and Ollama with an engine designed for mobile GPU acceleration.
*   **Technology:** **MLC LLM** (Machine Learning Compilation for LLMs) or **Google AI Edge SDK**.
*   **How it works:** MLC LLM allows us to compile Llama 3.2 into a highly compressed format (using 4-bit quantization) that runs directly on an Android phone's GPU using Vulkan.
*   **The Model:** Instead of the heavy desktop Llama model, we will bundle the **Llama 3.2 1B (1 Billion Parameter)** model. It is small enough to fit inside a Play Store app download (approx. 1GB) and runs lightning fast on standard phones completely offline.

## Phase 3: The Vector Database (Memory)
Your current app uses `ChromaDB` running in Python for document memory.
*   **Technology:** **SQLite** with Vector Extensions (or a local JavaScript vector store like `hnswlib-wasm`).
*   **How it works:** When users upload documents on their phone, the app will chunk the text and store the vectors in a local encrypted SQLite database directly on their mobile device.

## Phase 4: Play Store Packaging
Once the app is running locally on an Android emulator:
1.  **Sign the App:** Generate a cryptographic keystore.
2.  **Compile to `.aab`:** Build the Android App Bundle format required by Google.
3.  **Publish:** Create a Google Play Console developer account, upload your screenshots, privacy policy (which is easy, since you collect 0 data!), and hit publish.

---

### Next Steps
Would you like me to initialize a **Capacitor Android Project** right now in this folder to begin converting your HTML interface into a mobile app?
