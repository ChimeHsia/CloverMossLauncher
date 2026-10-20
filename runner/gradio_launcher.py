"""Launch the unmodified instance Gradio with the shared local model loader."""
import os
from pathlib import Path
import runpy
import sys
from urllib.request import getproxies

from model_runtime import install_loader

# Preserve system proxies before NO_PROXY overrides urllib's registry fallback.
proxies = getproxies()
for scheme in ("http", "https", "all"):
    if proxies.get(scheme):
        os.environ.setdefault(f"{scheme.upper()}_PROXY", proxies[scheme])
bypass = []
for value in (os.environ.get("NO_PROXY", ""), os.environ.get("no_proxy", ""),
              proxies.get("no", ""), "localhost,127.0.0.1,::1"):
    bypass.extend(host.strip() for host in value.split(",") if host.strip())
os.environ["NO_PROXY"] = os.environ["no_proxy"] = ",".join(dict.fromkeys(bypass))

target = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(target.parent))
install_loader()
sys.argv = [str(target), *sys.argv[2:]]
runpy.run_path(str(target), run_name="__main__")
