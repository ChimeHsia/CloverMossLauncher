"""Launch the unmodified instance Gradio with the shared local model loader."""
from pathlib import Path
import runpy
import sys

from model_runtime import install_loader

target = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(target.parent))
install_loader()
sys.argv = [str(target), *sys.argv[2:]]
runpy.run_path(str(target), run_name="__main__")
