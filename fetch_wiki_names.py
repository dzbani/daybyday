import json
import time
import re
import urllib.request
import urllib.parse
import os
import ssl
import sys
sys.stdout.reconfigure(encoding='utf-8')

# Wyłącz weryfikację SSL (Windows issue)
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

# Wyciągnij imiona z name_popularity.js
def get_names_from_js():
    with open("name_popularity.js", "r", encoding="utf-8") as f:
        content = f.read()
    names = re.findall(r'"([^"]+)":\d+', content)
    return names

# Pobierz opis z Wikipedii
def fetch_wiki(name):
    url = "https://pl.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(name)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DaybyDayBot/1.0"})
        with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as r:
            data = json.loads(r.read().decode("utf-8"))
            extract = data.get("extract", "")
            # Tylko jeśli to artykuł o imieniu (nie miejscowość itp.)
            keywords = ["imi", "hebrajsk", "słowiańsk", "łacińsk", "germańsk", "grec", "pocho", "nazwa", "język"]
            if any(kw in extract.lower() for kw in keywords):
                return extract
    except Exception:
        pass
    return None

# Główna logika
def main(batch_start=0, batch_size=100):
    output_file = "names_wiki.json"

    # Wczytaj istniejące dane
    if os.path.exists(output_file):
        with open(output_file, "r", encoding="utf-8") as f:
            results = json.load(f)
    else:
        results = {}

    names = get_names_from_js()
    batch = names[batch_start:batch_start + batch_size]

    print(f"Przetwarzam imiona {batch_start+1}-{batch_start+len(batch)} z {len(names)}")

    found = 0
    for i, name in enumerate(batch):
        if name in results:
            print(f"  [{i+1}/{len(batch)}] {name} — już istnieje, pomijam")
            continue

        extract = fetch_wiki(name)
        if extract:
            results[name] = extract
            found += 1
            print(f"  [{i+1}/{len(batch)}] {name} — znaleziono ✓")
        else:
            results[name] = ""
            print(f"  [{i+1}/{len(batch)}] {name} — brak")

        time.sleep(0.3)  # nie przeciążaj API

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\nGotowe! Znaleziono opisy: {found}/{len(batch)}")
    print(f"Łącznie w bazie: {len(results)} imion")
    print(f"Następna partia: batch_start={batch_start + batch_size}")

if __name__ == "__main__":
    import sys
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    main(start, size)
