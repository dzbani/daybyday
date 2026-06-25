import json, sys, re
sys.stdout.reconfigure(encoding='utf-8')
with open('name_popularity.js', 'r', encoding='utf-8') as f:
    content = f.read()
pairs = re.findall(r'"([^"]+)":(\d+)', content)
pairs.sort(key=lambda x: int(x[1]), reverse=True)
start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
end = int(sys.argv[2]) if len(sys.argv) > 2 else 20
for i, (name, count) in enumerate(pairs[start:end], start+1):
    print(f'{i}. {name}: {int(count):,}')
