"""Run one local speech engine family over line-delimited JSON on stdin/stdout."""

import base64
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import traceback
import wave


mode, assets_arg, sovits_arg, reference_arg = sys.argv[1:]
assets = Path(assets_arg)
sovits = Path(sovits_arg)
reference = Path(reference_arg)
engines = {}

# Libraries print load and inference logs. Keep those off the response stream.
wire = sys.stdout
sys.stdout = sys.stderr


def recognize(request):
    import numpy as np

    with wave.open(io.BytesIO(base64.b64decode(request['audio'])), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
            raise ValueError('需要 16 kHz 单声道 PCM WAV。')
        frame_count = wav.getnframes()
        if not 1600 <= frame_count <= 30 * 16000:
            raise ValueError('请录制 0.1 到 30 秒的语音。')
        frames = wav.readframes(frame_count)
        if len(frames) != 2 * frame_count:
            raise ValueError('录音数据不完整，请重录。')
    samples = np.frombuffer(frames, dtype='<i2').astype(np.float32) / 32768
    if np.max(np.abs(samples)) < 0.003:
        return {'text': '', 'audioSeconds': frame_count / 16000, 'loadMs': 0, 'inferenceMs': 0}

    engine = request['engine']
    started = time.perf_counter()
    if engine not in engines:
        # 便携 Python 没有执行 setuptools 的 .pth 文件，标点模型仍依赖 distutils。
        import _distutils_hack

        _distutils_hack.add_shim()
        from funasr import AutoModel

        config = {'model': str(assets / 'model')}
        if engine == 'gpt':
            models = sovits / 'tools/asr/models'
            config = {
                'model': str(models / 'speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch'),
                'vad_model': str(models / 'speech_fsmn_vad_zh-cn-16k-common-pytorch'),
                'punc_model': str(models / 'punc_ct-transformer_zh-cn-common-vocab272727-pytorch'),
            }
        # Local paths keep model initialization offline. CPU leaves VRAM for the chat model.
        if not Path(config['model'], 'model.pt').is_file():
            raise RuntimeError('语音识别模型文件尚未就绪。')
        engines[engine] = AutoModel(**config, device='cpu', ncpu=4, disable_update=True, disable_pbar=True)
    loaded = time.perf_counter()
    options = {'language': 'auto', 'use_itn': True} if engine == 'sense' else {}
    result = engines[engine].generate(input=samples, cache={}, **options)
    text = re.sub(r'<\|[^<>]*\|>', '', result[0].get('text', '') if result else '').strip()
    return {'text': text, 'audioSeconds': frame_count / 16000,
            'loadMs': round((loaded - started) * 1000), 'inferenceMs': round((time.perf_counter() - loaded) * 1000)}


def load_melo():
    sys.path.insert(0, str(assets / 'python'))
    import sherpa_onnx

    model = assets / 'vits-melo-tts-zh_en'
    vits = sherpa_onnx.OfflineTtsVitsModelConfig(
        model=str(model / 'model.onnx'), tokens=str(model / 'tokens.txt'),
        lexicon=str(model / 'lexicon.txt'), dict_dir=str(model / 'dict'),
    )
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(vits=vits, num_threads=4, provider='cpu'),
        rule_fsts=','.join(str(model / name) for name in ('phone.fst', 'date.fst', 'number.fst')),
    )
    if not config.validate():
        raise RuntimeError('MeloTTS 模型文件尚未就绪。')
    return sherpa_onnx.OfflineTts(config)


def load_sovits():
    sys.path.insert(0, str(sovits))
    from tools.portable_runtime import activate

    activate(change_cwd=True)
    import torch
    from TTS_infer_pack.TTS import TTS, TTS_Config

    torch.set_num_threads(4)
    cuda = torch.cuda.is_available() and torch.cuda.mem_get_info()[0] >= 5800 * 1024**2
    settings = dict(TTS_Config.default_configs['v5turbo'], device='cuda:0' if cuda else 'cpu', is_half=cuda)
    config = TTS_Config({'custom': settings})
    # GPT-SoVITS saves model settings while loading. Use the experiment's own copy.
    config.configs_path = str(assets / 'gpt-tts-config.yaml')
    return TTS(config)


def speak(request):
    import numpy as np
    import soundfile as sf

    text = request['text']
    started = time.perf_counter()
    if mode == 'melo':
        if mode not in engines:
            engines[mode] = load_melo()
        loaded = time.perf_counter()
        result = engines[mode].generate(text, sid=0, speed=1.0)
        samples, rate = np.asarray(result.samples, dtype=np.float32), result.sample_rate
    else:
        if mode not in engines:
            engines[mode] = load_sovits()
        loaded = time.perf_counter()
        prompt = (reference / 'prompt.txt').read_text(encoding='utf-8-sig').strip()
        rate, samples = next(engines[mode].run({
            'text': text, 'text_lang': 'zh', 'ref_audio_path': str(reference / 'elysia_01.wav'),
            'prompt_text': prompt, 'prompt_lang': 'zh', 'text_split_method': 'cut0',
            'sample_steps': 4, 'fragment_interval': 0.15, 'seed': 42,
        }))
    if not len(samples) or not np.isfinite(samples).all() or np.max(np.abs(samples.astype(np.float32))) < 0.001:
        raise RuntimeError('语音合成返回了静音。')
    output = io.BytesIO()
    sf.write(output, samples, rate, format='WAV', subtype='PCM_16')
    return {'wav': base64.b64encode(output.getvalue()).decode('ascii'),
            'loadMs': round((loaded - started) * 1000), 'inferenceMs': round((time.perf_counter() - loaded) * 1000)}


for line in sys.stdin:
    request = json.loads(line)
    try:
        result = recognize(request) if mode == 'asr' else speak(request)
    except (ValueError, wave.Error, EOFError):
        result = {'error': '无法处理这段音频或文字，请检查后重试。'}
    except Exception:
        traceback.print_exc()
        result = {'error': {'asr': '语音识别失败，请重试。', 'melo': 'MeloTTS 合成失败，请重试。',
                            'gpt': 'GPT-SoVITS 合成失败，请重试。'}[mode]}
    print(json.dumps({'id': request['id'], **result}, ensure_ascii=False), file=wire, flush=True)
