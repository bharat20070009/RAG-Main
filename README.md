# Air-Gap AI

Air-Gap AI is a completely offline, secure, browser-based AI document analyzer and chatbot. Built with privacy as the ultimate priority, no data ever leaves your device. It leverages local AI models (Llama 3.2) via Ollama, combined with a vector database (ChromaDB) to provide an intelligent conversational experience completely offline.

---

## Features

- **100% Offline & Private:** No cloud APIs, no data telemetry, no internet required. Your documents and chats stay strictly on your local machine.
- **Universal Document Support:** Chat directly with your files. Supports PDF, DOCX, XLSX, CSV, PPTX, MD, and TXT.
- **Persistent Chat History:** Seamlessly switch between past conversations with a sidebar that automatically saves your chat sessions.
- **Native Android Support:** Core architecture designed for seamless deployment to Android via Capacitor and MLC LLM.

---

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript (Zero-build architecture)
- **Backend:** Python, FastAPI
- **AI Engine:** Ollama (Running llama3.2)
- **Vector Database:** ChromaDB (Local persistent storage)
- **Document Processing:** Langchain, PyMuPDF, Unstructured

---

## Getting Started

### Prerequisites

1. **Python 3.10+** installed on your system.
2. **Ollama** installed and running on your local machine.

### Installation

1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/Bharat0Teja0Reddy/Projects.git
   ```

2. Run the automated installation script:
   Double-click the `Install_AirGap_AI.bat` file to automatically configure your environment.

3. **Start the application!**
   Double-click the `Start_LocalLens.bat` file.

---

## Project Structure

```text
Air Gap AI/
|
|-- public/                 # Frontend assets (HTML, CSS, JS, Logos)
|-- database/               # Secure offline storage (ChromaDB vectors, chats.json)
|-- docs/                   # Documentation and SRS specifications
|-- mobile_app/             # Capacitor Android Project codebase
|-- api_server.py           # Core FastAPI application backend
|-- Install_AirGap_AI.bat   # Windows one-click automated installer
|-- Start_LocalLens.bat     # Windows application launcher
|-- requirements.txt        # Python dependencies
|-- README.md               # Project documentation
```

---

## Architecture Note

When you upload a document, Air-Gap AI splits the text into chunks, generates vector embeddings, and securely stores them in a local `database/chroma_db` folder. Your persistent chat histories are securely stored in `database/chats.json`. All files and conversations remain strictly local.
