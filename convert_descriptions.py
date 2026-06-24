import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('names_wiki.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

filtered = {k: v for k, v in data.items() if v}

lines = ['const NAME_DESCRIPTIONS = {']
for name, desc in filtered.items():
    escaped = desc.replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ').replace('\r', '')
    lines.append('  "' + name + '": "' + escaped + '",')
lines.append('};')

with open('name_descriptions.js', 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(lines))

print('Zapisano', len(filtered), 'opisow')
