# 查询维基共享资源图纸的许可与原图地址，并下载到 reference/（只下载许可为公有领域或 CC0 的）
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
OUT = sys.argv[1]
UA = {'User-Agent': 'reference-fetch/1.0'}
titles = ['File:Plan de la cath\u00e9drale Notre-Dame-de-Paris. D.14500-14.jpg',
          'File:Notre-Dame de Paris - Fa\u00e7ade occidentale - Manuscrit Fran\u00e7ais 9152.jpg',
          'File:Vue.interieure.travee.cathedrale.Paris.png', 'File:Vue.exterieure.travee.cathedrale.Paris.png',
          'File:Pilier.Notre.Dame.Paris.png', 'File:Fleche.Notre.Dame.Paris.png', 'File:Pignon.transept.Notre.Dame.Paris.png',
          'File:Arc.boutant.Notre.Dame.de.Paris.png', 'File:Coupe.voutes.cathedrale.Paris.png',
          'File:Plan.collateraux.cathedrale.Paris.png', 'File:Notre Dame 531.jpg']
q = urllib.parse.urlencode({'action': 'query', 'titles': '|'.join(titles), 'prop': 'imageinfo',
                            'iiprop': 'url|size|extmetadata', 'iiextmetadatafilter': 'LicenseShortName|Artist|DateTimeOriginal',
                            'format': 'json'})
d = json.load(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + q, headers=UA)))
rows = []
for p in d['query']['pages'].values():
    ii = p['imageinfo'][0]; m = ii.get('extmetadata', {})
    g = lambda k: re.sub('<[^>]+>', '', m.get(k, {}).get('value', '')).strip()
    lic = g('LicenseShortName')
    ok = bool(re.search(r'public domain|cc0|pdm', lic, re.I))
    name = p['title'][5:].replace(' ', '_')
    rows.append((name, ii['width'], ii['height'], ii['size'], lic, g('Artist')[:60], g('DateTimeOriginal')[:40], ii['descriptionurl'], ok))
    if ok:
        url = ii['url'].split('?')[0]
        if not os.path.exists(f'{OUT}/{name}'):
            for wait in (10, 30, 60, 120, 0):
                try:
                    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()
                    open(f'{OUT}/{name}', 'wb').write(data)
                    break
                except urllib.error.HTTPError as e:
                    if e.code != 429 or not wait:
                        raise
                    time.sleep(wait)
            time.sleep(5)
with open(f'{OUT}/SOURCES.md', 'w', encoding='utf-8') as f:
    f.write('# 参考图纸来源（2026-11-15 下载，仅本地参考）\n\n| 文件 | 尺寸 | 字节 | 许可 | 作者 | 日期 | 页面 | 已下载 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n')
    for r in rows:
        f.write('| ' + ' | '.join(str(x) for x in (r[0], f'{r[1]}x{r[2]}', r[3], r[4], r[5], r[6], r[7], '是' if r[8] else '否（许可不符）')) + ' |\n')
for r in rows:
    print(r[0], r[3], r[4], 'OK' if r[8] else 'SKIP')
