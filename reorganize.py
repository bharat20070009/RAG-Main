import os
import shutil

# 1. Create Directories
directories = ['public', 'database', 'docs']
for d in directories:
    os.makedirs(d, exist_ok=True)

# 2. Move Files
file_moves = {
    'index.html': 'public/index.html',
    'style.css': 'public/style.css',
    'script.js': 'public/script.js',
    'favicon.ico': 'public/favicon.ico',
    'locallens_logo.jpg': 'public/locallens_logo.jpg',
    'chats.json': 'database/chats.json',
    'briefings.json': 'database/briefings.json',
    'PlayStore_Mobile_Strategy.md': 'docs/PlayStore_Mobile_Strategy.md'
}

for src, dst in file_moves.items():
    if os.path.exists(src):
        shutil.move(src, dst)

# Move chroma_db
if os.path.exists('chroma_db'):
    shutil.move('chroma_db', 'database/chroma_db')

# 3. Update api_server.py
with open('api_server.py', 'r', encoding='utf-8') as f:
    code = f.read()

replacements = {
    'FileResponse("index.html")': 'FileResponse("public/index.html")',
    'FileResponse("locallens_logo.jpg")': 'FileResponse("public/locallens_logo.jpg")',
    'FileResponse("favicon.ico")': 'FileResponse("public/favicon.ico")',
    'FileResponse("style.css")': 'FileResponse("public/style.css")',
    'FileResponse("script.js")': 'FileResponse("public/script.js")',
    'CHATS_FILE = "chats.json"': 'CHATS_FILE = "database/chats.json"',
    'BRIEFINGS_FILE = "briefings.json"': 'BRIEFINGS_FILE = "database/briefings.json"',
    'persist_directory="./chroma_db"': 'persist_directory="./database/chroma_db"'
}

for old, new in replacements.items():
    code = code.replace(old, new)

with open('api_server.py', 'w', encoding='utf-8') as f:
    f.write(code)

# 4. Cleanup
if os.path.exists('venv') and os.path.isdir('venv'):
    import stat
    def remove_readonly(func, path, excinfo):
        os.chmod(path, stat.S_IWRITE)
        func(path)
    shutil.rmtree('venv', onerror=remove_readonly)

if os.path.exists('organize.py'):
    os.remove('organize.py')

print("Reorganization complete.")
