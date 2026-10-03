import hashlib,json,os,subprocess,traceback
from pathlib import Path

repo=Path('/workspace/knorvia-studio')
root=Path('/workspace/knorvia-native-linux-email-20261003')
release=root/'desktop-release'
source=json.loads((root/'source-input.json').read_text())
version=json.loads((repo/'package.json').read_text())['version']
contact='Knorvia Studio <accomplish07zrh@gmail.com>'
package_name='knorvia-studio'
env={'PATH':str(root/'tools/bin')+':/tmp/knorvia-native-package-acceptance-20261003/bin:/usr/bin:/bin','LANG':'C.UTF-8','TMPDIR':str(root/'tmp')}
report={'status':'running','inputSha':source['inputSha'],'mainBaseSha':source['mainBaseSha'],'platform':'linux-x64','expectedContact':contact,'applicationLicense':'Apache-2.0','targets':{},'commands':[],'limits':['No global package/OS installation','No GUI/model/user-profile operations','Package metadata/payload checks do not establish RPM/Arch distro installation acceptance']}

def run(args,cwd=None):
    r=subprocess.run([str(a) for a in args],cwd=cwd,env=env,text=True,capture_output=True,timeout=180)
    report['commands'].append({'args':[str(a) for a in args],'cwd':str(cwd) if cwd else None,'exitCode':r.returncode,'stderr':r.stderr})
    if r.returncode!=0: raise RuntimeError(str(args)+'\n'+r.stderr)
    return r.stdout

def sha(p):
    with p.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()

def binding(p): return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p)}

def fields(text):
    out={};key=None
    for line in text.splitlines():
        if line.startswith(' ') and key: out[key]+='\n'+line
        elif ': ' in line: key,value=line.split(': ',1);out[key]=value
    return out

unpacked=release/'linux-unpacked'
payload_names=['knorvia-studio','resources/app.asar','resources/knorvia/knorvia.cjs','resources/app.asar.unpacked/node_modules/node-pty/prebuilds/linux-x64/pty.node','resources/LICENSE.knorvia.txt','resources/NOTICE.md','resources/THIRD-PARTY-NOTICES.md','resources/licensing/MIT.txt','resources/licenses/lobe-icons-LICENSE.txt']
try:
    head=run(['git','rev-parse','HEAD'],cwd=repo).strip();assert head==source['inputSha'],head
    assert not run(['git','status','--porcelain'],cwd=repo)
    report['freshUnpacked']={name:binding(unpacked/name) for name in payload_names}
    for packaged,original in [('resources/LICENSE.knorvia.txt','LICENSE'),('resources/NOTICE.md','NOTICE.md'),('resources/THIRD-PARTY-NOTICES.md','THIRD-PARTY-NOTICES.md'),('resources/licensing/MIT.txt','licensing/MIT.txt'),('resources/licenses/lobe-icons-LICENSE.txt','third-party/ui/lobe-icons-LICENSE.txt')]:
        assert sha(unpacked/packaged)==sha(repo/original),packaged
    paths={kind:sorted(release.glob(pattern)) for kind,pattern in [('deb','*.deb'),('rpm','*.rpm'),('pacman','*.pkg.tar.zst'),('AppImage','*.AppImage')]}
    assert all(len(items)==1 for items in paths.values()),paths
    extracted_base=root/'package-extractions';extracted_base.mkdir(exist_ok=True)
    for kind,items in paths.items():
        artifact=items[0];r={'artifact':binding(artifact)};report['targets'][kind]=r
        if kind=='AppImage': continue
        extracted=extracted_base/kind;extracted.mkdir(exist_ok=True)
        if kind=='deb':
            raw=run(['/usr/bin/dpkg-deb','--field',artifact]);r['rawControl']=raw;meta=fields(raw)
            assert meta['Package']==package_name and meta['Maintainer']==contact,meta
            assert meta['Version']==version.replace('-','~') and meta['Architecture']=='amd64',meta
            deps={part.strip().split(' ',1)[0] for part in meta['Depends'].split(',')}
            expected={'libgtk-3-0','libnotify4','libnss3','libxss1','libxtst6','xdg-utils','libatspi2.0-0','libuuid1','libsecret-1-0'}
            assert expected.issubset(deps),deps
            if not (extracted/'opt').exists(): run(['/usr/bin/dpkg-deb','--extract',artifact,extracted])
            else: r['existingSuccessfulExtractionReused']=True
            assert meta['License']=='Apache-2.0' and meta['Vendor']==contact and meta['Homepage']=='https://knorvia.xyz',meta
            r['licenseEvidence']='Actual FPM License control field and byte-identical packaged LICENSE.knorvia.txt';r['metadata']=meta;r['requiredDependenciesRetained']=sorted(expected)
        elif kind=='rpm':
            query='%{NAME}\n%{VERSION}\n%{RELEASE}\n%{ARCH}\n%{PACKAGER}\n%{VENDOR}\n%{LICENSE}\n%{URL}\n'
            values=run(['rpm','--dbpath',str(root/'tools/rpm-db'),'--query','--package','--queryformat',query,artifact]).splitlines();assert len(values)==8,values
            meta=dict(zip(['name','version','release','arch','packager','vendor','license','url'],values));r['metadata']=meta
            assert meta['name']==package_name and meta['version']==version.replace('-','~') and meta['arch']=='x86_64',meta
            assert meta['packager']==contact and meta['vendor']==contact and meta['license']=='Apache-2.0' and meta['url']=='https://knorvia.xyz',meta
            dependencies=run(['rpm','--dbpath',str(root/'tools/rpm-db'),'--query','--package','--requires',artifact]).splitlines();r['dependencies']=dependencies
            expected={'gtk3','libnotify','nss','libXScrnSaver','xdg-utils','at-spi2-core','mesa-libgbm','alsa-lib','(libXtst or libXtst6)','(libuuid or libuuid1)'}
            assert expected.issubset(set(dependencies)),dependencies
            converted=subprocess.Popen(['rpm2cpio',str(artifact)],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            unpacked_proc=subprocess.run(['cpio','--extract','--make-directories','--no-absolute-filenames'],cwd=extracted,env=env,stdin=converted.stdout,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
            converted.stdout.close();converted_stderr=converted.stderr.read().decode();converted_exit=converted.wait(timeout=10)
            r['extraction']={'rpm2cpioExitCode':converted_exit,'rpm2cpioStderr':converted_stderr,'cpioExitCode':unpacked_proc.returncode,'cpioStderr':unpacked_proc.stderr}
            assert converted_exit==0 and unpacked_proc.returncode==0,r['extraction']
            r['requiredDependenciesRetained']=sorted(expected)
        else:
            magic=artifact.open('rb').read(4);assert magic==bytes.fromhex('28b52ffd'),magic.hex();r['compressionMagicHex']=magic.hex();r['compression']='zstd'
            raw=run(['tar','--zstd','--extract','--to-stdout','--file',artifact,'.PKGINFO']);r['rawPkgInfo']=raw
            meta={}
            for line in raw.splitlines():
                if ' = ' in line and not line.startswith('#'):
                    key,value=line.split(' = ',1);meta.setdefault(key,[]).append(value)
            assert meta['pkgname']==[package_name] and meta['packager']==[contact] and meta['license']==['Apache-2.0'],meta
            assert meta['pkgver']==[version.replace('-','_')+'-1'] and meta['arch']==['x86_64'],meta
            expected={'gtk3','nss','libxss','libxtst','libnotify','alsa-lib','mesa','xdg-utils'}
            assert expected==set(meta['depend']),meta['depend']
            run(['tar','--zstd','--extract','--file',artifact,'--directory',extracted,'--no-same-owner'])
            assert (extracted/'.INSTALL').is_file() and (extracted/'.MTREE').is_file()
            r['metadata']=meta;r['requiredDependenciesRetained']=sorted(expected);r['installAndMtreeRetained']=True
        candidates=[p for p in extracted.glob('opt/*') if (p/'resources/app.asar').is_file()]
        assert len(candidates)==1,candidates
        app=candidates[0];matches={}
        for name in payload_names:
            p=app/name;expected=report['freshUnpacked'][name];actual=binding(p)
            assert actual['sha256']==expected['sha256'] and actual['bytes']==expected['bytes'],name
            matches[name]=actual
        r['applicationRoot']=str(app);r['payloadMatchesFreshUnpacked']=matches;r['status']='passed'
    report['rootAndThirdPartyNoticeBytesRetained']=True;report['allTargetArtifactsPresent']=True;report['status']='passed'
except BaseException as error:
    report['status']='failed';report['error']=traceback.format_exc()
finally:
    (root/'linux-artifact-metadata-probe.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'status':report['status'],'result':str(root/'linux-artifact-metadata-probe.json'),'targets':{name:r.get('status','artifact-hash-bound') for name,r in report['targets'].items()},'error':report.get('error')},ensure_ascii=False))
raise SystemExit(0 if report['status']=='passed' else 1)
