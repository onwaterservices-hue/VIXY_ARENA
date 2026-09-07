import sys
s=open(sys.argv[1]).read().rstrip('\n')
h=0;d=0
for c in s:
    o=ord(c); h=(h*31+o)&0xFFFFFFFF
    if 48<=o<=57: d+=o-48
a='0123456789abcdefghijklmnopqrstuvwxyz';r='';n=h
while n: r=a[n%36]+r;n//=36
print({'len':len(s),'lines':len(s.split('\n')),'digits':d,'h':r or '0'})
