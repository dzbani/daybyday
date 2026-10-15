# -*- coding: utf-8 -*-
"""Jednorazowo: statyczne instancje czcionki Outfit (OFL) do generatora PDF (scripts/gen_pdf_calendars.js).

Powód: zmienna Outfit (fonts/outfit-*.woff2) trafia do PDF-a jako grafika liter (Type3) — pliki są duże
(ok. 315 KB na arkusz) i gorzej się drukują. Statyczne instancje to zwykłe czcionki TrueType, które
Chrome osadza jako małe podzbiory.

Użycie: python scripts/make_pdf_fonts.py   (wymaga: pip install fonttools brotli)
Wynik: fonts/pdf/outfit-w{400,500,600}-{latin,latin-ext}.ttf
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = {'latin': os.path.join(ROOT, 'fonts', 'outfit-latin.woff2'),
       'latin-ext': os.path.join(ROOT, 'fonts', 'outfit-latin-ext.woff2')}
OUT = os.path.join(ROOT, 'fonts', 'pdf')
os.makedirs(OUT, exist_ok=True)

for part, path in SRC.items():
    for w in (400, 500, 600):
        font = TTFont(path)           # woff2 -> obiekt TTFont (wymaga brotli)
        font.flavor = None
        inst = instantiateVariableFont(font, {'wght': w}, inplace=False)
        out = os.path.join(OUT, f'outfit-w{w}-{part}.ttf')
        inst.save(out)
        print(f'{os.path.basename(out):32} {os.path.getsize(out)//1024:4d} KB')
