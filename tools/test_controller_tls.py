#!/usr/bin/env python3
"""Exercise certificate rejection and explicit CA trust against a local TLS server."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
import threading
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'templates/ansible/files'))
import controller


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200);self.end_headers();self.wfile.write(b'LOCAL TLS TEST')

    def log_message(self, *args):
        pass


def main():
    with tempfile.TemporaryDirectory(prefix='alis-controller-tls-') as temp:
        root=Path(temp);cert=root/'ca.pem';key=root/'key.pem';dest=root/'download'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
                        '-keyout',str(key),'-out',str(cert),'-subj','/CN=localhost',
                        '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1',
                        '-addext','basicConstraints=critical,CA:TRUE',
                        '-addext','keyUsage=critical,keyCertSign,digitalSignature,keyEncipherment'],
                       check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        server.socket=context.wrap_socket(server.socket,server_side=True)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        url='https://127.0.0.1:'+str(server.server_port)+'/'
        # A user's curlrc must not silently disable certificate verification.
        (root/'.curlrc').write_text('insecure\n')
        try:
            with patch('controller.sys.platform','darwin'), patch.dict(os.environ,{'CURL_HOME':str(root),'NO_PROXY':'*'},clear=True):
                try:
                    controller.download_file(url,dest)
                except RuntimeError as error:
                    assert 'certificate verification failed' in str(error), str(error)
                else:
                    raise AssertionError('Untrusted certificate was accepted')
                assert not dest.exists()
                os.environ['SSL_CERT_FILE']=str(cert)
                controller.download_file(url,dest)
                assert dest.read_bytes()==b'LOCAL TLS TEST'
        finally:
            server.shutdown();thread.join();server.server_close()
    print('PASS real TLS: an untrusted certificate is rejected despite insecure curlrc; explicit CA trust succeeds.')


if __name__=='__main__':
    main()
