import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
import subprocess


class ModelRuntimeTest(unittest.TestCase):
    def test_gradio_bootstrap_installs_loader_before_importing_official_app(self):
        launcher = Path(__file__).resolve().parents[1] / 'gradio_launcher.py'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'torch.py').write_text("bfloat16='bf16'\nfloat16='fp16'\nfloat32='fp32'\n", encoding='utf-8')
            (root / 'diffusers.py').write_text("class DiffusionPipeline:\n @staticmethod\n def from_pretrained(*a, **kw): return kw\n", encoding='utf-8')
            (root / 'inference_runtime.py').write_text("def load_pipeline(model, local_files_only=False): raise RuntimeError('original loader was used')\n", encoding='utf-8')
            (root / 'gradio_app.py').write_text("from inference_runtime import load_pipeline\nimport json, sys\nprint(json.dumps(load_pipeline(sys.argv[1])))\n", encoding='utf-8')
            (root / 'clover_model.json').write_text(json.dumps({'version': 1, 'components': [{'role': 'dit', 'precision': 'fp16'}]}), encoding='utf-8')
            result = subprocess.run([sys.executable, str(launcher), str(root / 'gradio_app.py'), str(root)], cwd=root, check=True, capture_output=True, text=True)
            result = json.loads(result.stdout)
            self.assertTrue(result['local_files_only'])
            self.assertEqual(result['torch_dtype']['transformer'], 'fp16')

    def test_precision_and_legacy_passthrough(self):
        module_path = Path(__file__).resolve().parents[1] / 'model_runtime.py'
        spec = importlib.util.spec_from_file_location('clover_test_model_runtime', module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        calls = []
        original = dict(sys.modules)
        try:
            runtime = types.ModuleType('inference_runtime')
            runtime.load_pipeline = lambda model, **kw: ('legacy', model, kw)
            sys.modules['inference_runtime'] = runtime
            sys.modules['torch'] = types.SimpleNamespace(bfloat16='bf16', float16='fp16', float32='fp32')
            sys.modules['diffusers'] = types.SimpleNamespace(DiffusionPipeline=types.SimpleNamespace(from_pretrained=lambda *a, **kw: calls.append((a, kw))))
            module.install_loader()
            self.assertEqual(runtime.load_pipeline('team/legacy')[0], 'legacy')
            with tempfile.TemporaryDirectory() as directory:
                Path(directory, 'clover_model.json').write_text(json.dumps({'version': 1, 'components': [
                    {'role': 'dit', 'precision': 'fp16'}, {'role': 'text_encoder', 'precision': 'bf16'}, {'role': 'vae', 'precision': 'fp32'},
                ]}), encoding='utf-8')
                runtime.load_pipeline(directory)
                self.assertTrue(calls[-1][1]['local_files_only'])
                self.assertEqual(calls[-1][1]['torch_dtype'], {'default': 'bf16', 'transformer': 'fp16', 'text_encoder': 'bf16', 'vae': 'fp32'})
        finally:
            for name in ['inference_runtime', 'torch', 'diffusers']:
                if name in original: sys.modules[name] = original[name]
                else: sys.modules.pop(name, None)


if __name__ == '__main__':
    unittest.main()
