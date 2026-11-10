from PIL import Image,ImageDraw,ImageFont
import json,sys
im=Image.open(sys.argv[1]).convert('RGB');names=json.load(open('names.json'))
CW,CH=160,152;M=230
f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',17);g=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
W=Image.new('RGB',(M+im.width,im.height),(255,0,255));W.paste(im,(M,0));d=ImageDraw.Draw(W)
for r,n in enumerate(names):
    y=r*CH
    d.rectangle((0,y+CH//2-30,M-8,y+CH//2+30),fill=(20,20,30))
    d.text((8,y+CH//2-24),f'{r+1:02d}',font=f,fill=(255,220,80))
    # nom sur 2 lignes max
    words=n.split(' ');l1='';l2=''
    for w in words:
        if len(l1+' '+w)<=21 and not l2: l1=(l1+' '+w).strip()
        else: l2=(l2+' '+w).strip()
    d.text((8,y+CH//2-4),l1,font=g,fill=(255,255,255));d.text((8,y+CH//2+13),l2,font=g,fill=(255,255,255))
    d.line((M,y,W.width,y),fill=(200,0,200))
W.save(sys.argv[2]);print(W.size)
