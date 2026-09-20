#!/usr/bin/env python3
"""Regression tests use synthetic values assembled only in memory."""
import base64, io, json, os, subprocess, tempfile, unittest, zipfile
from pathlib import Path
from unittest.mock import patch
from check_privacy import Scanner, PrivacyError, check_identity, check_revision, release_files, ROOT

class PrivacyTests(unittest.TestCase):
 def rejected(self,data,name='entry.js'):
  scanner=Scanner();scanner.scan(data,name)
  with self.assertRaises(PrivacyError) as caught:scanner.finish()
  return str(caught.exception)
 def test_known_patterns_and_redacted_output(self):
  samples=[b'ghp_'+b'A'*36,b'AKIA'+b'A'*16,
           b'-----BEGIN '+b'PRIVATE KEY-----',
           b'password = "'+b'x'*20+b'"',
           b'Bearer '+b'B'*32,
           b'/'+b'Users/'+b'privacy-test/private.txt',
           b'person@'+b'computer.local',
           b'https://retired.'+b'example.chatgpt.site/game/']
  for sample in samples:
   with self.subTest(sample_type=samples.index(sample)):
    message=self.rejected(sample);self.assertNotIn(sample.decode(),message)
 def test_private_filenames_even_for_identical_empty_content(self):
  for name in ['chapters/.env.local','assets/.codex/config.toml','keys/site.pem','config/credentials.json']:
   scanner=Scanner();scanner.scan(b'','okay.txt');scanner.scan(b'',name)
   with self.assertRaises(PrivacyError):scanner.finish()
 def test_encoded_module(self):
  secret=b'ghp_'+b'C'*36
  data=b'data:text/javascript;base64,'+base64.b64encode(secret)
  self.rejected(data)
 def test_portable_chapter_with_nested_module(self):
  module=b'data:text/javascript;base64,'+base64.b64encode(b'ghp_'+b'D'*36)
  chapters={'warden':base64.b64encode(module).decode()}
  self.rejected(b'window.__CHAPTERS__='+json.dumps(chapters).encode()+b';')
 def test_zip_content_and_metadata(self):
  data=io.BytesIO()
  with zipfile.ZipFile(data,'w') as z:z.writestr('game/.env',b'example')
  self.rejected(data.getvalue(),'release.zip')
  data=io.BytesIO()
  with zipfile.ZipFile(data,'w') as z:z.comment=b'private metadata';z.writestr('game/index.html',b'ok')
  self.rejected(data.getvalue(),'release.zip')
 def test_archive_symlink(self):
  data=io.BytesIO()
  with zipfile.ZipFile(data,'w') as z:
   entry=zipfile.ZipInfo('game/link');entry.external_attr=0o120777<<16;z.writestr(entry,'outside')
  self.rejected(data.getvalue(),'release.zip')
 def test_clean_release_retains_licenses(self):
  scanner=Scanner();scanner.scan(b'Copyright Example Authors. https://github.com/example/project','LICENSE.txt')
  scanner.scan(b'const scene = {};','main.js');self.assertEqual(scanner.finish(),2)
 def test_budget_fails_closed(self):
  scanner=Scanner()
  with self.assertRaises(PrivacyError):scanner.scan(b'ok','file',depth=11)
 def test_symlink_release_input_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'README.md').symlink_to(ROOT/'README.md')
   with self.assertRaises(PrivacyError):release_files(root)
 def test_identity_and_committed_tree(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   def git(*args):return subprocess.check_output(['git','-C',tmp,*args],stderr=subprocess.DEVNULL).decode().strip()
   git('init');git('config','user.name','public-alias');git('config','user.email','123+public-alias@users.noreply.github.com')
   (root/'.privacy-policy.json').write_text(json.dumps({'allowed_commit_names':['public-alias'],'allowed_commit_emails':['123+public-alias@users.noreply.github.com']}))
   (root/'index.html').write_text('Clean game');git('add','.');git('commit','-m','Safe fixture')
   safe=git('rev-parse','HEAD');check_identity(root);check_revision(root,safe)
   with patch.dict(os.environ,{'GIT_AUTHOR_EMAIL':'private@'+'computer.local'}):
    with self.assertRaises(PrivacyError):check_identity(root)
   # A clean working tree must not hide a bad file in the commit being pushed.
   (root/'.env').write_text('sensitive fixture');git('add','.env');git('commit','-m','Unsafe fixture')
   unsafe=git('rev-parse','HEAD');(root/'.env').unlink()
   with self.assertRaises(PrivacyError):check_revision(root,unsafe,safe)
   git('add','-u');git('commit','-m','Remove unsafe fixture');clean=git('rev-parse','HEAD')
   with self.assertRaises(PrivacyError):check_revision(root,clean,safe)

if __name__=='__main__':unittest.main()
