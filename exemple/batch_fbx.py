import sys,subprocess,json,os,re
sys.path.insert(0,'/home/claude/character_forge')
items=[ # (nom, fbx, clip|None, texture|None, extra)
 ("orc","/tmp/ext/z/orc_warrior_characterfbx_1752332868/Orc Warrior Character.fbx",None,"/tmp/ext/z/orc_warrior_characterfbx_1752332868/texture_pbr_v128.png",[]),
 ("scorpion","/tmp/ext/z/scorpion_fbx_1781654930/Scorpion_fbx.Fbx","1238936997216_TempMotion",None,[]),
 ("sophia","/tmp/ext/z/rp_sophia_animated_003_idling_fbx_1591085831/rp_sophia_animated_003_idling.fbx","Take 001",None,[]),
 ("manuel","/tmp/ext/z/rp_manuel_animated_001_dancing_fbx_1591085087/rp_manuel_animated_001_dancing.fbx","Take 001",None,[]),
 ("dwarf","/tmp/ext/z/female_military_field_doctor_1664455853/Dwarf Idle pose.fbx","mixamo.com",None,[]),
 ("arqueira","/tmp/ext/z/arqueirafbx_1601701681/arqueira.fbx","Armature.001|Armature|mixamo.com|Layer0",None,[]),
 ("dancing_girl","/tmp/ext/z/dancing_girl_in_kimono_3_1670864435/Dancing Girl 02.fbx","Character RIG|Dance",None,[]),
 ("fbx_1705246092","/tmp/ext/z/fbx_1705246092/FBX/FBX.fbx",None,None,[]),
 ("fbx_1750258005","/tmp/ext/z/fbx_1750258005/FBX.fbx",None,None,[]),
 ("fbx_1750264599","/tmp/ext/z/fbx_1750264599/FBX.fbx",None,None,[]),
 ("fbx_1750267025","/tmp/ext/z/fbx_1750267025/Fbx.fbx",None,None,[]),
 ("cocomyos","/tmp/ext/z/cocomyos_osteodermus_1793573782/Cocomyos Osteodermus.fbx",None,None,[]),
]
only=sys.argv[1:] 
for n,f,clip,tex,ex in items:
    if only and n not in only: continue
    out=f"/tmp/ext/b/out/{n}"; os.makedirs(out,exist_ok=True)
    cmd=[sys.executable,"-m","forge","meshy",f,"--size","64","--ss","4","--colors","32","-o",out]
    if clip: cmd+=["--anim",clip,"--frames","6"]
    if tex: cmd+=["--texture",tex]
    try:
        r=subprocess.run(cmd,cwd="/home/claude/character_forge",capture_output=True,text=True,timeout=900)
        print(n,"OK" if r.returncode==0 else "ERR",(r.stdout.strip().splitlines() or [""])[0][:90],r.stderr.strip()[-150:] if r.returncode else "",flush=True)
    except subprocess.TimeoutExpired: print(n,"TIMEOUT",flush=True)
