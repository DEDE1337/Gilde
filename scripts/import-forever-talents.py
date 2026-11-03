#!/usr/bin/env python3
"""Import the authentic Wowhead Forever talent snapshot and its icon assets.
Run `python scripts/import-forever-talents.py` to rebuild from saved snapshots;
add --refresh to fetch the calculator's current data script before importing.
No Classic Era/TBC/Retail talent data is mixed into this dataset.
"""
import argparse, concurrent.futures, datetime, html, json, re, urllib.request
from zoneinfo import ZoneInfo
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://nether.wowhead.com/forever/de/data/talents-classic?dv=29&db=1793399207'
CALCULATOR='https://www.wowhead.com/forever/de/talent-calc/warrior'
SNAPSHOT='2026-11-02'
CLASS_CONFIG=[
 (1,'warrior','Krieger','#C79C6E',[(161,'arms','Waffen'),(164,'fury','Furor'),(163,'protection','Schutz')]),
 (2,'paladin','Paladin','#F58CBA',[(382,'holy','Heilig'),(383,'protection','Schutz'),(381,'retribution','Vergeltung')]),
 (3,'hunter','Jäger','#ABD473',[(361,'beast-mastery','Tierherrschaft'),(363,'marksmanship','Treffsicherheit'),(362,'survival','Überleben')]),
 (4,'rogue','Schurke','#FFF569',[(182,'assassination','Meucheln'),(181,'combat','Kampf'),(183,'subtlety','Täuschung')]),
 (5,'priest','Priester','#FFFFFF',[(201,'discipline','Disziplin'),(202,'holy','Heilig'),(203,'shadow','Schatten')]),
 (7,'shaman','Schamane','#0070DE',[(261,'elemental','Elementar'),(263,'enhancement','Verstärkung'),(262,'restoration','Wiederherstellung')]),
 (8,'mage','Magier','#69CCF0',[(81,'arcane','Arkan'),(41,'fire','Feuer'),(61,'frost','Frost')]),
 (9,'warlock','Hexenmeister','#9482C9',[(302,'affliction','Gebrechen'),(303,'demonology','Dämonologie'),(301,'destruction','Zerstörung')]),
 (11,'druid','Druide','#FF7D0A',[(283,'balance','Gleichgewicht'),(281,'feral','Wilder Kampf'),(282,'restoration','Wiederherstellung')]),
]
def text(value):
 value=re.sub(r'<br\s*/?>','\n',value,flags=re.I)
 value=re.sub(r'<!--.*?-->','',value,flags=re.S)
 return html.unescape(re.sub(r'<[^>]*>','',value))
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'ModCheck-Forever-TalentImporter/1.0'})
 with urllib.request.urlopen(req,timeout=30) as response: return response.read()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');args=parser.parse_args()
 source_dir=ROOT/'source-data/talents';source_dir.mkdir(parents=True,exist_ok=True)
 snapshot=source_dir/'wowhead-forever-de.js'
 if args.refresh:
  page=fetch(CALCULATOR).decode();match=re.search(r'https://nether\.wowhead\.com/forever/de/data/talents-classic[^"\s<]+',page)
  if not match:raise RuntimeError('Forever calculator data URL not found; refusing to substitute another game version.')
  url=html.unescape(match.group());snapshot.write_bytes(fetch(url));(source_dir/'wowhead-forever-en.js').write_bytes(fetch(url.replace('/de/','/')))
 else:url=SOURCE
 snapshot_date=datetime.datetime.now(ZoneInfo('Europe/Berlin')).date().isoformat() if args.refresh else SNAPSHOT
 raw=snapshot.read_text();raw_data=json.JSONDecoder().raw_decode(raw[raw.index(',')+1:])[0]
 if 'wow.talentCalcClassic.classicplus.data' not in raw:raise ValueError('Expected Forever/classicplus payload')
 en_raw=(source_dir/'wowhead-forever-en.js').read_text();en_data=json.JSONDecoder().raw_decode(en_raw[en_raw.index(',')+1:])[0]
 assets=ROOT/'web/talent-icons';assets.mkdir(parents=True,exist_ok=True)
 jobs={};classes=[];count=0;fallback_count=0
 for cid,slug,name,color,tree_config in CLASS_CONFIG:
  class_icon='classicon_'+slug;jobs['talent-icons/'+class_icon+'.jpg']='https://wow.zamimg.com/images/wow/icons/large/'+class_icon+'.jpg'
  cls={'id':cid,'slug':slug,'name':name,'color':color,'icon':'talent-icons/'+class_icon+'.jpg','trees':[]}
  for tid,tslug,tname in tree_config:
   source_tree=raw_data['talents'][str(tid)];tree={'id':tid,'slug':tslug,'name':tname,'background':'talent-icons/tree-'+str(tid)+'.jpg','talents':[]}
   jobs[tree['background']]='https://wow.zamimg.com/images/wow/talents/backgrounds/classicplus/'+str(tid)+'.jpg'
   for t in sorted(source_tree.values(),key=lambda t:(t['row'],t['col'])):
    icon=t['icon'].lower();local='talent-icons/'+icon+'.jpg';jobs[local]='https://wow.zamimg.com/images/wow/icons/large/'+icon+'.jpg'
    if icon=='inv_misc_questionmark':raise ValueError('Generic icon in source for '+str(t['id']))
    ranks=t['ranks'];en=en_data['talents'][str(tid)][str(t['id'])]
    if en['ranks']!=ranks:raise ValueError('Locale source rank mismatch '+str(t['id']))
    fallback=not t['name'] or not all(t['descriptions'].values())
    if fallback:fallback_count+=1
    descs=[text(t['descriptions'].get(str(i)) or en['descriptions'][str(i)])for i in range(1,len(ranks)+1)]
    talent={'id':t['id'],'name':t['name'] or en['name'],'locale':'enUS' if fallback else 'deDE','nameEnus':t.get('nameEnus',t['name']),'icon':local,'iconName':icon,'row':t['row'],'col':t['col'],'maxRank':len(ranks),'requiredPoints':t.get('requiredPoints',t['row']*5),'requires':[{'id':r['id'],'rank':r['qty']}for r in t['requires']],'descriptions':descs,'rankSpellIds':ranks,'definition':t.get('definition')}
    for dep in talent['requires']:
     if str(dep['id'])not in source_tree:raise ValueError('Unresolved dependency '+str(dep))
    tree['talents'].append(talent);count+=1
   tree['icon']=tree['talents'][0]['icon'];cls['trees'].append(tree)
  classes.append(cls)
 def download(job):
  local,url=job;p=ROOT/'web'/local
  if p.exists()and p.stat().st_size>100:return None
  try:
   b=fetch(url)
   if b[:2]!=b'\xff\xd8':raise ValueError('Not a JPEG')
   p.write_bytes(b);return None
  except Exception as exc:return {'file':local,'url':url,'error':str(exc)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:failures=[r for r in pool.map(download,jobs.items())if r]
 if failures:
  (source_dir/'asset-errors.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2));raise RuntimeError(str(len(failures))+' missing assets: '+str(failures[:4]))
 output={'version':'forever','snapshot':snapshot_date,'source':url,'sourceEnglish':url.replace('/de/','/'),'calculator':CALCULATOR,'locale':'deDE','localizationFallbackCount':fallback_count,'hashVersion':raw_data['hashVersion'],'talentCount':count,'classes':classes}
 (ROOT/'web/forever-talents.js').write_text('/* Authentic Wowhead Forever talent snapshot; generated by scripts/import-forever-talents.py. */\nconst FOREVER_TALENTS='+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';\n')
 (source_dir/'provenance.json').write_text(json.dumps({'source':url,'calculator':CALCULATOR,'snapshot':snapshot_date,'version':'World of Warcraft: Forever (classicplus)','locale':'deDE','talents':count,'localizationFallbackCount':fallback_count,'trees':sum(len(c['trees'])for c in classes),'assets':len(jobs),'notes':'Exact source ranks, row/column positions, requiredPoints and talent dependencies. No substitution from other game versions.'},ensure_ascii=False,indent=2))
 print(json.dumps({'classes':len(classes),'trees':sum(len(c['trees'])for c in classes),'talents':count,'assets':len(jobs),'missing':len(failures)}))
if __name__=='__main__':main()
