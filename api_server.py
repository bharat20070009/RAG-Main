import os
import tempfile
import base64
import requests
import traceback
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- CRITICAL FOR TRUE OFFLINE MODE ---
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
# --------------------------------------

from langchain_core.documents import Document
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader, CSVLoader, UnstructuredExcelLoader, UnstructuredPowerPointLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io

import json
import uuid

# Optional: Point to Tesseract binary if not in system PATH
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = FastAPI()

# Allow all origins so the browser doesn't block the upload with a CORS "Failed to fetch" error
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="."), name="static")

@app.get("/")
async def serve_ui():
    return FileResponse("public/index.html")

@app.get("/locallens_logo.jpg")
async def serve_logo():
    return FileResponse("public/locallens_logo.jpg")

@app.get("/favicon.ico")
async def serve_favicon():
    return FileResponse("public/favicon.ico")

@app.get("/style.css")
async def serve_css():
    return FileResponse("public/style.css")

@app.get("/script.js")
async def serve_js():
    return FileResponse("public/script.js")

import psutil

@app.get("/system-check")
async def system_check():
    checks = {
        "ollama_running": False,
        "llama_downloaded": False,
        "ram_ok": False
    }
    
    # 1. Check RAM (needs 8GB total, which is 8 * 1024^3 bytes)
    total_ram_gb = psutil.virtual_memory().total / (1024**3)
    if total_ram_gb >= 7.5: # Allow some leniency
        checks["ram_ok"] = True
        
    # 2 & 3. Check Ollama and Model
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=2)
        if resp.status_code == 200:
            checks["ollama_running"] = True
            models = resp.json().get("models", [])
            for m in models:
                if "llama3.2" in m.get("name", ""):
                    checks["llama_downloaded"] = True
                    break
    except Exception:
        pass
        
    return checks

from fastapi.responses import StreamingResponse
import json

@app.get("/pull-model")
async def pull_model():
    def generate():
        try:
            with requests.post("http://localhost:11434/api/pull", json={"name": "llama3.2", "stream": True}, stream=True) as resp:
                for line in resp.iter_lines():
                    if line:
                        yield line.decode('utf-8') + "\n"
        except Exception as e:
            yield json.dumps({"error": str(e)}) + "\n"
            
    return StreamingResponse(generate(), media_type="application/x-ndjson")

CHATS_FILE = "database/chats.json"

def load_chats():
    if not os.path.exists(CHATS_FILE):
        return {}
    try:
        with open(CHATS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def save_chats(chats):
    with open(CHATS_FILE, "w", encoding="utf-8") as f:
        json.dump(chats, f, indent=4)

BRIEFINGS_FILE = "database/briefings.json"

def load_briefings():
    if os.path.exists(BRIEFINGS_FILE):
        try:
            with open(BRIEFINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_briefings(briefings):
    with open(BRIEFINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(briefings, f, indent=4)

from typing import Optional
import sys
import subprocess
import tempfile

class ExecuteRequest(BaseModel):
    code: str

@app.post("/execute")
async def execute_code(req: ExecuteRequest):
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(req.code)
            temp_path = f.name
            
        result = subprocess.run([sys.executable, temp_path], capture_output=True, text=True, timeout=15)
        
        output = result.stdout
        if result.stderr:
            output += "\nErrors:\n" + result.stderr
            
        return {"output": output or "Code executed successfully with no output."}
    except subprocess.TimeoutExpired:
        return {"output": "Error: Code execution timed out after 15 seconds."}
    except Exception as e:
        return {"output": f"Error executing code: {str(e)}"}

import numpy as np

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    global whisper_pipe
    if not whisper_pipe:
        raise HTTPException(status_code=503, detail="Whisper is still loading.")
    try:
        content = await audio.read()
        # content is raw 16-bit PCM little endian at 16000 Hz from the browser
        audio_array = np.frombuffer(content, dtype=np.int16).astype(np.float32) / 32768.0
        result = whisper_pipe(audio_array)
        return {"text": result.get("text", "")}
    except Exception as e:
        print("Transcription error:", e)
        raise HTTPException(status_code=500, detail=str(e))

class ChatRequest(BaseModel):
    message: str
    document_name: Optional[str] = None
    mode: str = "pdf"
    chat_id: Optional[str] = None
    airlock_enabled: bool = False
    
class DeleteRequest(BaseModel):
    document_name: str

class NotebookRequest(BaseModel):
    title: str
    focus: str

@app.post("/notebooks")
async def create_notebook(req: NotebookRequest):
    chats = load_chats()
    chat_id = str(uuid.uuid4())
    chats[chat_id] = {
        "title": req.title,
        "focus": req.focus,
        "messages": []
    }
    save_chats(chats)
    return {"chat_id": chat_id, "title": req.title, "focus": req.focus}

import threading

vector_db = None
db_loaded = False
embeddings = None
whisper_pipe = None

def load_ai_models():
    global vector_db, db_loaded, embeddings, whisper_pipe
    print("Loading Local Embedding Model in background (Fast Startup Mode)...")
    try:
        embeddings = HuggingFaceEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={'device': 'cpu'}
        )
        print("Loading local vector database...")
        if embeddings:
            vector_db = Chroma(persist_directory="./database/chroma_db", embedding_function=embeddings)
            db_loaded = True
            print("Database and Embeddings loaded successfully! System fully ready.")
            
        print("Loading Offline Whisper Voice Model...")
        from transformers import pipeline
        whisper_pipe = pipeline("automatic-speech-recognition", model="openai/whisper-tiny.en")
        print("Whisper Voice Model Ready.")
    except Exception as e:
        print(f"CRITICAL ERROR loading models: {e}")

# Start model loading in the background so the server binds to port 8000 instantly
threading.Thread(target=load_ai_models, daemon=True).start()

@app.get("/documents")
async def get_documents():
    if db_loaded and vector_db:
        try:
            data = vector_db.get()
            unique_sources = set()
            for meta in data.get("metadatas", []):
                if meta and "source" in meta:
                    unique_sources.add(meta["source"])
            return {"documents": list(unique_sources)}
        except Exception as e:
            print(f"Error reading documents: {e}")
    return {"documents": []}

@app.post("/clear")
async def clear_database():
    global vector_db, db_loaded
    try:
        if db_loaded and vector_db:
            # Fetch all existing document IDs and delete them to wipe the slate clean
            existing_data = vector_db.get()
            ids_to_delete = existing_data.get("ids", [])
            if ids_to_delete:
                vector_db.delete(ids=ids_to_delete)
            return {"message": "Database wiped successfully."}
        return {"message": "Database is already empty."}
    except Exception as e:
        print(f"❌ CLEAR ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chats")
async def get_chats():
    chats = load_chats()
    return [{"chat_id": k, "title": v.get("title", "New Chat"), "focus": v.get("focus", "")} for k, v in chats.items()]

@app.get("/chats/{chat_id}")
async def get_chat_history(chat_id: str):
    chats = load_chats()
    if chat_id in chats:
        return chats[chat_id]
    raise HTTPException(status_code=404, detail="Chat not found")

@app.get("/briefings")
async def get_briefings():
    return load_briefings()

@app.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    chats = load_chats()
    if chat_id in chats:
        del chats[chat_id]
        save_chats(chats)
        return {"message": "Deleted"}
    return {"message": "Not found"}

@app.post("/delete")
async def delete_document(request: DeleteRequest):
    global vector_db, db_loaded
    try:
        if db_loaded and vector_db:
            print(f"Deleting all chunks for document: {request.document_name}")
            existing_data = vector_db.get()
            ids_to_delete = []
            
            # Find all chunks that match the specific document name
            for i, metadata in enumerate(existing_data.get("metadatas", [])):
                if metadata and metadata.get("source") == request.document_name:
                    ids_to_delete.append(existing_data["ids"][i])
            
            if ids_to_delete:
                vector_db.delete(ids=ids_to_delete)
                return {"message": f"Successfully deleted {request.document_name}."}
            return {"message": "Document not found in database."}
        return {"message": "Database is empty."}
    except Exception as e:
        print(f"❌ DELETE ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_with_ai(request: ChatRequest):
    global db_loaded
    if request.mode != "general" and not db_loaded:
        raise HTTPException(status_code=503, detail="AI Engine is still warming up the document scanner. Please wait a few seconds and try again.")
        
    # Eject Vision model from VRAM to make room for Chat model
    def eject_vision():
        try:
            requests.post("http://localhost:11434/api/generate", json={"model": "llava", "keep_alive": 0}, timeout=2)
        except:
            pass
    threading.Thread(target=eject_vision, daemon=True).start()
        
    chats = load_chats()
    chat_id = request.chat_id
    
    if not chat_id or chat_id not in chats:
        chat_id = str(uuid.uuid4())
        chats[chat_id] = {"title": "New Conversation", "messages": []}
        
        # Ask LLM to generate a quick 3-5 word summary title for this query in background
        def generate_title(cid, msg):
            try:
                title_payload = {
                    "model": "llama3.2",
                    "messages": [
                        {"role": "system", "content": "You are a helpful AI that summarizes user queries into very short, concise titles. Output ONLY the title (maximum 5 words), no quotes, no extra text."},
                        {"role": "user", "content": f"Summarize this query into a title: {msg}"}
                    ],
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 10}
                }
                title_resp = requests.post("http://localhost:11434/api/chat", json=title_payload, timeout=5)
                title = title_resp.json().get("message", {}).get("content", "").strip().replace('"', '')
                if title:
                    chats = load_chats()
                    if cid in chats:
                        chats[cid]["title"] = title
                        save_chats(chats)
            except Exception as e:
                print("Failed to generate title:", e)
                
        threading.Thread(target=generate_title, args=(chat_id, request.message), daemon=True).start()
    
    chat_history = chats[chat_id]["messages"]

    try:
        from duckduckgo_search import DDGS
    except ImportError:
        pass

    try:
        if request.mode == "general":
            system_message = "You are a highly intelligent, friendly, and expert AI assistant (similar to ChatGPT or Gemini Advanced). Your primary goal is to provide deeply satisfying, comprehensive, and highly informative answers. Explain concepts thoroughly, exploring the 'why' and 'how'. Use formatting like headers, bullet points, and bold text to make your long, detailed responses easy to read. Use analogies, scenarios, and examples to make your answers engaging and understandable."
            
            if request.airlock_enabled:
                try:
                    web_results = DDGS().text(request.message, max_results=1)
                    web_context = "\n\n".join([f"Source ({r['href']}):\n{r['body']}" for r in web_results])
                    system_message += f"\n\nLIVE WEB CONTEXT:\n{web_context}"
                except Exception as e:
                    print("Web search failed:", e)
                    
            llm_user_msg = request.message
        else:
            context_text = "No context found."
            
            if db_loaded and vector_db:
                # Increase K to provide much more context to the LLM (helps with summarization)
                search_kwargs = {"k": 12}
                if request.document_name and request.document_name != "All Documents":
                    # Strictly filter ChromaDB search to ONLY the selected document
                    search_kwargs["filter"] = {"source": request.document_name}
                
                results = vector_db.similarity_search(request.message, **search_kwargs)
                if results:
                    context_text = "\n\n".join([doc.page_content for doc in results])

            if request.airlock_enabled:
                try:
                    web_results = DDGS().text(request.message, max_results=1)
                    web_context = "\n\n".join([f"Source ({r['href']}):\n{r['body']}" for r in web_results])
                    context_text += f"\n\n--- LIVE WEB CONTEXT ---\n{web_context}"
                except Exception as e:
                    print("Web search failed:", e)

            system_message = """You are an expert, highly intelligent Document Analyzer and General Assistant (like ChatGPT or Gemini Advanced). 
            First, attempt to answer the user's question using the provided Context.
            If the answer to a specific factual question is completely absent from the Context, you MUST use your own vast general knowledge to answer the question thoroughly, but kindly mention in a brief sentence that you are answering from general knowledge since it was not found in the uploaded documents.
            Your primary goal is to be profoundly helpful, providing deep, satisfying, and highly informative answers. 
            Do not just give brief answers; elaborate comprehensively. Explain the 'why' and 'how'.
            Structure your responses beautifully using Markdown: use bold text, bullet points, numbered lists, and headers (###) to organize information clearly.
            Break down complex information into simple, easy-to-understand explanations using analogies and real-world scenarios where applicable.
            If the user asks for a summary, provide a rich, detailed, multi-paragraph summary.
            If the user asks for a flowchart, graph, or diagram, generate valid Mermaid.js code enclosed in ```mermaid blocks.
            If the user asks to plot or chart data, generate Chart.js JSON config enclosed in ```chart blocks.
            If the user asks to execute python, generate Python code enclosed in ```python blocks.
            CRITICAL MERMAID RULES:
            1. Use 'graph TD' for flowcharts.
            2. ALL node labels must be enclosed in quotes if they contain spaces or special characters (e.g., A["Node Label (Info)"]).
            3. Do NOT use parentheses (), brackets [], or braces {} inside unquoted node labels, as this breaks syntax.
            4. Keep diagrams concise, logical, and strictly accurate to the user's information."""
            
            # Inject context into the user message for strong attention
            llm_user_msg = f"Context:\n{context_text}\n\nQuestion: {request.message}"

        # Check if notebook has a specific focus
        focus_prompt = chats[chat_id].get("focus", "")
        if focus_prompt:
            system_message += f"\n\nCRITICAL NOTEBOOK FOCUS/INSTRUCTIONS:\n{focus_prompt}\nYou MUST strictly adhere to this focus in all your responses."

        chat_history.append({"role": "user", "content": request.message})
        
        # Build ephemeral message list for this request
        messages_for_llm = [{"role": "system", "content": system_message}] + chat_history[:-1] + [{"role": "user", "content": llm_user_msg}]
        
        payload = {
            "model": "llama3.2", 
            "messages": messages_for_llm,
            "stream": False,
            "options": {"temperature": 0.2}
        }
        
        response = requests.post("http://localhost:11434/api/chat", json=payload)
        response.raise_for_status()
        
        ai_response = response.json().get("message", {}).get("content", "Error: No response generated.")
        chat_history.append({"role": "assistant", "content": ai_response})
        
        chats[chat_id]["messages"] = chat_history
        save_chats(chats)
        
        return {"response": ai_response, "chat_id": chat_id}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    global vector_db, db_loaded, embeddings
    
    if not db_loaded:
        raise HTTPException(status_code=503, detail="AI Engine is still warming up. Please wait a few seconds and try again.")
        
    try:
        ext = file.filename.split('.')[-1].lower()
        if ext not in ["pdf", "txt", "md", "png", "jpg", "jpeg", "docx", "csv", "xlsx", "pptx"]:
            raise Exception("Unsupported file type.")
            
        print(f"\n--- Processing Upload: {file.filename} ---")
        
        # --- DEDUPLICATION LOGIC ---
        if db_loaded and vector_db:
            print(f"Checking for existing file '{file.filename}'...")
            try:
                existing_data = vector_db.get()
                ids_to_delete = []
                for i, metadata in enumerate(existing_data.get("metadatas", [])):
                    if metadata and metadata.get("source") == file.filename:
                        ids_to_delete.append(existing_data["ids"][i])
                
                if ids_to_delete:
                    print(f"Found existing chunks for '{file.filename}'. Overwriting...")
                    vector_db.delete(ids=ids_to_delete)
            except Exception as e:
                 print(f"Warning: Could not perform deduplication check: {e}")
        # ---------------------------

        # Eject Chat model from VRAM to make room for reading files
        try:
            requests.post("http://localhost:11434/api/generate", json={"model": "llama3.2", "keep_alive": 0}, timeout=2)
        except:
            pass

        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        clean_filename = file.filename
        documents = []

        if ext == "pdf":
            print("Reading PDF...")
            loader = PyPDFLoader(tmp_path)
            docs = loader.load()
            
            # Check if PDF is essentially empty (scanned image)
            total_chars = sum(len(doc.page_content.strip()) for doc in docs)
            if total_chars < 50:
                print("PDF appears to be a scanned image. Falling back to Tesseract OCR...")
                try:
                    pdf_document = fitz.open(tmp_path)
                    ocr_text = ""
                    for page_num in range(len(pdf_document)):
                        page = pdf_document.load_page(page_num)
                        pix = page.get_pixmap(dpi=300)
                        img = Image.open(io.BytesIO(pix.tobytes()))
                        text = pytesseract.image_to_string(img)
                        ocr_text += f"\n--- Page {page_num + 1} ---\n" + text
                    
                    if ocr_text.strip():
                        docs = [Document(page_content=ocr_text)]
                    else:
                        raise Exception("OCR failed to find text.")
                except Exception as e:
                    print(f"OCR Error: {e}")
                    raise Exception("Could not read PDF. If it's scanned, ensure Tesseract-OCR is installed in C:\\Program Files\\Tesseract-OCR\\tesseract.exe")

            for doc in docs:
                doc.metadata["source"] = clean_filename
            documents.extend(docs)
            
        elif ext in ["txt", "md"]:
            print("Reading Text...")
            loader = TextLoader(tmp_path, encoding="utf-8")
            docs = loader.load()
            for doc in docs:
                doc.metadata["source"] = clean_filename
            documents.extend(docs)
            
        elif ext == "docx":
            print("Reading Word Document...")
            loader = Docx2txtLoader(tmp_path)
            docs = loader.load()
            for doc in docs:
                doc.metadata["source"] = clean_filename
            documents.extend(docs)
            
        elif ext == "csv":
            print("Reading CSV...")
            loader = CSVLoader(tmp_path)
            docs = loader.load()
            for doc in docs:
                doc.metadata["source"] = clean_filename
            documents.extend(docs)
            
        elif ext == "xlsx":
            print("Reading Excel...")
            loader = UnstructuredExcelLoader(tmp_path)
            docs = loader.load()
            for doc in docs:
                doc.metadata["source"] = clean_filename
            documents.extend(docs)
            
        elif ext == "pptx":
            print("Reading PowerPoint...")
            loader = UnstructuredPowerPointLoader(tmp_path)
            docs = loader.load()
            for doc in docs:
                doc.metadata["source"] = clean_filename
            documents.extend(docs)
                
        elif ext in ["png", "jpg", "jpeg"]:
            print("👁️ Waking Vision Model (Llava)...")
            with open(tmp_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
            payload = {
                "model": "llava",
                "prompt": "Describe this image in high detail. Transcribe all text.",
                "images": [encoded_string],
                "stream": False,
                "keep_alive": 0 
            }
            
            response = requests.post("http://localhost:11434/api/generate", json=payload, timeout=120)
            response.raise_for_status()
            desc = response.json().get("response", "")
            documents = [Document(page_content=f"IMAGE DESCRIPTION ({clean_filename}):\n{desc}", metadata={"source": clean_filename})]

        os.remove(tmp_path)

        if not documents:
            raise Exception("No readable text found in this file.")

        print("Splitting text...")
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = text_splitter.split_documents(documents)
        
        if not chunks:
            raise Exception("No content chunks generated.")

        if not embeddings:
            raise Exception("System Error: Embeddings model failed to load. Check console.")

        print("Saving to database...")
        if db_loaded and vector_db:
            vector_db.add_documents(chunks)
        else:
            vector_db = Chroma.from_documents(chunks, embedding=embeddings, persist_directory="./database/chroma_db")
            db_loaded = True

        # Generate Auto-Briefing in background
        def generate_briefing(fname, doc_chunks):
            try:
                full_text = " ".join([c.page_content for c in doc_chunks[:5]]) # use first 5 chunks for summary
                payload = {
                    "model": "llama3.2",
                    "messages": [
                        {"role": "system", "content": "You are an executive assistant. Generate a highly structured, 1-page Executive Briefing for the provided document text. Include: 1. Executive Summary, 2. Key Entities (People, Locations, etc.), 3. Action Items or Key Takeaways. Use markdown formatting."},
                        {"role": "user", "content": f"Document text:\n{full_text}"}
                    ],
                    "stream": False,
                    "options": {"temperature": 0.2}
                }
                resp = requests.post("http://localhost:11434/api/chat", json=payload, timeout=60)
                if resp.status_code == 200:
                    summary = resp.json().get("message", {}).get("content", "")
                    briefings = load_briefings()
                    briefings[fname] = summary
                    save_briefings(briefings)
                    print(f"Auto-Briefing generated for {fname}")
            except Exception as e:
                print(f"Failed to generate briefing for {fname}: {e}")

        threading.Thread(target=generate_briefing, args=(clean_filename, chunks), daemon=True).start()

        print("--- Upload Complete! ---")
        return {"message": "Success"}

    except Exception as e:
        print(f"❌ UPLOAD ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("Starting LocalLens Server...")
    # CHANGED: 127.0.0.1 bypasses Windows Firewall completely instead of 0.0.0.0
    uvicorn.run(app, host="127.0.0.1", port=8000)
