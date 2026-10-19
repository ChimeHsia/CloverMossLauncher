# engine/（M1 起）

C++17 推理引擎。**不依赖 Python、不依赖 torch。**

## 模块

| 目录（计划） | 职责 |
| --- | --- |
| `src/api` | C ABI + HTTP/SSE（`contracts/engine-protocol.md`） |
| `src/pipeline` | 组件编排、staging、降档、取消 |
| `src/model` | `clover.json`、safetensors mmap、键位映射、量化计划 |
| `src/dit` | 42 block 调度、CFG/skip、DMD、LoRA |
| `src/text` | tokenizer、文本分桶、TE 封装 |
| `src/vae` | 分块解码、BN 反归一化、unpatch |
| `src/backend` | `Backend` 接口 + `mnn` / `ref` 实现 |
| `tests/parity` | 与 PyTorch 的逐层/端到端对照 |

## 构建（M0 验证用）

```bash
# MNN 作为固定 tag 的 submodule（M1 引入）
git submodule add https://github.com/alibaba/MNN.git third_party/mnn
git -C third_party/mnn checkout 3.6.1

cmake -S engine -B build/engine -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCLOVER_BACKEND_MNN=ON \
  -DMNN_METAL=ON -DMNN_SUPPORT_TRANSFORMER_FUSE=ON
cmake --build build/engine
```

## 依赖策略

- 允许：MNN、safetensors 解析（自写，约 300 行）、stb_image/stb_image_write、nlohmann/json；
- 禁止：libtorch、onnxruntime（转换期工具除外）、任何 Python 运行时；
- 所有第三方固定版本，许可证随 `NOTICE` 分发。

## 测试策略

1. **逐层 parity**：从官方实现导出小 shape 的输入/输出夹具（fp32），逐 block 比对
   `max_abs_err`、`cos`；
2. **端到端 parity**：固定 prompt/seed，与 diffusers 输出比 LPIPS；
3. **确定性**：同 seed 连续两次逐像素一致；
4. **内存**：在 8/16/24 GB 三档上跑峰值断言；
5. **取消**：注入取消，断言 100 ms 内退出。

## 编码约定

- 错误用 `Result<T, Error>`，不抛异常跨 ABI；
- 张量形状与 dtype 在 debug 构建下全部断言；
- 任何量化/降档决策都写进任务事件，便于用户理解画质变化；
- 不在热路径分配（block 图与缓冲复用）。
