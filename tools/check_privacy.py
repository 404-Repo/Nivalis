#!/usr/bin/env python3
"""Fail a release on known privacy patterns, including embedded code and ZIP entries.

This is a focused guard, not a complete secret detector. Findings contain rule
names and relative locations only; matching values are never printed.
"""
from pathlib import Path, PurePosixPath
import argparse, base64, hashlib, io, json, re, subprocess, sys, zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE_NAMES = ['README.md', 'QA.md', 'PLAY.html', 'index.html', 'style.css',
                 'campaign.js', 'campaign-state.js', 'title-audio.js', 'package.json',
                 '.privacy-policy.json', '.githooks', 'assets', 'chapters', 'tools', 'dist']
EXCLUDED = {'.DS_Store', '__pycache__', 'artifacts', 'development'}
PRIVATE_PARTS = {'.git', '.codex', '.openai', '.ssh', '.aws', '.npmrc', '.netrc',
                 'config.toml', 'credentials.json', 'credentials', 'id_rsa', 'id_ed25519'}
RULES = {
 'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'GitHub credential': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b',
 'API credential': rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}',
 'AWS access key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
 'Slack credential': rb'\bxox[baprs]-[A-Za-z0-9-]{20,}',
 'credential literal': rb'''(?i)\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|bearer[_-]?token|password)\b['"]?\s*[:=]\s*['"][A-Za-z0-9_./+~=-]{16,}['"]''',
 'authorization literal': rb'(?i)\bbearer\s+[A-Za-z0-9._~-]{24,}',
 'personal filesystem path': rb'(?i)(?:/(?:Users|home)/[A-Za-z0-9._-]+/|[A-Z]:\\Users\\[^\\\s]+\\)',
 'local-machine email': rb'(?i)\b[A-Z0-9._+-]+@[A-Z0-9._-]+\.(?:local|lan)\b',
 'retired hosting URL': rb'(?i)https?://[a-z0-9.-]+\.chatgpt\.site\b',
}
DATA_URL = re.compile(rb'data:(?:text/javascript|application/javascript|text/html);base64,([A-Za-z0-9+/=]+)')
CHAPTERS = re.compile(rb'window\.__CHAPTERS__=(\{[^<]*?\});')

class PrivacyError(Exception):
 pass

class Scanner:
 def __init__(self):
  self.seen=set(); self.findings=[]; self.bytes=0
 def flag(self, location, rule):
  # Filenames may themselves be private; redact path-like locations as well.
  safe=str(location)
  for pattern in RULES.values():
   safe=re.sub(pattern, b'[redacted]', safe.encode()).decode(errors='replace')
  self.findings.append(f'{safe}: {rule}')
 def scan(self, data, location, depth=0):
  parts=PurePosixPath(str(location).split('!')[-1].replace('\\','/')).parts
  if any(p.lower() in PRIVATE_PARTS or p.lower().startswith('.env') for p in parts) or Path(parts[-1] if parts else '').suffix.lower() in {'.pem','.key','.p12','.pfx'}:
   self.flag(location,'private configuration or key file')
  digest=hashlib.sha256(data).digest()
  if digest in self.seen:return
  self.seen.add(digest); self.bytes+=len(data)
  if depth>10 or self.bytes>256*1024*1024:
   raise PrivacyError('Scan limits exceeded; release requires manual inspection.')
  if data.startswith(b'PK\x03\x04'):
   try:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
     if z.comment:self.flag(location,'unexpected ZIP comment')
     names=set()
     for entry in z.infolist():
      if entry.is_dir():continue
      label=str(location)+'!'+entry.filename
      if entry.filename in names or '..' in PurePosixPath(entry.filename).parts or entry.filename.startswith('/'):
       self.flag(label,'unsafe or duplicate archive path')
      names.add(entry.filename)
      if entry.extra or entry.comment:self.flag(label,'unexpected archive metadata')
      if (entry.external_attr>>16)&0o170000==0o120000:self.flag(label,'archive symlink')
      if entry.file_size>128*1024*1024:raise PrivacyError('Archive member exceeds scan limit.')
      self.scan(z.read(entry),label,depth+1)
   except (zipfile.BadZipFile, RuntimeError):raise PrivacyError('Archive cannot be inspected safely.')
   return
  for rule,pattern in RULES.items():
   if re.search(pattern,data):self.flag(location,rule)
  # Decode only supported executable payloads, not arbitrary binary/font data.
  for number,match in enumerate(DATA_URL.finditer(data)):
   try:self.scan(base64.b64decode(match[1],validate=True),f'{location}!module-{number}.js',depth+1)
   except ValueError:raise PrivacyError('Embedded module cannot be decoded.')
  for match in CHAPTERS.finditer(data):
   try:
    for key,value in json.loads(match[1]).items():
     self.scan(base64.b64decode(value,validate=True),f'{location}!chapter-{key}.html',depth+1)
   except (ValueError,TypeError,AttributeError):raise PrivacyError('Embedded chapters cannot be inspected.')
 def finish(self):
  if self.findings:raise PrivacyError('\n'.join(self.findings))
  return len(self.seen)

def release_files(root=ROOT):
 files=[]
 for name in RELEASE_NAMES:
  p=root/name
  if not p.exists():raise PrivacyError(f'Missing release input: {name}')
  candidates=sorted(p.rglob('*')) if p.is_dir() else [p]
  for file in candidates:
   rel=file.relative_to(root)
   if any(part in EXCLUDED for part in rel.parts) or file.suffix=='.pyc':continue
   if file.is_symlink():raise PrivacyError('Symlinks are not allowed in release inputs.')
   if file.is_file():files.append(file)
 return sorted(set(files))

def git(repo,*args):
 try:return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.DEVNULL)
 except subprocess.CalledProcessError:raise PrivacyError('Git identity or release reference could not be verified.')

def check_identity(repo, revision=None, since=None):
 policy=json.loads((repo/'.privacy-policy.json').read_text())
 def allowed(name,email):
  if name not in policy['allowed_commit_names'] or email not in policy['allowed_commit_emails']:
   raise PrivacyError('Unexpected commit identity. Configure an approved public name and private GitHub email before releasing.')
 if revision:
  refs=[f'{since}..{revision}'] if since else [revision]
  for line in git(repo,'log','--format=%an%x00%ae%x00%cn%x00%ce',*refs).decode().splitlines():
   author,email,committer,committer_email=line.split('\0');allowed(author,email);allowed(committer,committer_email)
 else:
  for kind in ['GIT_AUTHOR_IDENT','GIT_COMMITTER_IDENT']:
   value=git(repo,'var',kind).decode();match=re.fullmatch(r'(.*) <([^<>]+)> \d+ [+-]\d{4}\n?',value)
   if not match:raise PrivacyError('Commit identity could not be parsed.')
   allowed(match[1],match[2])

def check_files(files,root=ROOT,identity=True):
 if identity and (root/'.git').exists():check_identity(root)
 scanner=Scanner()
 for file in files:scanner.scan(file.read_bytes(),file.relative_to(root).as_posix())
 return scanner.finish()

def check_revision(repo,revision,since=None,all_history=False):
 if not re.fullmatch(r'[a-f0-9]{40,64}',revision):raise PrivacyError('Expected an exact commit hash.')
 if since and not re.fullmatch(r'[a-f0-9]{40,64}',since):raise PrivacyError('Expected an exact base commit hash.')
 check_identity(repo,revision,since)
 scanner=Scanner()
 commits=git(repo,'rev-list',f'{since}..{revision}').decode().splitlines() if since else git(repo,'rev-list',revision).decode().splitlines() if all_history else []
 for commit in dict.fromkeys([revision,*commits]):
  for record in git(repo,'ls-tree','-rz',commit).split(b'\0'):
   if not record:continue
   meta,name=record.split(b'\t',1);mode,kind,oid=meta.split()
   if kind!=b'blob' or mode==b'120000':raise PrivacyError('Submodules and symlinks require manual privacy review.')
   scanner.scan(git(repo,'cat-file','blob',oid.decode()),name.decode())
 return scanner.finish()

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--repo',type=Path,default=ROOT)
 parser.add_argument('--ref');parser.add_argument('--since');parser.add_argument('--all-history',action='store_true')
 args=parser.parse_args()
 try:
  count=check_revision(args.repo,args.ref,args.since,args.all_history) if args.ref else check_files(release_files(args.repo),args.repo)
 except (PrivacyError,OSError,ValueError) as error:
  print('PRIVACY CHECK FAILED: '+(str(error) if isinstance(error,PrivacyError) else 'Input or policy could not be inspected.'),file=sys.stderr);return 1
 print(f'PASS: privacy patterns, filenames and commit identity; {count} unique payloads checked.');return 0

if __name__=='__main__':sys.exit(main())
